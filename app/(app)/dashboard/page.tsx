'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
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
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Load real documents from Firestore
  useEffect(() => {
    setLoading(true);
    
    // TODO: Replace with actual tenant ID from auth context
    const tenantId = 'tenant-demo';
    
    // Query all documents across all companies (for demo)
    // In production, filter by user's companies
    const companies = ['Acme Corp', 'Beta Inc', 'Gamma LLC'];
    const unsubscribes: (() => void)[] = [];
    
    companies.forEach(companyId => {
      const docsRef = collection(db, `tenants/${tenantId}/companies/${companyId}/documents`);
      const q = query(docsRef, orderBy('updatedAt', 'desc'), limit(50));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const companyDocs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            docType: data.docType || 'Unknown',
            status: STATUS_MAP[data.overall?.status || 'na'] || 'gray',
            issuedAt: data.extracted?.issuedAt || data.issuedAt || '-',
            expiresAt: data.extracted?.expiresAt || data.expiresAt || '-',
            confidence: data.overall?.confidence || data.confidence || 0,
            reason: data.overall?.reason || data.reason || 'Processing...',
            company: companyId,
            tenant: tenantId,
          } as DocumentItem;
        });
        
        setDocuments(prev => {
          // Remove old docs from this company and add new ones
          const filtered = prev.filter(d => d.company !== companyId);
          return [...filtered, ...companyDocs].sort((a, b) => 
            (b.id || '').localeCompare(a.id || '')
          );
        });
        setLoading(false);
      }, (error) => {
        console.error('Error loading documents:', error);
        setLoading(false);
      });
      
      unsubscribes.push(unsubscribe);
    });
    
    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  const filteredDocuments = documents.filter((doc) => {
    if (companyFilter && doc.company !== companyFilter) return false;
    if (statusFilter && doc.status !== statusFilter) return false;
    return true;
  });

  const companies = Array.from(new Set(documents.map((d) => d.company)));

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
