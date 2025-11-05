'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { UploadBox } from '@/components/upload-box';
import { ArrowLeft } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [tenant] = useState('tenant-demo');

  const companies = ['Acme Corp', 'Beta Inc', 'Gamma Ltd'];

  const handleUpload = async (file: File) => {
    if (!selectedCompany) {
      throw new Error('Please select a company');
    }

    const uuid = crypto.randomUUID();
    const storagePath = `docs/${tenant}/${selectedCompany}/tmp/${uuid}.pdf`;
    const storageRef = ref(storage, storagePath);

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
        Back
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Upload Document</h1>
        <p className="text-slate-600">Upload a new document for processing</p>
      </div>

      <div className="max-w-3xl">
        <div className="mb-6">
          <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-2">
            Select Company <span className="text-red-500">*</span>
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Choose a company...</option>
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
            <p className="text-slate-500">Please select a company first</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Upload Info</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>Documents will be uploaded to Firebase Storage</li>
            <li>
              Path: <code className="bg-blue-100 px-1 rounded">docs/{tenant}/{selectedCompany || '[company]'}/tmp/[uuid].pdf</code>
            </li>
            <li>Only PDF files up to 10MB are accepted</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
