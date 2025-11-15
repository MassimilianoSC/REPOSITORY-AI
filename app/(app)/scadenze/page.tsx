'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Calendar, Bell, List } from 'lucide-react';
import { DocumentItem } from '@/lib/types';

const mockScadenze: DocumentItem[] = [
  {
    id: '1',
    docType: 'DURC',
    status: 'yellow',
    issuedAt: '2019-05-10',
    expiresAt: '2025-05-10',
    confidence: 0.87,
    reason: 'Scade tra 6 mesi',
    company: 'Beta Inc',
  },
  {
    id: '2',
    docType: 'Visura Camerale',
    status: 'yellow',
    issuedAt: '2022-08-15',
    expiresAt: '2025-08-15',
    confidence: 0.91,
    reason: 'Rinnovo necessario a breve',
    company: 'Acme Corp',
  },
  {
    id: '3',
    docType: 'Attestato Preposto',
    status: 'red',
    issuedAt: '2015-03-22',
    expiresAt: '2024-03-22',
    confidence: 0.92,
    reason: 'Scaduto',
    company: 'Gamma Ltd',
  },
];

type Tab = 'overview' | 'notifications';

export default function ScadenzePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
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
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-900 uppercase">Scaduti</h3>
                <TrafficLight status="red" />
              </div>
              <p className="text-3xl font-bold text-red-900">1</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-yellow-900 uppercase">In Scadenza</h3>
                <TrafficLight status="yellow" />
              </div>
              <p className="text-3xl font-bold text-yellow-900">2</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-green-900 uppercase">Validi</h3>
                <TrafficLight status="green" />
              </div>
              <p className="text-3xl font-bold text-green-900">12</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Prossime Scadenze</h2>
            <DataTable data={mockScadenze} columns={columns} emptyMessage="Nessuna scadenza imminente" />
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
