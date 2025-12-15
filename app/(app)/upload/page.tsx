'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage, getFirebaseDb } from '@/lib/firebaseClient';
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UploadBox } from '@/components/upload-box';
import { UploadTimeline, useDocumentPipeline } from '@/components/upload-timeline';
import { useCurrentDocumentByBlobName } from '@/hooks/useFirestore';
import { DocumentChecklist } from '@/components/document-checklist';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, Upload, Building2, FileUp, Sparkles, FolderUp, Calendar, FileText, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Force client-side rendering only (no SSR)
export const dynamic = 'force-dynamic';

type UploadMode = 'ai' | 'direct';

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
  
  // 🆕 Stato per modalità upload (AI vs Diretto)
  const [uploadMode, setUploadMode] = useState<UploadMode>('ai');
  
  // 🆕 Stato per form upload diretto (tutti opzionali tranne azienda)
  const [directDocType, setDirectDocType] = useState('');
  const [directIssuedAt, setDirectIssuedAt] = useState('');
  const [directExpiresAt, setDirectExpiresAt] = useState('');
  const [directStatus, setDirectStatus] = useState<'green' | 'yellow' | 'red' | 'gray'>('gray');
  const [directNotes, setDirectNotes] = useState('');
  const [directUploading, setDirectUploading] = useState(false);
  const [directUploadSuccess, setDirectUploadSuccess] = useState(false);

  // ✅ FIX: Usa hook useAuth per ottenere tenant, role e aziende dall'utente autenticato
  const { tenantId: tenant, role, companyIds, user, loading: authLoading } = useAuth();
  
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

  // 🆕 Handler per upload diretto (senza verifica AI)
  const handleDirectUpload = async (file: File) => {
    if (!selectedCompany || !tenant) {
      throw new Error('Seleziona un\'impresa');
    }

    setDirectUploading(true);
    setDirectUploadSuccess(false);

    try {
      const uuid = crypto.randomUUID();
      const docId = uuid;
      // Path diverso: direct/ invece di docs/ - la Cloud Function lo skipperà
      const storagePath = `direct/${tenant}/${selectedCompany}/${docId}.pdf`;
      const storageRef = ref(storage, storagePath);

      // 1. Carica il file su Storage
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[DirectUpload] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

      // 2. Scrivi direttamente in Firestore (nessuna pipeline AI)
      const db = getFirebaseDb();
      const docRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/documents/${docId}`);
      
      // Prepara i dati del documento
      const documentData: Record<string, any> = {
        // Campi obbligatori
        blobName: storagePath,
        tenantId: tenant,
        companyId: selectedCompany,
        source: 'direct', // 🔑 Distingue dai documenti AI
        uploadedBy: user?.uid || 'unknown',
        uploadedByEmail: user?.email || 'unknown',
        uploadedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Stato
        isCurrent: true,
        isDeleted: false,
        status: directStatus,
        overall: {
          status: directStatus,
          reason: directStatus === 'gray' ? 'Documento caricato direttamente (non verificato AI)' : (directNotes || 'Caricato manualmente'),
          confidence: directStatus === 'gray' ? 0 : 1, // 0 per non verificati, 1 per inseriti manualmente
        },
        
        // Campi opzionali
        ...(directDocType && { docType: directDocType }),
        ...(directNotes && { notes: directNotes }),
      };

      // Date opzionali (converti da stringa a Timestamp)
      if (directIssuedAt) {
        documentData.issuedAt = new Date(directIssuedAt);
        documentData.extracted = { ...documentData.extracted, issuedAt: new Date(directIssuedAt) };
      }
      if (directExpiresAt) {
        documentData.expiresAt = new Date(directExpiresAt);
        documentData.extracted = { ...documentData.extracted, expiresAt: new Date(directExpiresAt) };
      }

      await setDoc(docRef, documentData);

      // 3. Crea anche il pointer per la vista corrente
      if (directDocType) {
        const pointerRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/docIndex/${directDocType}`);
        await setDoc(pointerRef, {
          currentDocId: docId,
          docType: directDocType,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      console.log('[DirectUpload] ✅ Documento salvato:', docId);
      setDirectUploadSuccess(true);
      
      // Reset form dopo successo
      setTimeout(() => {
        setDirectDocType('');
        setDirectIssuedAt('');
        setDirectExpiresAt('');
        setDirectStatus('gray');
        setDirectNotes('');
      }, 3000);

    } catch (error) {
      console.error('[DirectUpload] ❌ Errore:', error);
      throw error;
    } finally {
      setDirectUploading(false);
    }
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
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
              uploadMode === 'ai' 
                ? 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-purple-500/30'
                : 'bg-gradient-to-br from-slate-500 to-slate-600 shadow-slate-500/30'
            }`}>
              {uploadMode === 'ai' ? <FileUp className="w-7 h-7 text-white" /> : <FolderUp className="w-7 h-7 text-white" />}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient">
                Carica Documento
              </h1>
              <p className="text-slate-500 mt-1">
                {uploadMode === 'ai' 
                  ? 'Carica e verifica automaticamente i tuoi documenti'
                  : 'Carica documenti senza verifica automatica'}
              </p>
            </div>
          </div>
          <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-xl border ${
            uploadMode === 'ai'
              ? 'bg-purple-50 border-purple-200'
              : 'bg-slate-100 border-slate-300'
          }`}>
            {uploadMode === 'ai' ? (
              <>
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-700">Verifica AI</span>
              </>
            ) : (
              <>
                <FolderUp className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Caricamento Diretto</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 🆕 TAB NAVIGATION - Solo per manager/verifier */}
      {isManagerOrVerifier && (
        <div className="flex gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl w-fit">
          <button
            onClick={() => {
              setUploadMode('ai');
              setDirectUploadSuccess(false);
            }}
            className={`
              px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
              ${uploadMode === 'ai'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
              }
            `}
          >
            <Sparkles className="w-4 h-4" />
            Verifica AI
          </button>
          <button
            onClick={() => {
              setUploadMode('direct');
              setUploadComplete(false);
              setUploadedBlobName('');
            }}
            className={`
              px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
              ${uploadMode === 'direct'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
              }
            `}
          >
            <FolderUp className="w-4 h-4" />
            Caricamento Diretto
          </button>
        </div>
      )}

      {/* ========== MODALITÀ AI ========== */}
      {uploadMode === 'ai' && (
      <>
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
                <h3 className="font-semibold text-slate-800">Seleziona Impresa</h3>
                <p className="text-xs text-slate-500">Scegli per quale impresa stai caricando</p>
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
              <option value="">Scegli un&apos;impresa...</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {companyHighlight && selectedDocType && (
              <p className="mt-3 text-sm text-orange-600 font-medium animate-pulse flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Seleziona un&apos;impresa per caricare: {checklistItems.find(i => i.docType === selectedDocType)?.displayName}
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
                <p className="text-slate-400 font-medium">Seleziona prima un&apos;impresa</p>
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
      </>
      )}

      {/* ========== MODALITÀ CARICAMENTO DIRETTO ========== */}
      {uploadMode === 'direct' && (
        <div className="max-w-2xl">
          {/* Avviso */}
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Caricamento senza verifica AI</p>
              <p className="text-sm text-amber-700 mt-1">
                I documenti caricati in questa modalità <strong>non saranno verificati</strong> dall&apos;intelligenza artificiale. 
                Usa questa opzione per documenti già verificati in precedenza o per importazioni massive.
              </p>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 space-y-6">
            {/* Selezione Azienda */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Impresa <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="input-modern"
              >
                <option value="">Scegli un&apos;impresa...</option>
                {availableCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Separatore */}
            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm text-slate-500 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Informazioni opzionali (puoi inserirle in seguito)
              </p>
            </div>

            {/* Tipo Documento */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Tipo Documento
              </label>
              <select
                value={directDocType}
                onChange={(e) => setDirectDocType(e.target.value)}
                className="input-modern"
              >
                <option value="">Non specificato</option>
                {checklistItems.map((item) => (
                  <option key={item.docType} value={item.docType}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Data Emissione
                </label>
                <input
                  type="date"
                  value={directIssuedAt}
                  onChange={(e) => setDirectIssuedAt(e.target.value)}
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Data Scadenza
                </label>
                <input
                  type="date"
                  value={directExpiresAt}
                  onChange={(e) => setDirectExpiresAt(e.target.value)}
                  className="input-modern"
                />
              </div>
            </div>

            {/* Stato */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Stato Documento
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'gray', label: 'Non verificato', color: 'bg-gray-400' },
                  { value: 'green', label: 'Valido', color: 'bg-green-500' },
                  { value: 'yellow', label: 'In scadenza', color: 'bg-yellow-500' },
                  { value: 'red', label: 'Non valido', color: 'bg-red-500' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDirectStatus(option.value as typeof directStatus)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                      directStatus === option.value
                        ? 'border-slate-400 bg-slate-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${option.color}`} />
                    <span className="text-sm">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Note (opzionale)
              </label>
              <textarea
                value={directNotes}
                onChange={(e) => setDirectNotes(e.target.value)}
                placeholder="Es: Importato dal vecchio sistema, già verificato..."
                className="input-modern min-h-[80px] resize-none"
              />
            </div>

            {/* Upload Box */}
            <div className="pt-4 border-t border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                File PDF <span className="text-red-500">*</span>
              </label>
              {selectedCompany ? (
                directUploadSuccess ? (
                  <div className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center bg-green-50">
                    <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                    <p className="font-semibold text-green-700">Documento caricato con successo!</p>
                    <p className="text-sm text-green-600 mt-1">Puoi caricare un altro documento</p>
                    <button
                      onClick={() => setDirectUploadSuccess(false)}
                      className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      Carica un altro
                    </button>
                  </div>
                ) : (
                  <UploadBox 
                    onUpload={handleDirectUpload} 
                    accept=".pdf" 
                    maxSizeMB={10}
                    disabled={directUploading}
                  />
                )
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
                  <Upload className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-400 font-medium">Seleziona prima un&apos;impresa</p>
                </div>
              )}
              {directUploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Caricamento in corso...</span>
                </div>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="mt-6 p-4 bg-slate-100 border border-slate-200 rounded-lg">
            <h3 className="font-semibold text-slate-700 mb-2">Informazioni</h3>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• I documenti caricati direttamente appariranno con badge <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 rounded text-xs font-medium">📁 Diretto</span></li>
              <li>• Potrai modificare i metadati in qualsiasi momento</li>
              <li>• Se necessario, potrai ricaricare il documento con verifica AI</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
