'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Bell, List, AlertTriangle } from 'lucide-react';
import { ExpiryCalendar } from '@/components/expiry-calendar';
import { DocumentItem } from '@/lib/types';
import { useDocumentsCollectionGroup } from '@/hooks/useFirestore';
import { getExpiresAt, getIssuedAt } from '@/lib/fields';
import { mapBackendToUI } from '@/lib/statusMapper';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'notifications';

export default function ScadenzePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // TODO: Ottieni tenantId da auth context
  const tenantId = 'tenant-demo';

  // 🆕 FIX: Usa lo STESSO hook della Dashboard per coerenza
  const { documents: rawDocs, loading } = useDocumentsCollectionGroup(
    tenantId,
    undefined, // Tutte le aziende
    { limit: 200 }
  );

  // Elabora i documenti per categorizzarli
  const { documents, problemDocs, calendarDocs, stats } = useMemo(() => {
    const docs: DocumentItem[] = [];
    const problems: DocumentItem[] = [];
    const calendar: DocumentItem[] = []; // Tutti i doc con scadenza valida (per calendario)
    let scaduti = 0;
    let inScadenza = 0;
    let validi = 0;
    let problemi = 0;

    rawDocs.forEach((doc) => {
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

      // Gestisci documenti NON VALIDI (rossi)
      if (mappedStatus === 'red') {
        problemi++;
        problems.push(item);
        return; // Non contare nelle altre statistiche
      }

      // Documenti con data scadenza valida → aggiungi al calendario
      if (expiresAt) {
        calendar.push(item); // Tutti i doc con scadenza vanno nel calendario
        
        const msToExpiry = expiresAt.getTime() - Date.now();
        const daysToExpiry = Math.floor(msToExpiry / (1000 * 60 * 60 * 24));

        if (daysToExpiry < 0) {
          scaduti++;
          docs.push(item);
        } else if (daysToExpiry <= 10) {
          inScadenza++;
          docs.push(item);
        } else if (daysToExpiry <= 30) {
          validi++;
          docs.push(item);
        }
      } else if (mappedStatus === 'yellow') {
        // Documento giallo senza scadenza → problema
        problemi++;
        problems.push(item);
      }
    });

    // Ordina per scadenza (prima i più urgenti)
    docs.sort((a, b) => {
      const dateA = a.expiresAt === 'N/D' ? Infinity : new Date(a.expiresAt.split('/').reverse().join('-')).getTime();
      const dateB = b.expiresAt === 'N/D' ? Infinity : new Date(b.expiresAt.split('/').reverse().join('-')).getTime();
      return dateA - dateB;
    });

    return {
      documents: docs,
      problemDocs: problems,
      calendarDocs: calendar,
      stats: { scaduti, inScadenza, validi, problemi }
    };
  }, [rawDocs]);

  const columns = [
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
    },
    {
      key: 'reason',
      header: 'Motivazione',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Scadenze e Notifiche</h1>
        <p className="text-slate-600">Monitora le scadenze dei documenti e gestisci le notifiche</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`
            px-4 py-2 font-medium transition-colors flex items-center gap-2
            ${activeTab === 'overview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <List className="w-4 h-4" />
          Panoramica
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`
            px-4 py-2 font-medium transition-colors flex items-center gap-2
            ${activeTab === 'notifications'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <Bell className="w-4 h-4" />
          Notifiche
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Card statistiche con dati reali */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {/* 🆕 Card Problemi */}
            <div className="bg-red-100 border border-red-300 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-900 uppercase">Problemi</h3>
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-3xl font-bold text-red-900">{loading ? '...' : stats.problemi}</p>
              <p className="text-xs text-red-700 mt-1">Documenti non validi</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-900 uppercase">Scaduti</h3>
                <TrafficLight status="red" />
              </div>
              <p className="text-3xl font-bold text-red-900">{loading ? '...' : stats.scaduti}</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-yellow-900 uppercase">In Scadenza (≤10gg)</h3>
                <TrafficLight status="yellow" />
              </div>
              <p className="text-3xl font-bold text-yellow-900">{loading ? '...' : stats.inScadenza}</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-green-900 uppercase">Validi (≤30gg)</h3>
                <TrafficLight status="green" />
              </div>
              <p className="text-3xl font-bold text-green-900">{loading ? '...' : stats.validi}</p>
            </div>
          </div>

          {/* 🆕 Sezione Documenti con Problemi */}
          {problemDocs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-red-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Documenti con Problemi
              </h2>
              <DataTable 
                data={problemDocs} 
                columns={columns} 
                emptyMessage="" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Prossime Scadenze</h2>
            {loading ? (
              <div className="text-center py-8 text-slate-500">Caricamento...</div>
            ) : (
              <DataTable 
                data={documents} 
                columns={columns} 
                emptyMessage="Nessuna scadenza imminente nei prossimi 30 giorni" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            )}
          </div>

          {/* Calendario scadenze */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Calendario Scadenze</h2>
            <ExpiryCalendar 
              documents={calendarDocs}
              onDayClick={(date, docs) => {
                if (docs.length === 1) {
                  router.push(`/document?id=${docs[0].id}&tid=${tenantId}`);
                }
              }}
            />
          </div>
        </>
      )}

      {activeTab === 'notifications' && (
        <div className="max-w-4xl">
          <NotificationList />
        </div>
      )}
    </div>
  );
}
