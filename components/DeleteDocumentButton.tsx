'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '@/lib/firebaseClient';
import { Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DeleteDocumentButtonProps {
  tenantId: string;
  companyId: string;
  docId: string;
  docType?: string;
}

export function DeleteDocumentButton({
  tenantId,
  companyId,
  docId,
  docType = 'Documento',
}: DeleteDocumentButtonProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!reason.trim()) {
      setError('La motivazione è obbligatoria');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const functions = getFirebaseFunctions();
      const deleteDocFn = httpsCallable(functions, 'deleteDocument');

      const result: any = await deleteDocFn({
        tenantId,
        companyId,
        docId,
        reason: reason.trim(),
      });

      if (result?.data?.ok) {
        // Successo: mostra toast e redirect
        alert('✅ Documento eliminato con successo');
        router.push(`/dashboard?companyId=${companyId}`);
      } else {
        setError('Errore durante l\'eliminazione');
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Errore durante l\'eliminazione');
      setLoading(false);
    }
  };

  return (
    <>
      {/* Pulsante Elimina */}
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
        title="Elimina documento (solo Amministratore HQ)"
      >
        <Trash2 className="w-4 h-4" />
        <span>Elimina</span>
      </button>

      {/* Modal Conferma */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900">
                Conferma Eliminazione
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
                disabled={loading}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Warning */}
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                ⚠️ <strong>Attenzione:</strong> Stai per eliminare il documento{' '}
                <strong>{docType}</strong>.
              </p>
              <p className="text-sm text-red-700 mt-2">
                Il file verrà spostato nel cestino e conservato per 30 giorni
                prima dell'eliminazione definitiva.
              </p>
            </div>

            {/* Motivazione */}
            <div className="mb-4">
              <label
                htmlFor="delete-reason"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Motivazione <span className="text-red-600">*</span>
              </label>
              <textarea
                id="delete-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder="Inserisci il motivo dell'eliminazione..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                rows={3}
                disabled={loading}
                autoFocus
              />
              {error && (
                <p className="text-sm text-red-600 mt-1">{error}</p>
              )}
            </div>

            {/* Azioni */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                disabled={loading}
              >
                Annulla
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                disabled={loading || !reason.trim()}
              >
                {loading ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

