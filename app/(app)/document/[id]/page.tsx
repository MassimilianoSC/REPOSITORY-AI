'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { TrafficLight } from '@/components/traffic-light';
import { useDocument } from '@/hooks/useFirestore';
import { canApplyNonPertinente } from '@/lib/rbac';
import { auth } from '@/lib/firebaseClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DocumentDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { document, loading, error } = useDocument(resolvedParams.id);
  
  const [citationsOpen, setCitationsOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showNonPertinenteModal, setShowNonPertinenteModal] = useState(false);
  const [nonPertinenteReason, setNonPertinenteReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Get current user
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserEmail(user?.email || null);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento documento...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Documento non trovato</h1>
          <p className="text-slate-600 mb-6">{error || 'Il documento richiesto non esiste o non hai i permessi per visualizzarlo.'}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Torna indietro
          </button>
        </div>
      </div>
    );
  }

  const { doc, extracted, checks = [], overall, citations = [], audit, metadata } = document;

  // Check RBAC
  const canOverride = canApplyNonPertinente(userEmail);

  // Handle "Non Pertinente" override
  const handleNonPertinenteSubmit = async () => {
    if (!nonPertinenteReason.trim()) {
      alert('La motivazione è obbligatoria');
      return;
    }

    setSavingOverride(true);
    
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebaseClient');
      
      const overrideNonPertinente = httpsCallable(functions, 'overrideNonPertinente');
      
      // Ricostruisci docPath (assumendo structure standard)
      const docPath = document.metadata?.docPath || `tenants/tenant-demo/companies/${document.company}/documents/${resolvedParams.id}`;
      
      await overrideNonPertinente({
        docPath,
        nonPertinente: true,
        reason: nonPertinenteReason,
      });
      
      alert('✅ Override "Non Pertinente (quindi Idoneo)" applicato con successo!');
      setShowNonPertinenteModal(false);
      setNonPertinenteReason('');
      
      // Il documento si aggiornerà automaticamente via listener Firestore
    } catch (err: any) {
      console.error('Error applying override:', err);
      alert(`❌ Errore: ${err.message}`);
    } finally {
      setSavingOverride(false);
    }
  };

  // Separazione checks passati/falliti
  const passedChecks = checks.filter((c: any) => c.passed);
  const failedChecks = checks.filter((c: any) => !c.passed);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Indietro
      </button>

      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {doc?.docType || 'Documento'}
            </h1>
            <p className="text-slate-600">{metadata?.filename || resolvedParams.id}</p>
          </div>
          
          {/* Semaforo Grande */}
          <div className="flex items-center gap-4">
            <TrafficLight status={overall?.status || 'gray'} size="lg" />
            <div className="text-right">
              <div className={`text-2xl font-bold ${
                overall?.status === 'green' ? 'text-green-600' :
                overall?.status === 'yellow' ? 'text-yellow-600' :
                overall?.status === 'red' ? 'text-red-600' :
                'text-gray-600'
              }`}>
                {overall?.status === 'green' && '✓ Idoneo'}
                {overall?.status === 'yellow' && '⚠ In scadenza'}
                {overall?.status === 'red' && '✗ Non idoneo'}
                {overall?.status === 'na' && '— Non applicabile'}
                {!overall?.status && 'In elaborazione'}
              </div>
              {overall?.confidence !== undefined && (
                <div className="text-sm text-slate-600 mt-1">
                  Affidabilità: {Math.round(overall.confidence * 100)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Motivazione */}
        {overall?.reason && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-700 mb-1">Motivazione:</p>
            <p className="text-slate-900">{overall.reason}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonna Principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dati Estratti */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Dati Estratti</h2>
            <dl className="grid grid-cols-2 gap-4">
              {extracted?.issuedAt && (
                <>
                  <dt className="text-sm font-medium text-slate-600">Emesso il:</dt>
                  <dd className="text-sm text-slate-900">{extracted.issuedAt}</dd>
                </>
              )}
              {extracted?.expiresAt && (
                <>
                  <dt className="text-sm font-medium text-slate-600">Scade il:</dt>
                  <dd className="text-sm text-slate-900">{extracted.expiresAt}</dd>
                </>
              )}
              {extracted?.holder && (
                <>
                  <dt className="text-sm font-medium text-slate-600">Intestatario:</dt>
                  <dd className="text-sm text-slate-900">{extracted.holder}</dd>
                </>
              )}
              {extracted?.identifiers?.cf && (
                <>
                  <dt className="text-sm font-medium text-slate-600">Codice Fiscale:</dt>
                  <dd className="text-sm text-slate-900 font-mono">{extracted.identifiers.cf}</dd>
                </>
              )}
              {extracted?.identifiers?.piva && (
                <>
                  <dt className="text-sm font-medium text-slate-600">P.IVA:</dt>
                  <dd className="text-sm text-slate-900 font-mono">{extracted.identifiers.piva}</dd>
                </>
              )}
            </dl>

            {!extracted?.issuedAt && !extracted?.expiresAt && !extracted?.holder && (
              <p className="text-sm text-slate-500 italic">Nessun dato estratto disponibile</p>
            )}
          </div>

          {/* Controlli Effettuati */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Controlli Effettuati
              <span className="ml-2 text-sm font-normal text-slate-600">
                ({passedChecks.length} passati, {failedChecks.length} falliti)
              </span>
            </h2>

            {checks.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Nessun controllo effettuato</p>
            ) : (
              <div className="space-y-3">
                {/* Falliti (mostrati per primi) */}
                {failedChecks.map((check: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50"
                  >
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-red-900">{check.description || check.id}</p>
                        {check.value && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded whitespace-nowrap">
                            {check.value}
                          </span>
                        )}
                      </div>
                      {check.normativeRefs && check.normativeRefs.length > 0 && (
                        <p className="text-xs text-red-700 mt-1">
                          📚 {check.normativeRefs.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Passati */}
                {passedChecks.map((check: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-lg border border-green-200 bg-green-50"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-green-900">{check.description || check.id}</p>
                        {check.value && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded whitespace-nowrap">
                            {check.value}
                          </span>
                        )}
                      </div>
                      {check.normativeRefs && check.normativeRefs.length > 0 && (
                        <p className="text-xs text-green-700 mt-1">
                          📚 {check.normativeRefs.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Citazioni dalle Norme (Accordion) */}
          {citations.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200">
              <button
                onClick={() => setCitationsOpen(!citationsOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
              >
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Citazioni dalle Norme ({citations.length})
                </h2>
                {citationsOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {citationsOpen && (
                <div className="px-6 pb-6 space-y-4">
                  {citations.map((citation: any, idx: number) => (
                    <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 rounded-r">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-blue-900">
                          📄 {citation.source || citation.title || `Fonte ${idx + 1}`}
                          {citation.page && <span className="text-blue-700"> - pag. {citation.page}</span>}
                        </p>
                        {citation.id && (
                          <span className="text-xs text-blue-600 font-mono bg-blue-100 px-2 py-1 rounded">
                            {citation.id}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        "{citation.snippet}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Colonna Laterale */}
        <div className="space-y-6">
          {/* Pulsante Non Pertinente (con RBAC) */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Azioni</h3>
            
            {overall?.nonPertinente ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-900 mb-1">
                  ✓ Documento marcato "Non Pertinente"
                </p>
                {overall.override?.reason && (
                  <p className="text-xs text-amber-700 mt-2">
                    Motivazione: {overall.override.reason}
                  </p>
                )}
                {overall.override?.byEmail && (
                  <p className="text-xs text-amber-600 mt-1">
                    Da: {overall.override.byEmail}
                  </p>
                )}
              </div>
            ) : (
              <>
                <button
                  disabled={!canOverride}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                    canOverride
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-300 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                  onClick={() => canOverride && setShowNonPertinenteModal(true)}
                >
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  Marca "Non Pertinente"
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  {canOverride
                    ? 'Marca questo documento come "non pertinente (quindi idoneo)" con motivazione obbligatoria.'
                    : 'Solo verificatori e manager possono marcare un documento come "non pertinente".'}
                </p>
              </>
            )}
          </div>

          {/* Audit (Collapsible) */}
          {audit && (
            <div className="bg-white rounded-lg border border-slate-200">
              <button
                onClick={() => setAuditOpen(!auditOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <h3 className="text-sm font-semibold text-slate-900">Informazioni Tecniche</h3>
                {auditOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {auditOpen && (
                <div className="px-4 pb-4 space-y-2 text-sm">
                  {audit.model && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Modello:</span>
                      <span className="text-slate-900 font-medium">{audit.model}</span>
                    </div>
                  )}
                  {audit.latencyMs !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Latenza:</span>
                      <span className="text-slate-900 font-medium">{(audit.latencyMs / 1000).toFixed(2)}s</span>
                    </div>
                  )}
                  {audit.rag && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-600">RAG chunks:</span>
                        <span className="text-slate-900 font-medium">{audit.rag.hits} / {audit.rag.topK}</span>
                      </div>
                    </>
                  )}
                  {audit.fallbackUsed !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fallback:</span>
                      <span className={`font-medium ${audit.fallbackUsed ? 'text-amber-600' : 'text-green-600'}`}>
                        {audit.fallbackUsed ? 'Sì' : 'No'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metadati */}
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-xs space-y-1">
            <div><span className="text-slate-600">ID:</span> <span className="font-mono text-slate-900">{resolvedParams.id}</span></div>
            {metadata?.uploadedAt && (
              <div><span className="text-slate-600">Caricato:</span> <span className="text-slate-900">{new Date(metadata.uploadedAt).toLocaleString('it-IT')}</span></div>
            )}
            {metadata?.uploadedBy && (
              <div><span className="text-slate-600">Da:</span> <span className="text-slate-900">{metadata.uploadedBy}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* Modale "Non Pertinente" */}
      {showNonPertinenteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Marca come "Non Pertinente (quindi Idoneo)"
            </h3>
            
            <p className="text-sm text-slate-600 mb-4">
              Stai per marcare questo documento come <strong>non pertinente</strong> ma <strong>idoneo</strong>. 
              La motivazione è <strong>obbligatoria</strong> e verrà tracciata nell'audit.
            </p>

            <textarea
              value={nonPertinenteReason}
              onChange={(e) => setNonPertinenteReason(e.target.value)}
              placeholder="Inserisci la motivazione (obbligatoria)..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none min-h-[100px]"
              autoFocus
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowNonPertinenteModal(false);
                  setNonPertinenteReason('');
                }}
                disabled={savingOverride}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleNonPertinenteSubmit}
                disabled={savingOverride || !nonPertinenteReason.trim()}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingOverride ? 'Salvataggio...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
