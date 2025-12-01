'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDocumentsCollectionGroup } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { DocumentItem } from '@/lib/types';
import { Filter, Loader2, AlertTriangle, Building2, LayoutDashboard } from 'lucide-react';
import { mapBackendToUI } from '@/lib/statusMapper';
import { getIssuedAt, getExpiresAt, fmtDate, getConfidence } from '@/lib/fields';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const router = useRouter();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ✅ FIX: Usa hook useAuth per ottenere tenantId, role e companyIds
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();

  // FIX DEV: Usa collectionGroup invece del path (risolve problema encoding "Acme Corp")
  const { documents: firestoreDocs, loading: docsLoading } = useDocumentsCollectionGroup(
    tenantId || '', // Passa stringa vuota se null
    undefined, // Nessun filtro per companyId (mostra tutte)
    { limit: 200 }
  );

  const loading = authLoading || docsLoading;

  // ✅ RBAC: Filtra documenti in base al ruolo
  // - manager/verifier: vedono TUTTI i documenti
  // - uploader: vede SOLO i documenti delle sue aziende (company_ids)
  const accessibleDocs = useMemo(() => {
    if (role === 'manager' || role === 'verifier') {
      return firestoreDocs; // Accesso completo
    }
    // Uploader: filtra per company_ids
    if (companyIds.length === 0) {
      return []; // Nessuna azienda assegnata
    }
    return firestoreDocs.filter((doc) => 
      companyIds.includes(doc.companyId)
    );
  }, [firestoreDocs, role, companyIds]);

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
  }));

  const filteredDocuments = documents.filter((doc) => {
    if (companyFilter && doc.company !== companyFilter) return false;
    if (statusFilter && doc.status !== statusFilter) return false;
    return true;
  });

  const uniqueCompanies = Array.from(new Set(documents.map((d) => d.company)));

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
      key: 'reason',
      header: 'Motivazione',
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
      {/* Header con gradiente */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/25">
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-slate-500">Gestisci e controlla i tuoi documenti</p>
          </div>
        </div>
      </div>

      {/* Banner per uploader */}
      {role === 'uploader' && companyIds.length > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl flex items-start gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-900">
              Stai visualizzando i documenti di: {companyIds.join(', ')}
            </p>
            <p className="text-xs text-teal-700 mt-1">
              Contatta l'amministratore se hai bisogno di accedere ad altre aziende.
            </p>
          </div>
        </div>
      )}

      {/* Filtri con card */}
      <div className="mb-6 p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="company-filter" className="block text-sm font-semibold text-slate-700 mb-2">
              <Filter className="w-4 h-4 inline mr-2 text-teal-500" />
              Filtra per Azienda
            </label>
            <select
              id="company-filter"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-slate-50 transition-all"
            >
              <option value="">Tutte le Aziende</option>
              {uniqueCompanies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label htmlFor="status-filter" className="block text-sm font-semibold text-slate-700 mb-2">
              <Filter className="w-4 h-4 inline mr-2 text-teal-500" />
              Filtra per Stato
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-slate-50 transition-all"
            >
              <option value="">Tutti gli Stati</option>
              <option value="green">🟢 Verde - Valido</option>
              <option value="yellow">🟡 Giallo - Attenzione</option>
              <option value="red">🔴 Rosso - Problema</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabella con card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
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
