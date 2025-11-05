'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { DocumentItem } from '@/lib/types';
import { Filter } from 'lucide-react';

const mockDocuments: DocumentItem[] = [
  {
    id: '1',
    docType: 'Passport',
    status: 'green',
    issuedAt: '2020-01-15',
    expiresAt: '2030-01-15',
    confidence: 0.95,
    reason: 'Valid document',
    company: 'Acme Corp',
    tenant: 'tenant-1',
  },
  {
    id: '2',
    docType: 'Driver License',
    status: 'yellow',
    issuedAt: '2019-05-10',
    expiresAt: '2025-05-10',
    confidence: 0.87,
    reason: 'Expires soon',
    company: 'Beta Inc',
    tenant: 'tenant-1',
  },
  {
    id: '3',
    docType: 'ID Card',
    status: 'red',
    issuedAt: '2015-03-22',
    expiresAt: '2024-03-22',
    confidence: 0.92,
    reason: 'Expired',
    company: 'Acme Corp',
    tenant: 'tenant-1',
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [loading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredDocuments = mockDocuments.filter((doc) => {
    if (companyFilter && doc.company !== companyFilter) return false;
    if (statusFilter && doc.status !== statusFilter) return false;
    return true;
  });

  const companies = Array.from(new Set(mockDocuments.map((d) => d.company)));

  const columns = [
    {
      key: 'status',
      header: 'Status',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-16',
    },
    {
      key: 'docType',
      header: 'Document Type',
    },
    {
      key: 'company',
      header: 'Company',
    },
    {
      key: 'issuedAt',
      header: 'Issued',
    },
    {
      key: 'expiresAt',
      header: 'Expires',
    },
    {
      key: 'confidence',
      header: 'Confidence',
      render: (doc: DocumentItem) => `${(doc.confidence * 100).toFixed(0)}%`,
    },
    {
      key: 'reason',
      header: 'Reason',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">Manage and review your documents</p>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <label htmlFor="company-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filter by Company
          </label>
          <select
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">All Companies</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-2">
            <Filter className="w-4 h-4 inline mr-1" />
            Filter by Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">All Statuses</option>
            <option value="green">Green</option>
            <option value="yellow">Yellow</option>
            <option value="red">Red</option>
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
