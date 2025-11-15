'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { UploadBox } from '@/components/upload-box';
import { UploadTimeline, useDocumentPipeline } from '@/components/upload-timeline';
import { useDocument } from '@/hooks/useFirestore';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [tenant] = useState('tenant-demo');
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  const companies = ['Acme Corp', 'Beta Inc', 'Gamma Ltd'];

  // Listen to uploaded document
  const { document: uploadedDoc } = useDocument(tenant, selectedCompany, uploadedDocId || '');
  const pipelineSteps = useDocumentPipeline(uploadedDoc);

  const handleUpload = async (file: File) => {
    if (!selectedCompany) {
      throw new Error('Please select a company');
    }

    const uuid = crypto.randomUUID();
    const docId = uuid;
    const storagePath = `docs/${tenant}/${selectedCompany}/tmp/${docId}.pdf`;
    const storageRef = ref(storage, storagePath);

    setUploadedDocId(docId);
    setUploadComplete(false);

    return new Promise<void>((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
        },
        (error) => {
          reject(error);
        },
        () => {
          setUploadComplete(true);
          resolve();
        }
      );
    });
  };

  return (
    <div className="p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Indietro
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Carica Documento</h1>
        <p className="text-slate-600">Carica un nuovo documento per l'elaborazione</p>
      </div>

      <div className="max-w-3xl">
        <div className="mb-6">
          <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-2">
            Seleziona Azienda <span className="text-red-500">*</span>
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Scegli un'azienda...</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        {selectedCompany ? (
          <UploadBox onUpload={handleUpload} accept=".pdf" maxSizeMB={10} />
        ) : (
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center bg-slate-50">
            <p className="text-slate-500">Seleziona prima un'azienda</p>
          </div>
        )}

        {/* Pipeline Timeline */}
        {uploadComplete && uploadedDocId && (
          <div className="mt-8 border border-slate-200 rounded-lg p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 text-lg">
                Elaborazione documento
              </h3>
              {uploadedDoc?.overall?.status && (
                <button
                  onClick={() => router.push(`/document/${uploadedDocId}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Apri dettaglio
                </button>
              )}
            </div>

            <UploadTimeline steps={pipelineSteps} />

            {uploadedDoc?.overall?.status && (
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Esito validazione</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {uploadedDoc.overall.reason || 'Elaborazione completata'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        uploadedDoc.overall.status === 'green'
                          ? 'bg-green-100 text-green-800'
                          : uploadedDoc.overall.status === 'yellow'
                          ? 'bg-yellow-100 text-yellow-800'
                          : uploadedDoc.overall.status === 'red'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {uploadedDoc.overall.status === 'green' && '✓ Idoneo'}
                      {uploadedDoc.overall.status === 'yellow' && '⚠ In scadenza'}
                      {uploadedDoc.overall.status === 'red' && '✗ Non idoneo'}
                      {uploadedDoc.overall.status === 'na' && '— Non applicabile'}
                    </span>
                    {uploadedDoc.overall.confidence !== undefined && (
                      <span className="text-xs text-slate-600">
                        {Math.round(uploadedDoc.overall.confidence * 100)}% fiducia
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Informazioni Caricamento</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>I documenti verranno caricati su Firebase Storage</li>
            <li>
              Percorso: <code className="bg-blue-100 px-1 rounded">docs/{tenant}/{selectedCompany || '[azienda]'}/tmp/[uuid].pdf</code>
            </li>
            <li>Solo file PDF fino a 10MB sono accettati</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
