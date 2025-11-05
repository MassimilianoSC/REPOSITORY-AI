'use client';

import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { Calendar } from 'lucide-react';
import { DocumentItem } from '@/lib/types';

const mockScadenze: DocumentItem[] = [
  {
    id: '1',
    docType: 'Driver License',
    status: 'yellow',
    issuedAt: '2019-05-10',
    expiresAt: '2025-05-10',
    confidence: 0.87,
    reason: 'Expires in 6 months',
    company: 'Beta Inc',
  },
  {
    id: '2',
    docType: 'Work Permit',
    status: 'yellow',
    issuedAt: '2022-08-15',
    expiresAt: '2025-08-15',
    confidence: 0.91,
    reason: 'Renewal required soon',
    company: 'Acme Corp',
  },
  {
    id: '3',
    docType: 'ID Card',
    status: 'red',
    issuedAt: '2015-03-22',
    expiresAt: '2024-03-22',
    confidence: 0.92,
    reason: 'Expired',
    company: 'Gamma Ltd',
  },
];

export default function ScadenzePage() {
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
      key: 'expiresAt',
      header: 'Expires',
    },
    {
      key: 'reason',
      header: 'Reason',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Scadenze</h1>
        <p className="text-slate-600">Track document expiration dates and renewals</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-red-900 uppercase">Expired</h3>
            <TrafficLight status="red" />
          </div>
          <p className="text-3xl font-bold text-red-900">1</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-yellow-900 uppercase">Expiring Soon</h3>
            <TrafficLight status="yellow" />
          </div>
          <p className="text-3xl font-bold text-yellow-900">2</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-green-900 uppercase">Valid</h3>
            <TrafficLight status="green" />
          </div>
          <p className="text-3xl font-bold text-green-900">12</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Upcoming Expirations</h2>
        <DataTable data={mockScadenze} columns={columns} emptyMessage="No upcoming expirations" />
      </div>

      <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-6 h-6 text-slate-700" />
          <h3 className="text-lg font-semibold text-slate-900">Calendar View</h3>
        </div>
        <p className="text-slate-600">
          Calendar integration placeholder. This section will display a visual calendar showing all document expiration dates.
        </p>
      </div>
    </div>
  );
}
