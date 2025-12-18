'use client';

import { DataTable } from '@/components/data-table';
import { RequestItem } from '@/lib/types';
import { 
  MessageSquare, Clock, CheckCircle2, XCircle, Archive, 
  Sparkles, TrendingUp, FileStack, Loader2
} from 'lucide-react';

// Mock data rimosso per test puliti - da collegare a Firestore
const mockRequests: RequestItem[] = [];

const statusIcons = {
  pending: Clock,
  in_progress: MessageSquare,
  completed: CheckCircle2,
  failed: XCircle,
};

const statusColors = {
  pending: 'text-amber-500',
  in_progress: 'text-blue-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
};

const statusLabels = {
  pending: 'In Attesa',
  in_progress: 'In Corso',
  completed: 'Completata',
  failed: 'Fallita',
};

export default function RepositoryPage() {
  const columns = [
    {
      key: 'status',
      header: 'Stato',
      render: (req: RequestItem) => {
        const Icon = statusIcons[req.status];
        return (
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg ${
              req.status === 'pending' ? 'bg-amber-100' :
              req.status === 'in_progress' ? 'bg-blue-100' :
              req.status === 'completed' ? 'bg-emerald-100' :
              'bg-red-100'
            } flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${statusColors[req.status]}`} />
            </div>
          </div>
        );
      },
      className: 'w-20',
    },
    {
      key: 'title',
      header: 'Titolo',
      render: (req: RequestItem) => (
        <span className="font-medium text-slate-800">{req.title}</span>
      ),
    },
    {
      key: 'documentId',
      header: 'ID Documento',
      render: (req: RequestItem) => (
        <code className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-mono">
          {req.documentId}
        </code>
      ),
    },
    {
      key: 'createdAt',
      header: 'Creato',
      render: (req: RequestItem) => (
        <span className="text-sm text-slate-500">{req.createdAt}</span>
      ),
    },
  ];

  const statusCounts = {
    pending: mockRequests.filter((r) => r.status === 'pending').length,
    in_progress: mockRequests.filter((r) => r.status === 'in_progress').length,
    completed: mockRequests.filter((r) => r.status === 'completed').length,
    failed: mockRequests.filter((r) => r.status === 'failed').length,
  };

  const total = mockRequests.length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Archive className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-purple-600">
                Repository
              </h1>
              <p className="text-slate-500 mt-1">Monitora le richieste di integrazione e le conversazioni</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-violet-50 rounded-xl border border-violet-200">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-medium text-violet-700">Storico</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="stat-card stat-card-amber">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-100">In Attesa</p>
              <p className="text-4xl font-extrabold mt-2">{statusCounts.pending}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <Clock className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-amber-100 text-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Richieste pendenti</span>
          </div>
        </div>

        <div className="stat-card stat-card-blue">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">In Corso</p>
              <p className="text-4xl font-extrabold mt-2">{statusCounts.in_progress}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-blue-100 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>In elaborazione</span>
          </div>
        </div>

        <div className="stat-card stat-card-green">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-100">Completate</p>
              <p className="text-4xl font-extrabold mt-2">{statusCounts.completed}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-green-100 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Risolte con successo</span>
          </div>
        </div>

        <div className="stat-card stat-card-red">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Fallite</p>
              <p className="text-4xl font-extrabold mt-2">{statusCounts.failed}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-red-100 text-sm">
            <span>Da verificare</span>
          </div>
        </div>
      </div>

      {/* Tabella Richieste */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-purple-50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <FileStack className="w-5 h-5 text-violet-500" />
            Tutte le Richieste
            <span className="ml-2 text-xs font-medium px-2 py-1 bg-violet-100 text-violet-700 rounded-full">
              {total} richieste
            </span>
          </h2>
        </div>
        
        {total === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
              <FileStack className="w-10 h-10 text-violet-400" />
            </div>
            <p className="text-slate-600 font-semibold text-lg">Nessuna richiesta di integrazione</p>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              Le richieste di integrazione appariranno qui quando gli utenti avranno bisogno di chiarimenti sui documenti caricati.
            </p>
          </div>
        ) : (
          <DataTable
            data={mockRequests}
            columns={columns}
            emptyMessage="Nessuna richiesta di integrazione trovata"
          />
        )}
      </div>

      {/* Info Box */}
      <div className="mt-8 p-5 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-200/50 rounded-2xl backdrop-blur-sm">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">💬</span>
          Cos&apos;è il Repository
        </h3>
        <ul className="text-sm text-slate-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">•</span>
            Il repository contiene tutte le <strong>richieste di integrazione</strong> dei documenti
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">•</span>
            Quando un documento necessita di chiarimenti, viene aperta una conversazione
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">•</span>
            Puoi rispondere alle richieste e fornire documenti aggiuntivi
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">•</span>
            Le richieste completate vengono archiviate automaticamente
          </li>
        </ul>
      </div>
    </div>
  );
}
