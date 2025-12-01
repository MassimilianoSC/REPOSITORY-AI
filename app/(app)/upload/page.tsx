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
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
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
  
  // ✅ FIX: Carica le aziende da Firestore (quelle create in /admin/aziende)
  useEffect(() => {
    if (!tenant || authLoading) {
      setCompaniesLoading(false);
      return;
    }

    const db = getFirebaseDb();
    // Query semplice: ordina per nome (filtra isActive lato client per evitare indice)
    const q = query(
      collection(db, `tenants/${tenant}/companies`),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filtra solo aziende attive (isActive !== false)
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
  }, [tenant, authLoading]);

  // ✅ RBAC: Le aziende disponibili dipendono dal ruolo
  // - manager/verifier: vedono TUTTE le aziende da Firestore
  // - uploader: vede SOLO le sue aziende assegnate (filtra per ID nelle claims)
  const availableCompanies = (role === 'manager' || role === 'verifier')
    ? firestoreCompanies
    : firestoreCompanies.filter(c => companyIds.includes(c.id)); // Uploader: filtra per company_ids

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

      {/* Layout a 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Colonna Sinistra: Checklist */}
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Documenti Richiesti</h2>
            <DocumentChecklist
              items={checklistItems}
              onSelectDocType={handleSelectDocType}
            />
          </div>
        </div>

        {/* Colonna Destra: Upload */}
        <div>
          <div className="mb-6">
            <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-2">
              Seleziona Azienda <span className="text-red-500">*</span>
            </label>
            <select
              id="company"
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setCompanyHighlight(false);
              }}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-300 ${
                companyHighlight 
                  ? 'border-orange-500 ring-2 ring-orange-300 animate-pulse bg-orange-50' 
                  : 'border-slate-300'
              }`}
            >
              <option value="">Scegli un'azienda...</option>
              {availableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {companyHighlight && selectedDocType && (
              <p className="mt-2 text-sm text-orange-600 font-medium animate-pulse">
                ⚠️ Seleziona un'azienda per caricare: {checklistItems.find(i => i.docType === selectedDocType)?.displayName}
              </p>
            )}
          </div>

          {selectedDocType && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <strong>Tipo documento selezionato:</strong> {checklistItems.find(i => i.docType === selectedDocType)?.displayName}
              </p>
            </div>
          )}

          <div id="upload-section">
            {selectedCompany ? (
              <UploadBox onUpload={handleUpload} accept=".pdf" maxSizeMB={10} />
            ) : (
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center bg-slate-50">
                <p className="text-slate-500">Seleziona prima un'azienda</p>
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
