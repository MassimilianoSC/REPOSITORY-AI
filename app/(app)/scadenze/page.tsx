'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Calendar, Bell, List } from 'lucide-react';
import { DocumentItem } from '@/lib/types';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebaseClient';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'notifications';

export default function ScadenzePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState({ scaduti: 0, inScadenza: 0, validi: 0 });
  const [loading, setLoading] = useState(true);

  // TODO: Ottieni tenantId da auth context
  const tenantId = 'tenant-demo';

  useEffect(() => {
    const db = getFirebaseDb();
    const now = Timestamp.now();
    const tenDaysFromNow = Timestamp.fromMillis(now.toMillis() + 10 * 24 * 60 * 60 * 1000);

    // Query per documenti con scadenza nei prossimi 30 giorni
    const thirtyDaysFromNow = Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);
    
    const q = query(
      collection(db, `tenants/${tenantId}/companies`),
      // Nota: per collectionGroup servirebbero indici custom
      // Per MVP usiamo una collezione specifica
    );

    // Per MVP, usiamo una query semplificata
    // In produzione, serve collectionGroup con indici
    const unsubscribe = onSnapshot(
      collection(db, `tenants/${tenantId}/companies/Acme Corp/documents`),
      (snapshot) => {
        const docs: DocumentItem[] = [];
        let scaduti = 0;
        let inScadenza = 0;
        let validi = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (!data.isCurrent) return;

          const expiresAt = data.expiresAt?.toDate();
          const issuedAt = data.issuedAt?.toDate();
          const item: DocumentItem = {
            id: doc.id,
            docType: data.docType || 'Sconosciuto',
            company: 'Acme Corp', // TODO: da metadata
            status: data.status || 'gray',
            issuedAt: issuedAt ? issuedAt.toLocaleDateString('it-IT') : 'N/D',
            expiresAt: expiresAt ? expiresAt.toLocaleDateString('it-IT') : 'N/D',
            confidence: data.confidence || 0,
            reason: data.reason || '',
          };

          // Calcola statistiche
          if (expiresAt) {
            const msToExpiry = expiresAt.getTime() - Date.now();
            const daysToExpiry = Math.floor(msToExpiry / (1000 * 60 * 60 * 24));

            if (daysToExpiry < 0) {
              scaduti++;
            } else if (daysToExpiry <= 10) {
              inScadenza++;
              docs.push(item);
            } else if (daysToExpiry <= 30) {
              validi++;
              docs.push(item);
            }
          }
        });

        // Ordina per scadenza (prima i più urgenti)
        docs.sort((a, b) => {
          const dateA = a.expiresAt === 'N/D' ? Infinity : new Date(a.expiresAt.split('/').reverse().join('-')).getTime();
          const dateB = b.expiresAt === 'N/D' ? Infinity : new Date(b.expiresAt.split('/').reverse().join('-')).getTime();
          return dateA - dateB;
        });

        setDocuments(docs);
        setStats({ scaduti, inScadenza, validi });
        setLoading(false);
      },
      (error) => {
        console.error('[Scadenze] Error fetching documents:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId]);

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
          <div className="grid grid-cols-3 gap-6 mb-8">
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

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Prossime Scadenze</h2>
            {loading ? (
              <div className="text-center py-8 text-slate-500">Caricamento...</div>
            ) : (
              <DataTable data={documents} columns={columns} emptyMessage="Nessuna scadenza imminente nei prossimi 30 giorni" />
            )}
          </div>

          <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-slate-700" />
              <h3 className="text-lg font-semibold text-slate-900">Vista Calendario</h3>
            </div>
            <p className="text-slate-600">
              Integrazione calendario in arrivo. Questa sezione mostrerà un calendario visivo con tutte le scadenze dei documenti.
            </p>
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
