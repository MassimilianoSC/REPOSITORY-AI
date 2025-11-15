'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { DocumentItem } from '@/lib/types';
import { Filter } from 'lucide-react';

// Status mapping from backend to UI
const STATUS_MAP: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  'green': 'green',
  'yellow': 'yellow',
  'red': 'red',
  'na': 'gray',
};

export default function DashboardPage() {
  const router = useRouter();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // TODO: Replace with actual tenant ID from auth context
  const tenantId = 'tenant-demo';
  const companies = ['Acme Corp', 'Beta Inc', 'Gamma LLC'];

  // Use new hook for real-time documents
  const { documents: firestoreDocs, loading } = useMultiCompanyDocuments(tenantId, companies, {
    limit: 50,
  });

  // Map Firestore documents to UI format
  const documents: DocumentItem[] = firestoreDocs.map((doc) => ({
    id: doc.id,
    docType: doc.docType || 'Unknown',
    status: STATUS_MAP[doc.overall?.status || 'na'] || 'gray',
    issuedAt: doc.extracted?.issuedAt || doc.issuedAt || '-',
    expiresAt: doc.extracted?.expiresAt || doc.expiresAt || '-',
    confidence: doc.overall?.confidence || doc.confidence || 0,
    reason: doc.overall?.reason || doc.reason || 'Processing...',
    company: doc.companyId || 'Unknown',
    tenant: tenantId,
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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">Gestisci e controlla i tuoi documenti</p>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <label htmlFor="company-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filtra per Azienda
          </label>
          <select
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
          <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filtra per Stato
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Tutti gli Stati</option>
            <option value="green">Verde</option>
            <option value="yellow">Giallo</option>
            <option value="red">Rosso</option>
          </select>
        </div>
      </div>

      <DataTable
        data={filteredDocuments}
        columns={columns}
        loading={loading}
        onRowClick={(doc) => router.push(`/document/${doc.id}`)}
        emptyMessage="No documents found. Upload your first document to get started."
      />
    </div>
  );
}
