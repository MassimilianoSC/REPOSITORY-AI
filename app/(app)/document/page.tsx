'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, FileText } from 'lucide-react';
import { TrafficLight } from '@/components/traffic-light';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '@/lib/firebaseClient';
import { canApplyNonPertinente } from '@/lib/rbac';
import { auth } from '@/lib/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { mapBackendToUI } from '@/lib/statusMapper';
import { getIssuedAt, getExpiresAt, fmtDate } from '@/lib/fields';
import { DeleteDocumentButton } from '@/components/DeleteDocumentButton';

export default function DocumentDetailPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const docId = sp.get('id');
  const tid = sp.get('tid') || 'tenant-demo';
  
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [citationsOpen, setCitationsOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [canOverride, setCanOverride] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [showNonPertinenteModal, setShowNonPertinenteModal] = useState(false);
  const [nonPertinenteReason, setNonPertinenteReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Get current user and check permissions
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      
      if (user) {
        const hasPermission = await canApplyNonPertinente(user);
        setCanOverride(hasPermission);
        
        // Check if user is manager (can delete documents)
        const tokenResult = await user.getIdTokenResult();
        setIsManager(tokenResult.claims.role === 'manager');
      } else {
        setCanOverride(false);
        setIsManager(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load document
  useEffect(() => {
    if (!docId || !tid) {
      setError('Parametri mancanti (id o tid)');
      setLoading(false);
      return;
    }

    setLoading(true);

    // Cerca il documento in tutte le companies (MVP)
    const companies = ['Acme Corp', 'Beta Inc', 'Gamma LLC'];
    
    const tryLoadDocument = async () => {
      for (const cid of companies) {
        try {
          const docRef = doc(db, `tenants/${tid}/companies/${cid}/documents/${docId}`);
          const snapshot = await getDoc(docRef);
          
          if (snapshot.exists()) {
            setDocument({ id: snapshot.id, ...snapshot.data() });
            setLoading(false);
            setError(null);
            
            // Setup listener per aggiornamenti real-time
            const unsubscribe = onSnapshot(docRef, (snap) => {
              if (snap.exists()) {
                setDocument({ id: snap.id, ...snap.data() });
              }
            });
            
            return unsubscribe;
          }
        } catch (err) {
          console.warn(`Document not in ${cid}`);
        }
      }
      
      setDocument(null);
      setError('Documento non trovato');
      setLoading(false);
      return () => {};
    };

    const cleanup = tryLoadDocument();
    return () => { cleanup.then(unsub => unsub()); };
  }, [docId, tid]);

  const handleApplyNonPertinente = async () => {
    if (!nonPertinenteReason.trim()) {
      alert('Motivazione obbligatoria');
      return;
    }

    setSavingOverride(true);
    try {
      const overrideFn = httpsCallable(functions, 'overrideNonPertinente');
      await overrideFn({ docId, reason: nonPertinenteReason });
      
      setShowNonPertinenteModal(false);
      setNonPertinenteReason('');
      alert('Override applicato con successo');
    } catch (err: any) {
      console.error(err);
      alert(`Errore: ${err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p>Caricamento documento...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-red-600">{error || 'Documento non trovato'}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            <ArrowLeft size={20} />
            Torna indietro
          </button>
        </div>
      </div>
    );
  }

  const overall = document.overall || {};
  const extracted = document.extracted || {};
  const checks = document.checks || [];
  const citations = document.citations || [];

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft size={20} />
            <span>Torna indietro</span>
          </button>
          
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                  {document.docType || 'Documento'}
                </h1>
                <p className="text-slate-600">
                  Azienda: {document.companyId || 'N/D'} • Caricato: {document.uploadedAt?.toDate ? new Date(document.uploadedAt.toDate()).toLocaleDateString('it-IT') : 'N/D'}
                </p>
              </div>
              <TrafficLight status={mapBackendToUI(overall.status || document.status)} size="lg" />
            </div>

            {overall.message && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700">{overall.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Dati Estratti */}
        <section className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText size={20} />
            Dati Estratti
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-600">Data Emissione</p>
              <p className="text-base font-medium text-slate-900">{fmtDate(getIssuedAt(document))}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Data Scadenza</p>
              <p className="text-base font-medium text-slate-900">{fmtDate(getExpiresAt(document))}</p>
            </div>
            {extracted.entityName && (
              <div>
                <p className="text-sm text-slate-600">Intestatario</p>
                <p className="text-base font-medium text-slate-900">{extracted.entityName}</p>
              </div>
            )}
            {extracted.fiscalCode && (
              <div>
                <p className="text-sm text-slate-600">Codice Fiscale</p>
                <p className="text-base font-medium text-slate-900">{extracted.fiscalCode}</p>
              </div>
            )}
          </div>
        </section>

        {/* Verifiche Eseguite */}
        <section className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Verifiche Eseguite</h2>
          {checks.length === 0 ? (
            <p className="text-slate-500 italic">Nessuna verifica registrata</p>
          ) : (
            <div className="space-y-3">
              {checks.map((check: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  {check.passed ? (
                    <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{check.description}</p>
                    {check.reason && (
                      <p className="text-sm text-slate-600 mt-1">{check.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Citazioni Normative */}
        {citations.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            <button
              onClick={() => setCitationsOpen(!citationsOpen)}
              className="w-full flex items-center justify-between text-lg font-semibold text-slate-900"
            >
              <span>Citazioni Normative ({citations.length})</span>
              <AlertCircle size={20} />
            </button>
            {citationsOpen && (
              <div className="mt-4 space-y-2">
                {citations.map((cit: any, idx: number) => (
                  <div key={idx} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">{cit.source || 'Fonte non specificata'}</p>
                    {cit.snippet && (
                      <p className="text-sm text-blue-700 mt-1">{cit.snippet}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Azioni Manager/Verifier */}
        {(canOverride || isManager) && (
          <section className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Azioni</h2>
            <div className="flex flex-wrap gap-3">
              {/* Pulsante Non Pertinente */}
              {canOverride && overall.status !== 'na' && (
                <button
                  onClick={() => setShowNonPertinenteModal(true)}
                  className="flex-1 min-w-[200px] px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  Non Pertinente (quindi Idoneo)
                </button>
              )}
              
              {/* Pulsante Elimina (solo manager) */}
              {isManager && document.companyId && (
                <DeleteDocumentButton
                  tenantId={tid}
                  companyId={document.companyId}
                  docId={docId || ''}
                  docType={document.docType}
                />
              )}
            </div>
          </section>
        )}

        {/* Modal Non Pertinente */}
        {showNonPertinenteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Applica Override: Non Pertinente
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Specifica il motivo per cui il documento è considerato non pertinente (quindi idoneo).
                Questa azione verrà tracciata nell'audit trail.
              </p>
              <textarea
                value={nonPertinenteReason}
                onChange={(e) => setNonPertinenteReason(e.target.value)}
                placeholder="Motivazione obbligatoria..."
                className="w-full p-3 border border-slate-300 rounded-lg mb-4"
                rows={4}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowNonPertinenteModal(false);
                    setNonPertinenteReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                  disabled={savingOverride}
                >
                  Annulla
                </button>
                <button
                  onClick={handleApplyNonPertinente}
                  className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                  disabled={savingOverride || !nonPertinenteReason.trim()}
                >
                  {savingOverride ? 'Salvataggio...' : 'Conferma'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

