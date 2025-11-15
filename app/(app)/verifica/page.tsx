'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Clock, AlertCircle } from 'lucide-react';
import { TrafficLight } from '@/components/traffic-light';
import { useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';

export default function VerificaPage() {
  const router = useRouter();
  const tenant = 'tenant-demo';
  const companies = ['acme', 'beta', 'gamma'];

  // Filtri
  const [companyFilter, setCompanyFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  // Carica tutti i documenti
  const { documents, loading, error } = useMultiCompanyDocuments(tenant, companies);

  // Filtra documenti per coda verifica
  const filteredDocuments = documents.filter((doc) => {
    // Escludi documenti "non pertinente"
    if (doc.overall?.nonPertinente === true) return false;

    // Filtro azienda
    if (companyFilter && doc.company !== companyFilter) return false;

    // Filtro docType
    if (docTypeFilter && doc.docType !== docTypeFilter) return false;

    // Filtro status
    if (statusFilter) {
      if (statusFilter === 'pending' && doc.overall?.status !== 'gray') return false;
      if (statusFilter === 'to_review' && doc.overall?.status !== 'yellow') return false;
      if (statusFilter === 'non_idoneo' && doc.overall?.status !== 'red') return false;
    }

    // Filtro "in scadenza ≤10 giorni"
    if (onlyExpiring) {
      if (!doc.extracted?.expiresAt) return false;
      const expiresAt = new Date(doc.extracted.expiresAt);
      const today = new Date();
      const diffDays = Math.floor((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 10 || diffDays < 0) return false;
    }

    return true;
  });

  const uniqueCompanies = Array.from(new Set(documents.map((d) => d.company)));
  const uniqueDocTypes = Array.from(new Set(documents.map((d) => d.docType)));

  const columns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: any) => <TrafficLight status={doc.overall?.status || 'gray'} />,
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
      key: 'uploadedAt',
      header: 'Caricato il',
      render: (doc: any) => {
        if (!doc.metadata?.uploadedAt) return '-';
        const date = new Date(doc.metadata.uploadedAt);
        return date.toLocaleDateString('it-IT');
      },
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
      render: (doc: any) => {
        if (!doc.extracted?.expiresAt) return '-';
        const expiresAt = new Date(doc.extracted.expiresAt);
        const today = new Date();
        const diffDays = Math.floor((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let className = 'text-slate-600';
        if (diffDays <= 10 && diffDays > 0) className = 'text-orange-600 font-medium';
        if (diffDays <= 0) className = 'text-red-600 font-medium';

        return (
          <span className={className}>
            {expiresAt.toLocaleDateString('it-IT')}
            {diffDays <= 10 && diffDays > 0 && (
              <span className="ml-2 text-xs">
                <Clock className="w-3 h-3 inline" /> {diffDays}gg
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: any) => (
        <button
          onClick={() => router.push(`/document/${doc.id}`)}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
        >
          Verifica
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento coda...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Errore</h1>
          <p className="text-slate-600 mb-6">{String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Coda Verifica</h1>
        <p className="text-slate-600">
          {filteredDocuments.length} documenti da verificare
          {onlyExpiring && ' (in scadenza ≤10 giorni)'}
        </p>
      </div>

      {/* Filtri */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Filtro Azienda */}
        <div>
          <label htmlFor="company-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Azienda
          </label>
          <select
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Tutte</option>
            {uniqueCompanies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro DocType */}
        <div>
          <label htmlFor="doctype-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Tipo Documento
          </label>
          <select
            id="doctype-filter"
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Tutti</option>
            {uniqueDocTypes.map((docType) => (
              <option key={docType} value={docType}>
                {docType}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Status */}
        <div>
          <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Stato
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Tutti</option>
            <option value="pending">In attesa (grigio)</option>
            <option value="to_review">Da rivedere (giallo)</option>
            <option value="non_idoneo">Non idoneo (rosso)</option>
          </select>
        </div>

        {/* Filtro Scadenza */}
        <div>
          <label htmlFor="expiring-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Clock className="w-4 h-4 inline mr-1" />
            Scadenze
          </label>
          <button
            onClick={() => setOnlyExpiring(!onlyExpiring)}
            className={`w-full px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
              onlyExpiring
                ? 'bg-orange-100 border-orange-500 text-orange-900'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {onlyExpiring ? '✓ Solo ≤10 giorni' : 'Tutte le scadenze'}
          </button>
        </div>
      </div>

      {/* Tabella Documenti */}
      <DataTable
        columns={columns}
        data={filteredDocuments}
        emptyMessage="Nessun documento in coda"
      />
    </div>
  );
}

