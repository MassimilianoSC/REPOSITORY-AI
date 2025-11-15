'use client';

import { DataTable } from '@/components/data-table';
import { RequestItem } from '@/lib/types';
import { MessageSquare, Clock, CheckCircle2, XCircle } from 'lucide-react';

const mockRequests: RequestItem[] = [
  {
    id: '1',
    documentId: 'doc-123',
    title: 'Richiesta pagine aggiuntive DURC',
    status: 'completed',
    createdAt: '2025-11-01',
  },
  {
    id: '2',
    documentId: 'doc-456',
    title: 'Chiarire data scadenza Attestato Preposto',
    status: 'in_progress',
    createdAt: '2025-11-03',
  },
  {
    id: '3',
    documentId: 'doc-789',
    title: 'Verificare firma su DVR',
    status: 'pending',
    createdAt: '2025-11-04',
  },
  {
    id: '4',
    documentId: 'doc-321',
    title: 'Richied scansione ad alta risoluzione Visura',
    status: 'failed',
    createdAt: '2025-11-02',
  },
];

const statusIcons = {
  pending: Clock,
  in_progress: MessageSquare,
  completed: CheckCircle2,
  failed: XCircle,
};

const statusColors = {
  pending: 'text-slate-500',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

export default function RepositoryPage() {
  const columns = [
    {
      key: 'status',
      header: 'Stato',
      render: (req: RequestItem) => {
        const Icon = statusIcons[req.status];
        return <Icon className={`w-5 h-5 ${statusColors[req.status]}`} />;
      },
      className: 'w-16',
    },
    {
      key: 'title',
      header: 'Titolo',
    },
    {
      key: 'documentId',
      header: 'ID Documento',
    },
    {
      key: 'createdAt',
      header: 'Creato',
    },
  ];

  const statusCounts = {
    pending: mockRequests.filter((r) => r.status === 'pending').length,
    in_progress: mockRequests.filter((r) => r.status === 'in_progress').length,
    completed: mockRequests.filter((r) => r.status === 'completed').length,
    failed: mockRequests.filter((r) => r.status === 'failed').length,
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Richieste Integrazione</h1>
        <p className="text-slate-600">Monitora le richieste di integrazione e le conversazioni sui documenti</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase">In Attesa</h3>
            <Clock className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{statusCounts.pending}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase">In Corso</h3>
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{statusCounts.in_progress}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase">Completate</h3>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{statusCounts.completed}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase">Fallite</h3>
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{statusCounts.failed}</p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Tutte le Richieste</h2>
        <DataTable
          data={mockRequests}
          columns={columns}
          emptyMessage="Nessuna richiesta di integrazione trovata"
        />
      </div>
    </div>
  );
}
