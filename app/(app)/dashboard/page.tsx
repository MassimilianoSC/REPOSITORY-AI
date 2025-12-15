'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDocumentsCollectionGroup, useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { DocumentItem } from '@/lib/types';
import { 
  Filter, Loader2, AlertTriangle, Building2, LayoutDashboard, 
  CheckCircle2, Clock, XCircle, FileText, TrendingUp, Sparkles, Eye
} from 'lucide-react';
import { DownloadButton } from '@/components/DownloadButton';
import { mapBackendToUI } from '@/lib/statusMapper';
import { getIssuedAt, getExpiresAt, fmtDate, getConfidence } from '@/lib/fields';
import { useAuth } from '@/hooks/useAuth';

// ✅ Array vuoto stabile (evita re-render)
const EMPTY_ARRAY: string[] = [];

export default function DashboardPage() {
  const router = useRouter();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ✅ FIX: Usa hook useAuth per ottenere tenantId, role e companyIds (già stabile)
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();

  // Determina il tipo di utente
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const tid = tenantId || '';

  // ✅ FIX QUERY: Usa hook diversi in base al ruolo
  // Hook per manager/verifier (collectionGroup su tutto il tenant)
  const { documents: managerDocs, loading: managerLoading } = useDocumentsCollectionGroup(
    isManagerOrVerifier && !authLoading ? tid : '',
    undefined,
    { limit: 200 }
  );

  // Hook per uploader (query per-azienda, evita permission error)
  const { documents: uploaderDocs, loading: uploaderLoading } = useMultiCompanyDocuments(
    !isManagerOrVerifier && !authLoading ? tid : '',
    !isManagerOrVerifier && !authLoading ? companyIds : EMPTY_ARRAY,
    { limit: 200 }
  );

  // Seleziona i documenti in base al ruolo
  const firestoreDocs = isManagerOrVerifier ? managerDocs : uploaderDocs;
  const docsLoading = isManagerOrVerifier ? managerLoading : uploaderLoading;

  const loading = authLoading || docsLoading;

  // I documenti sono già filtrati in base al ruolo dall'hook corretto
  const accessibleDocs = firestoreDocs;

  // Map Firestore documents to UI format
  const documents: DocumentItem[] = accessibleDocs.map((doc) => ({
    id: doc.id,
    docType: doc.docType || 'Unknown',
    status: mapBackendToUI(doc.overall?.status || doc.status),
    issuedAt: fmtDate(getIssuedAt(doc)),
    expiresAt: fmtDate(getExpiresAt(doc)),
    confidence: getConfidence(doc),
    reason: doc.overall?.reason || doc.reason || 'Processing...',
    company: doc.companyId || 'Unknown',
    tenant: tenantId || undefined,
    blobName: doc.blobName || undefined,
    source: doc.source || 'ai', // Default: AI per documenti esistenti
  }));

  const filteredDocuments = documents.filter((doc) => {
    if (companyFilter && doc.company !== companyFilter) return false;
    if (statusFilter && doc.status !== statusFilter) return false;
    return true;
  });

  const uniqueCompanies = Array.from(new Set(documents.map((d) => d.company)));

  // ✅ FIX #310: useMemo DEVE essere PRIMA di qualsiasi return condizionale
  const stats = useMemo(() => {
    const list = documents ?? [];
    const green = list.filter(d => d.status === 'green').length;
    const yellow = list.filter(d => d.status === 'yellow').length;
    const red = list.filter(d => d.status === 'red').length;
    const total = list.length;
    return { green, yellow, red, total };
  }, [documents]);

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
      header: 'Impresa',
    },
    {
      key: 'issuedAt',
      header: 'Emesso',
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
    },
    {
      key: 'confidence',
      header: 'Affidabilità',
      render: (doc: DocumentItem) => `${(doc.confidence * 100).toFixed(0)}%`,
    },
    {
      key: 'source',
      header: 'Fonte',
      render: (doc: DocumentItem) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          doc.source === 'direct' 
            ? 'bg-slate-100 text-slate-600' 
            : 'bg-purple-100 text-purple-700'
        }`}>
          {doc.source === 'direct' ? '📁 Diretto' : '🤖 AI'}
        </span>
      ),
      className: 'w-24',
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: DocumentItem) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/document?id=${doc.id}&tid=${tenantId}`);
            }}
            className="p-2 rounded-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 text-slate-500"
            title="Visualizza dettagli"
          >
            <Eye className="w-4 h-4" />
          </button>
          {doc.blobName && (
            <DownloadButton 
              blobName={doc.blobName} 
              variant="icon"
              fileName={`${doc.docType}_${doc.company}.pdf`}
            />
          )}
        </div>
      ),
      className: 'w-24',
    },
  ];

  // ✅ Return condizionali DOPO tutti gli hook
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
      {/* Header con gradiente */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
              <LayoutDashboard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient">
                Dashboard
              </h1>
              <p className="text-slate-500 mt-1">Panoramica dei tuoi documenti aziendali</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-teal-50 rounded-xl border border-teal-200">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-medium text-teal-700">AI-Powered</span>
          </div>
        </div>
      </div>

      {/* Statistiche colorate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="stat-card stat-card-blue">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Totale Documenti</p>
              <p className="text-4xl font-extrabold mt-2">{stats.total}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <FileText className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-blue-100 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>Documenti caricati</span>
          </div>
        </div>

        <div className="stat-card stat-card-green">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-100">Validi</p>
              <p className="text-4xl font-extrabold mt-2">{stats.green}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-green-100 text-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Documenti conformi</span>
          </div>
        </div>

        <div className="stat-card stat-card-amber">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-100">In Scadenza</p>
              <p className="text-4xl font-extrabold mt-2">{stats.yellow}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <Clock className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-amber-100 text-sm">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Richiedono attenzione</span>
          </div>
        </div>

        <div className="stat-card stat-card-red">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Problemi</p>
              <p className="text-4xl font-extrabold mt-2">{stats.red}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-red-100 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Da verificare</span>
          </div>
        </div>
      </div>

      {/* Banner per uploader */}
      {role === 'uploader' && companyIds.length > 0 && (
        <div className="mb-6 p-5 bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 border border-teal-200/50 rounded-2xl flex items-start gap-4 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-teal-500/25">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              Imprese assegnate: <span className="text-teal-600">{companyIds.join(', ')}</span>
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Visualizzi solo i documenti delle tue imprese. Contatta l&apos;amministratore per accedere ad altre.
            </p>
          </div>
        </div>
      )}

      {/* Filtri con card */}
      <div className="mb-6 p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <Filter className="w-4 h-4 text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Filtri</h3>
        </div>
        <div className="flex gap-4">
        <div className="flex-1">
            <label htmlFor="company-filter" className="block text-sm font-medium text-slate-600 mb-2">
              Impresa
          </label>
          <select
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
              className="input-modern"
          >
            <option value="">Tutte le Imprese</option>
            {uniqueCompanies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
            <label htmlFor="status-filter" className="block text-sm font-medium text-slate-600 mb-2">
              Stato Documento
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
              className="input-modern"
          >
            <option value="">Tutti gli Stati</option>
              <option value="green">✓ Valido</option>
              <option value="yellow">⏳ In Scadenza</option>
              <option value="red">✕ Problema</option>
          </select>
          </div>
        </div>
      </div>

      {/* Tabella con card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-500" />
            Elenco Documenti
            <span className="ml-2 text-xs font-medium px-2 py-1 bg-teal-100 text-teal-700 rounded-full">
              {filteredDocuments.length} risultati
            </span>
          </h3>
        </div>
      <DataTable
        data={filteredDocuments}
        columns={columns}
        loading={loading}
        onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
          emptyMessage="Nessun documento trovato. Carica il tuo primo documento per iniziare!"
      />
      </div>
    </div>
  );
}
