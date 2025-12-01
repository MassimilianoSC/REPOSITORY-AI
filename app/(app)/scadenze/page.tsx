'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Bell, Calendar, AlertTriangle, Loader2, Building2, Clock, CheckCircle2, XCircle, FileWarning } from 'lucide-react';
import { ExpiryCalendar } from '@/components/expiry-calendar';
import { DocumentItem } from '@/lib/types';
import { useDocumentsCollectionGroup } from '@/hooks/useFirestore';
import { getExpiresAt, getIssuedAt } from '@/lib/fields';
import { mapBackendToUI } from '@/lib/statusMapper';
import { useAuth } from '@/hooks/useAuth';

export const dynamic = 'force-dynamic';

type Tab = 'scadenze' | 'problemi' | 'notifiche';

export default function ScadenzePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('scadenze');

  // ✅ FIX: Ottieni tenantId, role e companyIds da auth hook
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();

  // 🆕 FIX: Usa lo STESSO hook della Dashboard per coerenza
  const { documents: rawDocs, loading: docsLoading } = useDocumentsCollectionGroup(
    tenantId || '',
    undefined,
    { limit: 200 }
  );

  const loading = authLoading || docsLoading;

  // ✅ RBAC: Filtra documenti in base al ruolo
  const accessibleDocs = useMemo(() => {
    if (role === 'manager' || role === 'verifier') {
      return rawDocs;
    }
    if (companyIds.length === 0) {
      return [];
    }
    return rawDocs.filter((doc) => companyIds.includes(doc.companyId));
  }, [rawDocs, role, companyIds]);

  // Elabora i documenti separando SCADENZE da PROBLEMI
  const { scadenzeDocs, problemDocs, calendarDocs, stats } = useMemo(() => {
    const scadenze: DocumentItem[] = [];
    const problemi: DocumentItem[] = [];
    const calendar: DocumentItem[] = [];
    
    let scaduti = 0;
    let inScadenza = 0;
    let validi = 0;
    let totaleProblemi = 0;

    accessibleDocs.forEach((doc) => {
      const expiresAt = getExpiresAt(doc);
      const issuedAt = getIssuedAt(doc);
      const mappedStatus = mapBackendToUI(doc.overall?.status || doc.status);
      
      const item: DocumentItem = {
        id: doc.id,
        docType: doc.docType || 'Sconosciuto',
        company: doc.companyId || 'N/D',
        status: mappedStatus,
        issuedAt: issuedAt ? issuedAt.toLocaleDateString('it-IT') : 'N/D',
        expiresAt: expiresAt ? expiresAt.toLocaleDateString('it-IT') : 'N/D',
        confidence: doc.confidence || 0,
        reason: doc.reason || doc.overall?.reason || '',
      };

      // PROBLEMI: documenti rossi (non validi) vanno nel tab Problemi
      if (mappedStatus === 'red') {
        totaleProblemi++;
        problemi.push(item);
        return; // Non processare come scadenza
      }

      // SCADENZE: documenti con data scadenza valida
      if (expiresAt) {
        calendar.push(item);
        
        const msToExpiry = expiresAt.getTime() - Date.now();
        const daysToExpiry = Math.floor(msToExpiry / (1000 * 60 * 60 * 24));

        if (daysToExpiry < 0) {
          scaduti++;
          scadenze.push(item);
        } else if (daysToExpiry <= 10) {
          inScadenza++;
          scadenze.push(item);
        } else if (daysToExpiry <= 30) {
          validi++;
          scadenze.push(item);
        }
      } else if (mappedStatus === 'yellow') {
        // Documento giallo senza scadenza → problema
        totaleProblemi++;
        problemi.push(item);
      }
    });

    // Ordina scadenze per data (prima i più urgenti)
    scadenze.sort((a, b) => {
      const dateA = a.expiresAt === 'N/D' ? Infinity : new Date(a.expiresAt.split('/').reverse().join('-')).getTime();
      const dateB = b.expiresAt === 'N/D' ? Infinity : new Date(b.expiresAt.split('/').reverse().join('-')).getTime();
      return dateA - dateB;
    });

    return {
      scadenzeDocs: scadenze,
      problemDocs: problemi,
      calendarDocs: calendar,
      stats: { scaduti, inScadenza, validi, totaleProblemi }
    };
  }, [accessibleDocs]);

  const scadenzeColumns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-16',
    },
    {
      key: 'docType',
      header: 'Tipo Documento',
    },
    {
      key: 'company',
      header: 'Azienda',
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
      render: (doc: DocumentItem) => {
        if (doc.expiresAt === 'N/D') return <span className="text-slate-400">N/D</span>;
        
        const parts = doc.expiresAt.split('/');
        const expDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const daysLeft = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        let colorClass = 'text-slate-900';
        let badge = null;
        
        if (daysLeft < 0) {
          colorClass = 'text-red-600 font-semibold';
          badge = <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">SCADUTO</span>;
        } else if (daysLeft <= 10) {
          colorClass = 'text-orange-600 font-medium';
          badge = <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">{daysLeft}gg</span>;
        } else if (daysLeft <= 30) {
          colorClass = 'text-yellow-700';
          badge = <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">{daysLeft}gg</span>;
        }
        
        return (
          <span className={colorClass}>
            {doc.expiresAt}
            {badge}
          </span>
        );
      },
    },
  ];

  const problemiColumns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-16',
    },
    {
      key: 'docType',
      header: 'Tipo Documento',
    },
    {
      key: 'company',
      header: 'Azienda',
    },
    {
      key: 'reason',
      header: 'Problema',
      render: (doc: DocumentItem) => (
        <span className="text-red-700">{doc.reason || 'Documento non valido'}</span>
      ),
    },
  ];

  // Loading state durante autenticazione
  if (authLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  // Utente non autenticato
  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Scadenze e Notifiche</h1>
        <p className="text-slate-600">Monitora le scadenze dei documenti e i problemi da risolvere</p>
      </div>

      {/* Banner per uploader */}
      {role === 'uploader' && companyIds.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              Stai visualizzando i dati di: {companyIds.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* TAB NAVIGATION - Redesign con 3 tab chiari */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {/* Tab Scadenze */}
        <button
          onClick={() => setActiveTab('scadenze')}
          className={`
            px-5 py-3 font-medium transition-colors flex items-center gap-2 rounded-t-lg
            ${activeTab === 'scadenze'
              ? 'bg-white text-blue-600 border border-slate-200 border-b-white -mb-px'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }
          `}
        >
          <Calendar className="w-4 h-4" />
          Scadenze
          {(stats.scaduti + stats.inScadenza) > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              stats.scaduti > 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {stats.scaduti + stats.inScadenza}
            </span>
          )}
        </button>

        {/* Tab Problemi */}
        <button
          onClick={() => setActiveTab('problemi')}
          className={`
            px-5 py-3 font-medium transition-colors flex items-center gap-2 rounded-t-lg
            ${activeTab === 'problemi'
              ? 'bg-white text-red-600 border border-slate-200 border-b-white -mb-px'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }
          `}
        >
          <FileWarning className="w-4 h-4" />
          Problemi
          {stats.totaleProblemi > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {stats.totaleProblemi}
            </span>
          )}
        </button>

        {/* Tab Notifiche */}
        <button
          onClick={() => setActiveTab('notifiche')}
          className={`
            px-5 py-3 font-medium transition-colors flex items-center gap-2 rounded-t-lg
            ${activeTab === 'notifiche'
              ? 'bg-white text-blue-600 border border-slate-200 border-b-white -mb-px'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }
          `}
        >
          <Bell className="w-4 h-4" />
          Notifiche
        </button>
      </div>

      {/* ==================== TAB SCADENZE ==================== */}
      {activeTab === 'scadenze' && (
        <div className="space-y-8">
          {/* Card statistiche scadenze */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-900 uppercase">Scaduti</h3>
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-3xl font-bold text-red-900">{loading ? '...' : stats.scaduti}</p>
              <p className="text-xs text-red-700 mt-1">Richiedono azione immediata</p>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-orange-900 uppercase">In Scadenza</h3>
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <p className="text-3xl font-bold text-orange-900">{loading ? '...' : stats.inScadenza}</p>
              <p className="text-xs text-orange-700 mt-1">Entro 10 giorni</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-green-900 uppercase">In Regola</h3>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-3xl font-bold text-green-900">{loading ? '...' : stats.validi}</p>
              <p className="text-xs text-green-700 mt-1">Scadenza entro 30 giorni</p>
            </div>
          </div>

          {/* Tabella scadenze */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-600" />
              Prossime Scadenze
            </h2>
            {loading ? (
              <div className="text-center py-8 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Caricamento...
              </div>
            ) : (
              <DataTable 
                data={scadenzeDocs} 
                columns={scadenzeColumns} 
                emptyMessage="🎉 Nessuna scadenza imminente nei prossimi 30 giorni" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            )}
          </div>

          {/* Calendario scadenze */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-slate-600" />
              Calendario
            </h2>
            <ExpiryCalendar 
              documents={calendarDocs}
              onDayClick={(date, docs) => {
                if (docs.length === 1) {
                  router.push(`/document?id=${docs[0].id}&tid=${tenantId}`);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* ==================== TAB PROBLEMI ==================== */}
      {activeTab === 'problemi' && (
        <div className="space-y-6">
          {/* Header problemi */}
          {stats.totaleProblemi > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-5">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-900">
                    {stats.totaleProblemi} {stats.totaleProblemi === 1 ? 'documento richiede' : 'documenti richiedono'} attenzione
                  </h3>
                  <p className="text-sm text-red-700 mt-1">
                    Questi documenti sono stati validati come non idonei o presentano problemi.
                    Clicca su un documento per vedere i dettagli e caricare una nuova versione.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-green-900">Tutto a posto!</h3>
              <p className="text-sm text-green-700 mt-1">
                Non ci sono documenti con problemi al momento.
              </p>
            </div>
          )}

          {/* Tabella problemi */}
          {problemDocs.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-red-500" />
                Documenti con Problemi
              </h2>
              <DataTable 
                data={problemDocs} 
                columns={problemiColumns} 
                emptyMessage="" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            </div>
          )}

          {/* Guida per risolvere i problemi */}
          {problemDocs.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
              <h3 className="font-semibold text-blue-900 mb-2">💡 Come risolvere</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Clicca sul documento per vedere il dettaglio del problema</li>
                <li>Scarica o verifica il documento originale</li>
                <li>Carica una nuova versione corretta dalla pagina <strong>Upload</strong></li>
                <li>Il sistema verificherà automaticamente il nuovo documento</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB NOTIFICHE ==================== */}
      {activeTab === 'notifiche' && (
        <div className="max-w-4xl">
          <NotificationList />
        </div>
      )}
    </div>
  );
}
