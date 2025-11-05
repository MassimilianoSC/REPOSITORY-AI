'use client';

import { useRouter } from 'next/navigation';
import { PdfViewer } from '@/components/pdf-viewer';
import { TrafficLight } from '@/components/traffic-light';
import { ExtractedField, RuleResult } from '@/lib/types';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

const mockExtractedFields: ExtractedField[] = [
  { label: 'Document Type', value: 'Passport', confidence: 0.95 },
  { label: 'Full Name', value: 'John Doe', confidence: 0.98 },
  { label: 'Document Number', value: 'AB123456', confidence: 0.92 },
  { label: 'Issue Date', value: '2020-01-15', confidence: 0.94 },
  { label: 'Expiry Date', value: '2030-01-15', confidence: 0.96 },
  { label: 'Nationality', value: 'USA', confidence: 0.99 },
];

const mockRules: RuleResult[] = [
  { id: '1', name: 'Document not expired', passed: true, message: 'Document is valid until 2030-01-15' },
  { id: '2', name: 'Valid document number format', passed: true, message: 'Document number matches expected pattern' },
  { id: '3', name: 'High confidence extraction', passed: true, message: 'All fields extracted with >90% confidence' },
  { id: '4', name: 'Name matches records', passed: true, message: 'Name verified against database' },
];

export default function DocumentPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Document #{params.id}</h1>
            <TrafficLight status="green" className="w-4 h-4" />
          </div>
          <p className="text-slate-600">Review extracted data and validation results</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">PDF Preview</h2>
          <PdfViewer
            url="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
            className="h-[600px]"
          />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Extracted Fields</h2>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {mockExtractedFields.map((field, idx) => (
                <div key={idx} className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-slate-700">{field.label}</span>
                    <span className="text-xs text-slate-500">
                      {(field.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <div className="text-slate-900 font-medium">{field.value}</div>
                  <div className="mt-2 bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${field.confidence * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Validation Rules</h2>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {mockRules.map((rule) => (
                <div key={rule.id} className="p-4 flex gap-3">
                  {rule.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 mb-1">{rule.name}</div>
                    <div className="text-sm text-slate-600">{rule.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
