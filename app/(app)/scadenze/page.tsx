'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Bell, Calendar, AlertTriangle, Loader2, Building2, Clock, CheckCircle2, XCircle, FileWarning } from 'lucide-react';
import { ExpiryCalendar } from '@/components/expiry-calendar';
import { DocumentItem } from '@/lib/types';
import { useDocumentsCollectionGroup, useMultiCompanyDocuments } from '@/hooks/useFirestore';
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

  // ✅ STABILIZZA: Memorizza i valori per evitare re-render infiniti
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const stableCompanyIds = useMemo(() => companyIds, [companyIds.join(',')]);
  const stableTenantId = tenantId || '';
  
  // ✅ FIX QUERY: Usa hook diversi in base al ruolo
  // Hook per manager/verifier
  const { documents: managerDocs, loading: managerLoading } = useDocumentsCollectionGroup(
    isManagerOrVerifier ? stableTenantId : '',
    undefined,
    { limit: 200 }
  );

  // Hook per uploader (query per-azienda)
  const { documents: uploaderDocs, loading: uploaderLoading } = useMultiCompanyDocuments(
    !isManagerOrVerifier && !authLoading ? stableTenantId : '',
    !isManagerOrVerifier && !authLoading ? stableCompanyIds : [],
    { limit: 200 }
  );

  // Seleziona i documenti in base al ruolo
  const rawDocs = isManagerOrVerifier ? managerDocs : uploaderDocs;
  const docsLoading = isManagerOrVerifier ? managerLoading : uploaderLoading;

  const loading = authLoading || docsLoading;

  // I documenti sono già filtrati dall'hook corretto
  const accessibleDocs = rawDocs;

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
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient-warm">
                Scadenze e Notifiche
              </h1>
              <p className="text-slate-500 mt-1">Monitora scadenze e problemi in tempo reale</p>
            </div>
          </div>
        </div>
      </div>

      {/* Banner per uploader */}
      {role === 'uploader' && companyIds.length > 0 && (
        <div className="mb-6 p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/50 rounded-2xl flex items-start gap-4 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/25">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              Aziende monitorate: <span className="text-blue-600">{companyIds.join(', ')}</span>
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Visualizzi solo le scadenze delle tue aziende assegnate.
            </p>
          </div>
        </div>
      )}

      {/* TAB NAVIGATION - Modern design */}
      <div className="flex gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl w-fit">
        {/* Tab Scadenze */}
        <button
          onClick={() => setActiveTab('scadenze')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'scadenze'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <Calendar className="w-4 h-4" />
          Scadenze
          {(stats.scaduti + stats.inScadenza) > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              stats.scaduti > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {stats.scaduti + stats.inScadenza}
            </span>
          )}
        </button>

        {/* Tab Problemi */}
        <button
          onClick={() => setActiveTab('problemi')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'problemi'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <FileWarning className="w-4 h-4" />
          Problemi
          {stats.totaleProblemi > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-500 text-white font-bold">
              {stats.totaleProblemi}
            </span>
          )}
        </button>

        {/* Tab Notifiche */}
        <button
          onClick={() => setActiveTab('notifiche')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'notifiche'
              ? 'bg-white text-teal-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
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
          {/* Card statistiche scadenze - Modern gradient cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="stat-card stat-card-red">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-100">Scaduti</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.scaduti}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <XCircle className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-sm text-red-100 mt-4">Richiedono azione immediata</p>
            </div>

            <div className="stat-card stat-card-amber">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-100">In Scadenza</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.inScadenza}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Clock className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-sm text-amber-100 mt-4">Entro 10 giorni</p>
            </div>

            <div className="stat-card stat-card-green">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-100">In Regola</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.validi}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-sm text-green-100 mt-4">Documenti validi</p>
            </div>
          </div>

          {/* Tabella scadenze */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                Prossime Scadenze
              </h2>
            </div>
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
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-500" />
                Calendario Scadenze
              </h2>
            </div>
            <div className="p-6">
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
        </div>
      )}

      {/* ==================== TAB PROBLEMI ==================== */}
      {activeTab === 'problemi' && (
        <div className="space-y-6">
          {/* Header problemi */}
          {stats.totaleProblemi > 0 ? (
            <div className="stat-card stat-card-red">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {stats.totaleProblemi} {stats.totaleProblemi === 1 ? 'documento richiede' : 'documenti richiedono'} attenzione
                  </h3>
                  <p className="text-red-100 mt-2">
                    Clicca su un documento per vedere i dettagli e caricare una nuova versione.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="stat-card stat-card-green text-center py-10">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-80" />
              <h3 className="text-2xl font-bold">Tutto a posto!</h3>
              <p className="text-green-100 mt-2">
                Non ci sono documenti con problemi al momento.
              </p>
            </div>
          )}

          {/* Tabella problemi */}
          {problemDocs.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-red-50 to-rose-50">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-500" />
                  Documenti con Problemi
                </h2>
              </div>
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
            <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-blue-200/50 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="text-xl">💡</span>
                Come risolvere
              </h3>
              <ol className="text-slate-700 space-y-2 list-decimal list-inside">
                <li>Clicca sul documento per vedere il dettaglio del problema</li>
                <li>Scarica o verifica il documento originale</li>
                <li>Carica una nuova versione corretta dalla pagina <strong className="text-teal-600">Upload</strong></li>
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
