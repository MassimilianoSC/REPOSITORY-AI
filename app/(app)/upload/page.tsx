'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage, getFirebaseDb } from '@/lib/firebaseClient';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { UploadBox } from '@/components/upload-box';
import { UploadTimeline, useDocumentPipeline } from '@/components/upload-timeline';
import { useCurrentDocumentByBlobName } from '@/hooks/useFirestore';
import { DocumentChecklist } from '@/components/document-checklist';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, Upload, Building2, FileUp, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Force client-side rendering only (no SSR)
export const dynamic = 'force-dynamic';

export default function UploadPage() {
  const router = useRouter();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [uploadedBlobName, setUploadedBlobName] = useState<string>('');
  const [uploadComplete, setUploadComplete] = useState(false);
  const [companyHighlight, setCompanyHighlight] = useState(false);
  // Aziende: array di {id, name} per supportare sia ID che nome display
  const [firestoreCompanies, setFirestoreCompanies] = useState<{id: string, name: string}[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // ✅ FIX: Usa hook useAuth per ottenere tenant, role e aziende dall'utente autenticato
  const { tenantId: tenant, role, companyIds, loading: authLoading } = useAuth();
  
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  
  // ✅ FIX QUERY: Carica aziende in modo diverso in base al ruolo
  useEffect(() => {
    if (!tenant || authLoading) {
      setCompaniesLoading(false);
      return;
    }

    const db = getFirebaseDb();
    
    if (isManagerOrVerifier) {
      // Manager/Verifier: carica TUTTE le aziende del tenant
      const q = query(
        collection(db, `tenants/${tenant}/companies`),
        orderBy('name', 'asc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const companies = snapshot.docs
          .filter(doc => doc.data().isActive !== false)
          .map(doc => ({ id: doc.id, name: doc.data().name as string }));
        setFirestoreCompanies(companies);
        setCompaniesLoading(false);
      }, (err) => {
        console.error("Error loading companies:", err);
        setCompaniesLoading(false);
      });

      return () => unsubscribe();
    } else {
      // ✅ UPLOADER: carica SOLO le aziende nelle claims (per ID)
      // Questo evita l'errore "insufficient permissions"
      if (companyIds.length === 0) {
        setFirestoreCompanies([]);
        setCompaniesLoading(false);
        return;
      }

      const loadCompanies = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const companies: {id: string, name: string}[] = [];
          
          // Carica ogni azienda per ID (evita query su tutta la collection)
          for (const cid of companyIds) {
            const docRef = doc(db, `tenants/${tenant}/companies/${cid}`);
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data().isActive !== false) {
              companies.push({ id: snap.id, name: snap.data().name || snap.id });
            }
          }
          
          setFirestoreCompanies(companies);
        } catch (err) {
          console.error("Error loading companies for uploader:", err);
        } finally {
          setCompaniesLoading(false);
        }
      };

      loadCompanies();
    }
  }, [tenant, authLoading, isManagerOrVerifier, companyIds]);

  // Le aziende sono già filtrate correttamente dall'effetto sopra
  const availableCompanies = firestoreCompanies;

  // Checklist documenti richiesti (da Rulebook v1)
  const checklistItems = [
    {
      docType: 'DURC',
      displayName: 'DURC - Documento Unico Regolarità Contributiva',
      requiredForAll: true,
      checks: [
        'Validità massima 120 giorni dalla data di emissione',
        'Intestazione corretta (ragione sociale completa)',
        'Emesso da ente competente (INPS/INAIL/Casse Edili)',
      ],
      normativeReferences: ['D.Lgs. 50/2016 art. 80'],
      status: 'missing' as const,
    },
    {
      docType: 'VISURA',
      displayName: 'Visura Camerale',
      requiredForAll: true,
      checks: [
        'Aggiornamento recente (massimo 90 giorni)',
        'P.IVA e Codice Fiscale corrispondenti',
        'Stato attività: attiva',
      ],
      normativeReferences: ['D.P.R. 581/1995'],
      status: 'missing' as const,
    },
    {
      docType: 'ATTESTATO_PREPOSTO',
      displayName: 'Attestato Formazione Preposto',
      requiredForAll: true,
      checks: [
        'Durata corso almeno 12 ore (regime transitorio 8 ore fino a 12/2025)',
        'Ente formatore accreditato',
        'Contenuti conformi a DM 16/01/1997 (contenuti minimi formazione)',
      ],
      normativeReferences: ['Accordo Stato-Regioni 2025', 'DM 16/01/1997'],
      status: 'missing' as const,
    },
    {
      docType: 'ATTESTATO_LAVORATORE',
      displayName: 'Attestato Formazione Lavoratore',
      requiredForAll: true,
      checks: [
        'Durata minima in base al rischio (4h basso, 8h medio, 12h alto)',
        'Contenuti minimi secondo DM 16/01/1997',
        'Aggiornamento quinquennale (6 ore)',
      ],
      normativeReferences: ['Accordo Stato-Regioni 21/12/2011', 'DM 16/01/1997'],
      status: 'missing' as const,
    },
    {
      docType: 'DVR',
      displayName: 'DVR - Documento Valutazione Rischi',
      requiredForAll: true,
      checks: [
        'Data di redazione presente',
        'Firma datore di lavoro, RSPP, RLS',
        'Valutazione rischi specifici (chimico, fisico, biologico, etc.)',
      ],
      normativeReferences: ['D.Lgs. 81/2008 art. 28'],
      status: 'missing' as const,
    },
    {
      docType: 'POS',
      displayName: 'POS - Piano Operativo Sicurezza',
      requiredForAll: false,
      checks: [
        'Specifico per il cantiere',
        'Coordinamento con PSC',
        'Procedure operative dettagliate',
      ],
      normativeReferences: ['D.Lgs. 81/2008 art. 89 comma 1 lett. h'],
      status: 'missing' as const,
    },
    {
      docType: 'REGISTRO_ANTINCENDIO',
      displayName: 'Registro Controlli Antincendio',
      requiredForAll: false,
      checks: [
        'Controlli periodici registrati',
        'Manutenzioni programmate',
        'Conformità D.M. 10/03/1998',
      ],
      normativeReferences: ['D.M. 10/03/1998'],
      status: 'missing' as const,
    },
  ];

  const handleSelectDocType = (docType: string) => {
    setSelectedDocType(docType);
    
    // Se l'azienda non è selezionata, evidenzia il dropdown e fai focus
    if (!selectedCompany) {
      setCompanyHighlight(true);
      const companySelect = document.getElementById('company');
      companySelect?.focus();
      companySelect?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Rimuovi l'evidenziazione dopo 2 secondi
      setTimeout(() => setCompanyHighlight(false), 2000);
    } else {
      // Se l'azienda è già selezionata, vai direttamente alla sezione upload
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // FIX B: Listen to uploaded document via POINTER (elimina race conditions)
  const { document: uploadedDoc } = useCurrentDocumentByBlobName(tenant || '', selectedCompany || '', uploadedBlobName);
  const pipelineSteps = useDocumentPipeline(uploadedDoc);

  const handleUpload = async (file: File) => {
    if (!selectedCompany) {
      throw new Error('Please select a company');
    }

    const uuid = crypto.randomUUID();
    const docId = uuid;
    const storagePath = `docs/${tenant}/${selectedCompany}/tmp/${docId}.pdf`;
    const storageRef = ref(storage, storagePath);

    // FIX TIMELINE: Salva il blobName (path completo) per il tracking
    setUploadedBlobName(storagePath);
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

  // Loading state durante autenticazione o caricamento aziende
  if (authLoading || companiesLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  // Utente non autenticato
  if (!tenant) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-500 hover:text-teal-600 mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Torna indietro</span>
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <FileUp className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient">
                Carica Documento
              </h1>
              <p className="text-slate-500 mt-1">Carica e verifica automaticamente i tuoi documenti</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-xl border border-purple-200">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Verifica AI</span>
          </div>
        </div>
      </div>

      {/* Layout a 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Colonna Sinistra: Checklist */}
        <div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Documenti Richiesti
            </h2>
            <DocumentChecklist
              items={checklistItems}
              onSelectDocType={handleSelectDocType}
            />
          </div>
        </div>

        {/* Colonna Destra: Upload */}
        <div className="space-y-6">
          {/* Selezione Azienda */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Seleziona Azienda</h3>
                <p className="text-xs text-slate-500">Scegli per quale azienda stai caricando</p>
              </div>
            </div>
            <select
              id="company"
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setCompanyHighlight(false);
              }}
              className={`input-modern ${
                companyHighlight 
                  ? 'border-orange-500 ring-2 ring-orange-300 animate-pulse bg-orange-50' 
                  : ''
              }`}
            >
              <option value="">Scegli un&apos;azienda...</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {companyHighlight && selectedDocType && (
              <p className="mt-3 text-sm text-orange-600 font-medium animate-pulse flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Seleziona un&apos;azienda per caricare: {checklistItems.find(i => i.docType === selectedDocType)?.displayName}
              </p>
            )}
          </div>

          {/* Tipo documento selezionato */}
          {selectedDocType && (
            <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-violet-900">
                  {checklistItems.find(i => i.docType === selectedDocType)?.displayName}
                </p>
                <p className="text-xs text-violet-600">Tipo documento selezionato</p>
              </div>
            </div>
          )}

          {/* Box Upload */}
          <div id="upload-section" className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Carica File</h3>
                <p className="text-xs text-slate-500">Trascina o seleziona un file PDF</p>
              </div>
            </div>
            {selectedCompany ? (
              <UploadBox onUpload={handleUpload} accept=".pdf" maxSizeMB={10} />
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
                <Upload className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-400 font-medium">Seleziona prima un&apos;azienda</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline (full width sotto) */}
      <div className="max-w-3xl mt-8">

        {/* Pipeline Timeline */}
        {uploadComplete && uploadedBlobName && (
          <div className="mt-8 border border-slate-200 rounded-lg p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 text-lg">
                Elaborazione documento
              </h3>
              {uploadedDoc?.id && uploadedDoc?.status && (
                <button
                  onClick={() => router.push(`/document?id=${uploadedDoc.id}&tid=${tenant}`)}
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
