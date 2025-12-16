'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage, getFirebaseDb } from '@/lib/firebaseClient';
import { 
  collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp,
  where, getDocs
} from 'firebase/firestore';
import { UploadBox } from '@/components/upload-box';
import { UploadTimeline, useDocumentPipeline } from '@/components/upload-timeline';
import { useCurrentDocumentByBlobName } from '@/hooks/useFirestore';
import { 
  ArrowLeft, CheckCircle2, Loader2, AlertTriangle, Upload, Building2, 
  FileUp, Sparkles, FolderUp, Calendar, FileText, Info, Eye, RefreshCw,
  FileCheck, Users, HardHat, ChevronRight, Clock, Shield, Plus, Trash2, User,
  Briefcase, Filter, Search
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ITP_DOCUMENT_TYPES, CANTIERE_DOCUMENT_TYPES, getITPDocumentType } from '@/lib/documentTypes';

export const dynamic = 'force-dynamic';

type UploadTab = 'itp' | 'personale' | 'cantieri';

interface UploadedITPDoc {
  docTypeKey: string;
  status: string;
  uploadedAt: any;
  blobName?: string;
  docId?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId: tenant, role, companyIds, user, loading: authLoading } = useAuth();
  
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  
  // Stato TAB principale
  const [activeTab, setActiveTab] = useState<UploadTab>('itp');
  
  // 🆕 Flag per sapere se abbiamo già applicato i query params
  const [paramsApplied, setParamsApplied] = useState(false);
  
  // Selezione impresa (condivisa tra TAB)
  const [selectedCompany, setSelectedCompany] = useState('');
  const [firestoreCompanies, setFirestoreCompanies] = useState<{id: string, name: string}[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // TAB ITP: stato documenti già caricati
  const [uploadedITPDocs, setUploadedITPDocs] = useState<UploadedITPDoc[]>([]);
  const [itpLoading, setItpLoading] = useState(false);
  
  // TAB ITP: documento selezionato per upload
  const [selectedITPDocType, setSelectedITPDocType] = useState<string | null>(null);
  const [uploadingITP, setUploadingITP] = useState(false);
  const [uploadedBlobName, setUploadedBlobName] = useState<string>('');
  const [uploadComplete, setUploadComplete] = useState(false);
  
  // 🆕 Modalità upload: AI vs Diretto (solo HQ)
  const [useAIVerification, setUseAIVerification] = useState(true);
  const [directUploadSuccess, setDirectUploadSuccess] = useState(false);
  
  // ============================================
  // TAB CANTIERI: Stati
  // ============================================
  const [cantieri, setCantieri] = useState<{id: string, nome: string, indirizzo?: string}[]>([]);
  const [cantieriLoading, setCantieriLoading] = useState(false);
  const [selectedCantiere, setSelectedCantiere] = useState('');
  const [uploadedCantiereDocs, setUploadedCantiereDocs] = useState<{docTypeKey: string; status: string; docId?: string}[]>([]);
  const [cantiereDocsLoading, setCantiereDocsLoading] = useState(false);
  const [selectedCantiereDocType, setSelectedCantiereDocType] = useState<string | null>(null);
  const [uploadingCantiere, setUploadingCantiere] = useState(false);
  const [cantiereUploadSuccess, setCantiereUploadSuccess] = useState(false);
  const [cantiereUploadedBlobName, setCantiereUploadedBlobName] = useState('');
  
  // ============================================
  // FORM NOMINATIVI POS
  // ============================================
  interface Nominativo {
    id: string;
    nome: string;
    cognome: string;
    codiceFiscale?: string;
    mansione?: string;
  }
  const [nominativi, setNominativi] = useState<Nominativo[]>([
    { id: crypto.randomUUID(), nome: '', cognome: '' }
  ]);
  const [nominativiError, setNominativiError] = useState<string | null>(null);
  
  // ============================================
  // TAB PERSONALE: Stati
  // ============================================
  interface PersonaleRecord {
    id: string;
    nome: string;
    cognome: string;
    codiceFiscale?: string;
    mansione?: string;
    cantieriAssegnati: string[];
    createdAt?: any;
  }
  const [personaleList, setPersonaleList] = useState<PersonaleRecord[]>([]);
  const [personaleLoading, setPersonaleLoading] = useState(false);
  const [personaleFilterCantiere, setPersonaleFilterCantiere] = useState<string>('all');

  // ============================================
  // 🆕 LETTURA QUERY PARAMS (da NavigationSheet)
  // ============================================
  
  useEffect(() => {
    if (paramsApplied || companiesLoading || firestoreCompanies.length === 0) return;
    
    const tabParam = searchParams.get('tab') as UploadTab | null;
    const companyParam = searchParams.get('company');
    const cantiereParam = searchParams.get('cantiere');
    
    // Applica tab
    if (tabParam && ['itp', 'personale', 'cantieri'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    
    // Applica company (solo se esiste nella lista delle imprese disponibili)
    if (companyParam) {
      const companyExists = firestoreCompanies.some(c => c.id === companyParam);
      if (companyExists) {
        setSelectedCompany(companyParam);
      }
    }
    
    // Applica cantiere (verrà applicato quando i cantieri sono caricati)
    if (cantiereParam) {
      // Salviamo in un ref o state per applicarlo dopo il caricamento dei cantieri
      sessionStorage.setItem('pending-cantiere', cantiereParam);
    }
    
    setParamsApplied(true);
  }, [searchParams, paramsApplied, companiesLoading, firestoreCompanies]);

  // Applica cantiere pendente quando i cantieri sono caricati
  useEffect(() => {
    if (cantieri.length === 0) return;
    
    const pendingCantiere = sessionStorage.getItem('pending-cantiere');
    if (pendingCantiere) {
      const cantiereExists = cantieri.some(c => c.id === pendingCantiere);
      if (cantiereExists) {
        setSelectedCantiere(pendingCantiere);
      }
      sessionStorage.removeItem('pending-cantiere');
    }
  }, [cantieri]);

  // ============================================
  // CARICAMENTO IMPRESE
  // ============================================
  
  useEffect(() => {
    if (!tenant || authLoading) {
      setCompaniesLoading(false);
      return;
    }

    const db = getFirebaseDb();
    
    if (isManagerOrVerifier) {
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
      if (companyIds.length === 0) {
        setFirestoreCompanies([]);
        setCompaniesLoading(false);
        return;
      }

      const loadCompanies = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const companies: {id: string, name: string}[] = [];
          
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

  // ============================================
  // TAB ITP: CARICAMENTO DOCUMENTI GIÀ PRESENTI
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || activeTab !== 'itp') {
      setUploadedITPDocs([]);
      return;
    }

    setItpLoading(true);
    const db = getFirebaseDb();
    
    // Query documenti con docCategory='itp' per questa impresa
    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/documents`),
      where('docCategory', '==', 'itp'),
      where('isCurrent', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: UploadedITPDoc[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        docs.push({
          docTypeKey: data.docTypeKey || data.docType || '',
          status: data.status || data.overall?.status || 'gray',
          uploadedAt: data.uploadedAt || data.createdAt,
          blobName: data.blobName,
          docId: docSnap.id,
        });
      });
      setUploadedITPDocs(docs);
      setItpLoading(false);
    }, (err) => {
      console.error("Error loading ITP docs:", err);
      setItpLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany, activeTab]);

  // ============================================
  // TAB CANTIERI: CARICAMENTO CANTIERI
  // (caricato anche per TAB Personale - serve per filtro)
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || (activeTab !== 'cantieri' && activeTab !== 'personale')) {
      setCantieri([]);
      setSelectedCantiere('');
      return;
    }

    setCantieriLoading(true);
    const db = getFirebaseDb();
    
    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/cantieri`),
      orderBy('nome', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr: {id: string, nome: string, indirizzo?: string}[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isActive !== false) {
          arr.push({
            id: docSnap.id,
            nome: data.nome || docSnap.id,
            indirizzo: data.indirizzo,
          });
        }
      });
      setCantieri(arr);
      setCantieriLoading(false);
    }, (err) => {
      console.error("Error loading cantieri:", err);
      setCantieriLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany, activeTab]);

  // ============================================
  // TAB CANTIERI: CARICAMENTO DOCUMENTI GIÀ PRESENTI
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || !selectedCantiere || activeTab !== 'cantieri') {
      setUploadedCantiereDocs([]);
      return;
    }

    setCantiereDocsLoading(true);
    const db = getFirebaseDb();
    
    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/documents`),
      where('docCategory', '==', 'cantiere'),
      where('cantiereId', '==', selectedCantiere),
      where('isCurrent', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: {docTypeKey: string; status: string; docId?: string}[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        docs.push({
          docTypeKey: data.docTypeKey || '',
          status: data.status || data.overall?.status || 'gray',
          docId: docSnap.id,
        });
      });
      setUploadedCantiereDocs(docs);
      setCantiereDocsLoading(false);
    }, (err) => {
      console.error("Error loading cantiere docs:", err);
      setCantiereDocsLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany, selectedCantiere, activeTab]);

  // ============================================
  // TAB PERSONALE: CARICAMENTO DIPENDENTI
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || activeTab !== 'personale') {
      setPersonaleList([]);
      return;
    }

    setPersonaleLoading(true);
    const db = getFirebaseDb();
    
    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/personale`),
      orderBy('cognome', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr: PersonaleRecord[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isActive !== false) {
          arr.push({
            id: docSnap.id,
            nome: data.nome || '',
            cognome: data.cognome || '',
            codiceFiscale: data.codiceFiscale,
            mansione: data.mansione,
            cantieriAssegnati: data.cantieriAssegnati || [],
            createdAt: data.createdAt,
          });
        }
      });
      setPersonaleList(arr);
      setPersonaleLoading(false);
    }, (err) => {
      console.error("Error loading personale:", err);
      setPersonaleLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany, activeTab]);

  // Personale filtrato per cantiere
  const filteredPersonale = useMemo(() => {
    if (personaleFilterCantiere === 'all') {
      return personaleList;
    }
    return personaleList.filter(p => p.cantieriAssegnati.includes(personaleFilterCantiere));
  }, [personaleList, personaleFilterCantiere]);

  // ============================================
  // CANTIERI: STATO PER OGNI TIPO DOCUMENTO
  // ============================================
  
  const cantiereDocStatus = useMemo(() => {
    const statusMap: Record<string, { uploaded: boolean; status?: string; docId?: string }> = {};
    
    CANTIERE_DOCUMENT_TYPES.forEach(docType => {
      const found = uploadedCantiereDocs.find(d => d.docTypeKey === docType.key);
      statusMap[docType.key] = {
        uploaded: !!found,
        status: found?.status,
        docId: found?.docId,
      };
    });
    
    return statusMap;
  }, [uploadedCantiereDocs]);

  const cantiereCompletionCount = useMemo(() => {
    return Object.values(cantiereDocStatus).filter(s => s.uploaded).length;
  }, [cantiereDocStatus]);

  // ============================================
  // ITP: STATO PER OGNI TIPO DOCUMENTO
  // ============================================
  
  const itpStatus = useMemo(() => {
    const statusMap: Record<string, { uploaded: boolean; status?: string; docId?: string }> = {};
    
    ITP_DOCUMENT_TYPES.forEach(docType => {
      const found = uploadedITPDocs.find(d => d.docTypeKey === docType.key);
      statusMap[docType.key] = {
        uploaded: !!found,
        status: found?.status,
        docId: found?.docId,
      };
    });
    
    return statusMap;
  }, [uploadedITPDocs]);

  const itpCompletionCount = useMemo(() => {
    return Object.values(itpStatus).filter(s => s.uploaded).length;
  }, [itpStatus]);

  // ============================================
  // UPLOAD DOCUMENTO ITP
  // ============================================
  
  const { document: uploadedDoc } = useCurrentDocumentByBlobName(tenant || '', selectedCompany || '', uploadedBlobName);
  const pipelineSteps = useDocumentPipeline(uploadedDoc);

  // Upload con verifica AI
  const handleUploadITP = async (file: File) => {
    if (!selectedCompany || !selectedITPDocType || !tenant) {
      throw new Error('Seleziona impresa e tipo documento');
    }

    setUploadingITP(true);
    setUploadComplete(false);

    const uuid = crypto.randomUUID();
    const docId = uuid;
    const storagePath = `docs/${tenant}/${selectedCompany}/tmp/${docId}.pdf`;
    const storageRef = ref(storage, storagePath);

    setUploadedBlobName(storagePath);

    try {
      // 1. Upload file
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          customMetadata: {
            docCategory: 'itp',
            docTypeKey: selectedITPDocType,
          }
        });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[ITP Upload] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

          setUploadComplete(true);
      
      // Reset dopo successo (la pipeline AI aggiornerà il documento)
      setTimeout(() => {
        setSelectedITPDocType(null);
      }, 2000);

    } catch (error) {
      console.error('[ITP Upload] Error:', error);
      throw error;
    } finally {
      setUploadingITP(false);
    }
  };

  // 🆕 Upload DIRETTO (senza verifica AI) - Solo HQ
  const handleDirectUploadITP = async (file: File) => {
    if (!selectedCompany || !selectedITPDocType || !tenant) {
      throw new Error('Seleziona impresa e tipo documento');
    }

    setUploadingITP(true);
    setDirectUploadSuccess(false);

    try {
      const uuid = crypto.randomUUID();
      const docId = uuid;
      // Path diverso: direct/ - la Cloud Function lo skipperà
      const storagePath = `direct/${tenant}/${selectedCompany}/${docId}.pdf`;
      const storageRef = ref(storage, storagePath);

      // 1. Carica il file su Storage
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[DirectUpload ITP] Progress:', progress);
          },
          reject,
          () => resolve()
      );
    });

      // 2. Scrivi direttamente in Firestore (nessuna pipeline AI)
      const db = getFirebaseDb();
      const docRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/documents/${docId}`);
      
      const itpDocType = getITPDocumentType(selectedITPDocType);
      
      const documentData: Record<string, any> = {
        blobName: storagePath,
        tenantId: tenant,
        companyId: selectedCompany,
        source: 'direct',
        docCategory: 'itp',
        docTypeKey: selectedITPDocType,
        docType: itpDocType?.label || selectedITPDocType,
        uploadedBy: user?.uid || 'unknown',
        uploadedByEmail: user?.email || 'unknown',
        uploadedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isCurrent: true,
        isDeleted: false,
        status: 'gray', // Non verificato
        overall: {
          status: 'gray',
          reason: 'Documento caricato direttamente (non verificato AI)',
          confidence: 0,
        },
      };

      await setDoc(docRef, documentData);

      // 3. Crea anche il pointer
      const pointerRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/docIndex/${selectedITPDocType}`);
      await setDoc(pointerRef, {
        currentDocId: docId,
        docType: selectedITPDocType,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log('[DirectUpload ITP] ✅ Documento salvato:', docId);
      setDirectUploadSuccess(true);
      
      // Reset dopo successo
      setTimeout(() => {
        setSelectedITPDocType(null);
        setDirectUploadSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('[DirectUpload ITP] ❌ Errore:', error);
      throw error;
    } finally {
      setUploadingITP(false);
    }
  };

  // ============================================
  // HELPER NOMINATIVI POS
  // ============================================
  
  const addNominativo = () => {
    setNominativi([...nominativi, { id: crypto.randomUUID(), nome: '', cognome: '' }]);
  };

  const removeNominativo = (id: string) => {
    if (nominativi.length > 1) {
      setNominativi(nominativi.filter(n => n.id !== id));
    }
  };

  const updateNominativo = (id: string, field: keyof Nominativo, value: string) => {
    setNominativi(nominativi.map(n => 
      n.id === id ? { ...n, [field]: value } : n
    ));
    setNominativiError(null);
  };

  const validateNominativi = (): boolean => {
    // Almeno un nominativo con nome e cognome
    const validNominativi = nominativi.filter(n => n.nome.trim() && n.cognome.trim());
    if (validNominativi.length === 0) {
      setNominativiError('Inserisci almeno un nominativo con nome e cognome');
      return false;
    }
    return true;
  };

  const resetNominativi = () => {
    setNominativi([{ id: crypto.randomUUID(), nome: '', cognome: '' }]);
    setNominativiError(null);
  };

  // Salva i nominativi nella collezione personale
  const saveNominativiToFirestore = async () => {
    if (!tenant || !selectedCompany || !selectedCantiere) return;
    
    const db = getFirebaseDb();
    const validNominativi = nominativi.filter(n => n.nome.trim() && n.cognome.trim());
    
    for (const nominativo of validNominativi) {
      // Genera ID basato su nome+cognome+company (per evitare duplicati)
      const personaleId = `${nominativo.nome.toLowerCase().trim()}-${nominativo.cognome.toLowerCase().trim()}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const personaleRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/personale/${personaleId}`);
      
      // Leggi il documento esistente per aggiornare cantieriAssegnati
      const { getDoc, arrayUnion } = await import('firebase/firestore');
      const existingDoc = await getDoc(personaleRef);
      
      if (existingDoc.exists()) {
        // Aggiorna: aggiungi il cantiere alla lista
        await setDoc(personaleRef, {
          cantieriAssegnati: arrayUnion(selectedCantiere),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        // Crea nuovo
        await setDoc(personaleRef, {
          nome: nominativo.nome.trim(),
          cognome: nominativo.cognome.trim(),
          ...(nominativo.codiceFiscale && { codiceFiscale: nominativo.codiceFiscale.trim().toUpperCase() }),
          ...(nominativo.mansione && { mansione: nominativo.mansione.trim() }),
          cantieriAssegnati: [selectedCantiere],
          companyId: selectedCompany,
          tenantId: tenant,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || 'unknown',
          isActive: true,
        });
      }
      
      console.log(`[Nominativi] Salvato: ${nominativo.nome} ${nominativo.cognome} per cantiere ${selectedCantiere}`);
    }
  };

  // Controlla se il documento selezionato è POS (richiede nominativi)
  const isPOSSelected = selectedCantiereDocType === 'pos';

  // ============================================
  // UPLOAD DOCUMENTO CANTIERE
  // ============================================
  
  const { document: cantiereUploadedDoc } = useCurrentDocumentByBlobName(
    tenant || '', 
    selectedCompany || '', 
    cantiereUploadedBlobName
  );
  const cantierePipelineSteps = useDocumentPipeline(cantiereUploadedDoc);

  // Upload con verifica AI (per documenti cantiere)
  const handleUploadCantiere = async (file: File) => {
    if (!selectedCompany || !selectedCantiereDocType || !tenant || !selectedCantiere) {
      throw new Error('Seleziona impresa, cantiere e tipo documento');
    }

    // 🆕 Validazione nominativi obbligatori per POS
    if (isPOSSelected && !validateNominativi()) {
      return; // L'errore viene mostrato dal validateNominativi
    }

    setUploadingCantiere(true);
    setCantiereUploadSuccess(false);

    const uuid = crypto.randomUUID();
    const docId = uuid;
    const storagePath = `docs/${tenant}/${selectedCompany}/tmp/${docId}.pdf`;
    const storageRef = ref(storage, storagePath);

    setCantiereUploadedBlobName(storagePath);

    try {
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          customMetadata: {
            docCategory: 'cantiere',
            docTypeKey: selectedCantiereDocType,
            cantiereId: selectedCantiere,
          }
        });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[Cantiere Upload] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

      // 🆕 Salva nominativi se POS
      if (isPOSSelected) {
        await saveNominativiToFirestore();
        resetNominativi();
      }

      setCantiereUploadSuccess(true);
      
      setTimeout(() => {
        setSelectedCantiereDocType(null);
        setCantiereUploadSuccess(false);
      }, 2000);

    } catch (error) {
      console.error('[Cantiere Upload] Error:', error);
      throw error;
    } finally {
      setUploadingCantiere(false);
    }
  };

  // Upload DIRETTO per cantiere (senza AI)
  const handleDirectUploadCantiere = async (file: File) => {
    if (!selectedCompany || !selectedCantiereDocType || !tenant || !selectedCantiere) {
      throw new Error('Seleziona impresa, cantiere e tipo documento');
    }

    // 🆕 Validazione nominativi obbligatori per POS
    if (isPOSSelected && !validateNominativi()) {
      return;
    }

    setUploadingCantiere(true);
    setCantiereUploadSuccess(false);

    try {
      const uuid = crypto.randomUUID();
      const docId = uuid;
      const storagePath = `direct/${tenant}/${selectedCompany}/${docId}.pdf`;
      const storageRef = ref(storage, storagePath);

      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[DirectUpload Cantiere] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

      const db = getFirebaseDb();
      const docRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/documents/${docId}`);
      
      const cantiereDocType = CANTIERE_DOCUMENT_TYPES.find(d => d.key === selectedCantiereDocType);
      const cantiereData = cantieri.find(c => c.id === selectedCantiere);
      
      const documentData: Record<string, any> = {
        blobName: storagePath,
        tenantId: tenant,
        companyId: selectedCompany,
        cantiereId: selectedCantiere,
        cantiereName: cantiereData?.nome || selectedCantiere,
        source: 'direct',
        docCategory: 'cantiere',
        docTypeKey: selectedCantiereDocType,
        docType: cantiereDocType?.label || selectedCantiereDocType,
        uploadedBy: user?.uid || 'unknown',
        uploadedByEmail: user?.email || 'unknown',
        uploadedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isCurrent: true,
        isDeleted: false,
        status: 'gray',
        overall: {
          status: 'gray',
          reason: 'Documento caricato direttamente (non verificato AI)',
          confidence: 0,
        },
      };

      await setDoc(docRef, documentData);

      // Crea pointer
      const pointerKey = `${selectedCantiereDocType}_${selectedCantiere}`;
      const pointerRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/docIndex/${pointerKey}`);
      await setDoc(pointerRef, {
        currentDocId: docId,
        docType: selectedCantiereDocType,
        cantiereId: selectedCantiere,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 🆕 Salva nominativi se POS
      if (isPOSSelected) {
        await saveNominativiToFirestore();
        resetNominativi();
      }

      console.log('[DirectUpload Cantiere] ✅ Documento salvato:', docId);
      setCantiereUploadSuccess(true);
      
      setTimeout(() => {
        setSelectedCantiereDocType(null);
        setCantiereUploadSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('[DirectUpload Cantiere] ❌ Errore:', error);
      throw error;
    } finally {
      setUploadingCantiere(false);
    }
  };

  // Helper: controlla se l'utente può caricare un tipo documento cantiere
  const canUploadCantiereDoc = (docTypeKey: string) => {
    const docType = CANTIERE_DOCUMENT_TYPES.find(d => d.key === docTypeKey);
    if (!docType) return false;
    
    // PSC solo HQ
    if (docType.uploadedBy === 'hq') {
      return isManagerOrVerifier;
    }
    // Accettazione PSC e POS: tutti
    return true;
  };

  // ============================================
  // RENDER
  // ============================================

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
                Gestione Documenti
              </h1>
              <p className="text-slate-500 mt-1">
                Carica e visualizza la documentazione dell&apos;impresa
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-xl border border-purple-200">
            <Shield className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Documentazione</span>
          </div>
        </div>
      </div>

      {/* Selezione Impresa (comune a tutte le TAB) */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
        <div>
            <h3 className="font-semibold text-slate-800">Seleziona Impresa</h3>
            <p className="text-xs text-slate-500">Scegli per quale impresa stai caricando i documenti</p>
              </div>
            </div>
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
            setSelectedITPDocType(null);
            setUploadedBlobName('');
            setUploadComplete(false);
          }}
          className="input-modern"
        >
          <option value="">Scegli un&apos;impresa...</option>
          {firestoreCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
      </div>

      {/* TAB Navigation */}
      <div className="flex gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl">
        <button
          onClick={() => setActiveTab('itp')}
          className={`
            flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
            ${activeTab === 'itp'
              ? 'bg-white text-violet-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <FileCheck className="w-5 h-5" />
          <span>ITP</span>
          {selectedCompany && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'itp' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {itpCompletionCount}/{ITP_DOCUMENT_TYPES.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('personale')}
          className={`
            flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
            ${activeTab === 'personale'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <Users className="w-5 h-5" />
          <span>Personale</span>
        </button>
        <button
          onClick={() => setActiveTab('cantieri')}
          className={`
            flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
            ${activeTab === 'cantieri'
              ? 'bg-white text-orange-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <HardHat className="w-5 h-5" />
          <span>Cantieri</span>
        </button>
      </div>

      {/* ========== TAB 1: DOCUMENTAZIONE ITP ========== */}
      {activeTab === 'itp' && (
        <div>
          {!selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Seleziona un&apos;impresa per vedere la documentazione ITP</p>
            </div>
          ) : itpLoading ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-slate-400 animate-spin mb-3" />
              <p className="text-slate-500">Caricamento documentazione...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonna Sinistra: Checklist ITP */}
              <div className="lg:col-span-2">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-purple-50">
                    <div className="flex items-center justify-between">
                      <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-violet-500" />
                        Documentazione ITP
                      </h2>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-violet-700">
                          {itpCompletionCount}/{ITP_DOCUMENT_TYPES.length} completati
                        </div>
                        <div className="w-24 h-2 bg-violet-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all"
                            style={{ width: `${(itpCompletionCount / ITP_DOCUMENT_TYPES.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Documenti obbligatori per l&apos;Idoneità Tecnico-Professionale
                    </p>
                  </div>
                  
                  <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                    {ITP_DOCUMENT_TYPES.map((docType) => {
                      const status = itpStatus[docType.key];
                      const isSelected = selectedITPDocType === docType.key;
                      
                      return (
                        <div
                          key={docType.key}
                          className={`px-6 py-4 transition-colors ${
                            isSelected ? 'bg-violet-50' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                status.uploaded 
                                  ? status.status === 'green' 
                                    ? 'bg-emerald-100' 
                                    : status.status === 'yellow'
                                    ? 'bg-amber-100'
                                    : status.status === 'red'
                                    ? 'bg-red-100'
                                    : 'bg-slate-100'
                                  : 'bg-slate-100'
                              }`}>
                                {status.uploaded ? (
                                  <CheckCircle2 className={`w-5 h-5 ${
                                    status.status === 'green' 
                                      ? 'text-emerald-600' 
                                      : status.status === 'yellow'
                                      ? 'text-amber-600'
                                      : status.status === 'red'
                                      ? 'text-red-600'
                                      : 'text-slate-400'
                                  }`} />
                                ) : (
                                  <Clock className="w-5 h-5 text-slate-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 text-sm">
                                  {docType.label}
                                </p>
                                {docType.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                    {docType.description}
                                  </p>
                                )}
                                {docType.normativeRef && (
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    Rif: {docType.normativeRef}
                                  </p>
                                )}
                              </div>
          </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {status.uploaded ? (
                                <>
                                  <button
                                    onClick={() => status.docId && router.push(`/document?id=${status.docId}&tid=${tenant}`)}
                                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Visualizza"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setSelectedITPDocType(docType.key)}
                                    className="p-2 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                    title="Sostituisci"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setSelectedITPDocType(docType.key)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    isSelected
                                      ? 'bg-violet-600 text-white'
                                      : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                                  }`}
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  Carica
                                </button>
                              )}
              </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Colonna Destra: Area Upload */}
              <div className="space-y-6">
                {selectedITPDocType ? (
                  <>
                    {/* Documento selezionato */}
                    <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-500 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-violet-900">
                            {getITPDocumentType(selectedITPDocType)?.shortLabel}
                          </p>
                          <p className="text-xs text-violet-600 line-clamp-1">
                            {getITPDocumentType(selectedITPDocType)?.label}
                          </p>
              </div>
                        <button
                          onClick={() => setSelectedITPDocType(null)}
                          className="p-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-100 rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* 🆕 Toggle AI vs Diretto (Solo HQ) */}
                    {isManagerOrVerifier && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-xs text-slate-500 mb-3 font-medium">Modalità caricamento</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setUseAIVerification(true)}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                              useAIVerification
                                ? 'bg-violet-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <Sparkles className="w-4 h-4" />
                            Verifica AI
                          </button>
                          <button
                            onClick={() => setUseAIVerification(false)}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                              !useAIVerification
                                ? 'bg-slate-700 text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <FolderUp className="w-4 h-4" />
                            Diretto
                          </button>
                        </div>
                        {!useAIVerification && (
                          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Il documento non sarà verificato dall&apos;AI
                          </p>
                        )}
            </div>
          )}

                    {/* Upload Box */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          useAIVerification 
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                            : 'bg-gradient-to-br from-slate-500 to-slate-600'
                        }`}>
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Carica File</h3>
                          <p className="text-xs text-slate-500">
                            {useAIVerification ? 'Verrà verificato automaticamente' : 'Nessuna verifica AI'}
                          </p>
              </div>
            </div>
                      
                      {directUploadSuccess ? (
                        <div className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center bg-green-50">
                          <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                          <p className="font-semibold text-green-700">Documento caricato!</p>
                          <p className="text-sm text-green-600 mt-1">Caricato senza verifica AI</p>
                        </div>
                      ) : (
                        <UploadBox 
                          onUpload={useAIVerification ? handleUploadITP : handleDirectUploadITP} 
                          accept=".pdf" 
                          maxSizeMB={10}
                          disabled={uploadingITP}
                        />
                      )}
                      
                      {uploadingITP && (
                        <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Caricamento...</span>
              </div>
            )}
      </div>

                    {/* Pipeline Timeline (solo modalità AI) */}
                    {useAIVerification && uploadComplete && uploadedBlobName && (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-slate-800">
                            Elaborazione
              </h3>
              {uploadedDoc?.id && uploadedDoc?.status && (
                <button
                  onClick={() => router.push(`/document?id=${uploadedDoc.id}&tid=${tenant}`)}
                              className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                >
                              Apri dettaglio →
                </button>
              )}
            </div>
            <UploadTimeline steps={pipelineSteps} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <ChevronRight className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">Seleziona un documento</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Clicca su &quot;Carica&quot; accanto al documento che vuoi caricare
                    </p>
                  </div>
                )}

                {/* Info Box */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Verifica automatica</p>
                      <p className="text-xs text-blue-700 mt-1">
                        I documenti caricati vengono verificati automaticamente dall&apos;AI per controllare validità e conformità.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== TAB 2: PERSONALE ========== */}
      {activeTab === 'personale' && (
        <div>
          {!selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Seleziona un&apos;impresa per vedere l&apos;archivio personale</p>
            </div>
          ) : personaleLoading ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-slate-400 animate-spin mb-3" />
              <p className="text-slate-500">Caricamento personale...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header con filtri */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Archivio Personale</h2>
                      <p className="text-sm text-slate-500">
                        {personaleList.length} dipendenti registrati
                      </p>
                    </div>
                  </div>
                  
                  {/* Filtro Cantiere */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Filter className="w-4 h-4" />
                      <span className="text-sm font-medium">Filtra per cantiere:</span>
                    </div>
                    <select
                      value={personaleFilterCantiere}
                      onChange={(e) => setPersonaleFilterCantiere(e.target.value)}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
                    >
                      <option value="all">Tutti i dipendenti</option>
                      {cantieri.map((cantiere) => (
                        <option key={cantiere.id} value={cantiere.id}>
                          {cantiere.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Lista dipendenti */}
              {personaleList.length === 0 ? (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium mb-2">Nessun dipendente registrato</p>
                  <p className="text-slate-400 text-sm max-w-md mx-auto">
                    I dipendenti verranno aggiunti automaticamente quando carichi un POS nel TAB Cantieri.
                  </p>
                </div>
              ) : filteredPersonale.length === 0 ? (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
                  <Search className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium mb-2">Nessun dipendente trovato</p>
                  <p className="text-slate-400 text-sm">
                    Nessun dipendente assegnato a questo cantiere
                  </p>
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800">
                        {filteredPersonale.length} {filteredPersonale.length === 1 ? 'dipendente' : 'dipendenti'}
                        {personaleFilterCantiere !== 'all' && (
                          <span className="font-normal text-slate-500">
                            {' '}nel cantiere selezionato
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <div className="divide-y divide-slate-100">
                    {filteredPersonale.map((persona) => (
                      <div key={persona.id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0">
                              <User className="w-6 h-6 text-slate-500" />
                            </div>
                            
                            {/* Info persona */}
                  <div>
                              <p className="font-semibold text-slate-800 text-lg">
                                {persona.cognome} {persona.nome}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 mt-1">
                                {persona.codiceFiscale && (
                                  <span className="text-sm text-slate-500 font-mono">
                                    {persona.codiceFiscale}
                                  </span>
                                )}
                                {persona.mansione && (
                                  <span className="flex items-center gap-1 text-sm text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                                    <Briefcase className="w-3.5 h-3.5" />
                                    {persona.mansione}
                                  </span>
                                )}
                  </div>
                            </div>
                          </div>
                          
                          {/* Cantieri assegnati */}
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs text-slate-500 mb-1">Cantieri assegnati</p>
                            <div className="flex flex-wrap justify-end gap-1">
                              {persona.cantieriAssegnati.length === 0 ? (
                                <span className="text-xs text-slate-400 italic">Nessuno</span>
                              ) : (
                                persona.cantieriAssegnati.map((cantiereId) => {
                                  const cantiereInfo = cantieri.find(c => c.id === cantiereId);
                                  return (
                    <span
                                      key={cantiereId}
                                      className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium"
                                      title={cantiereInfo?.nome || cantiereId}
                                    >
                                      <HardHat className="w-3 h-3 inline mr-1" />
                                      {cantiereInfo?.nome || cantiereId.substring(0, 8) + '...'}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Archivio cumulativo</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Questo archivio contiene tutti i dipendenti che sono stati inseriti durante il caricamento dei POS. 
                      Ogni dipendente può essere assegnato a più cantieri.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== TAB 3: CANTIERI ========== */}
      {activeTab === 'cantieri' && (
        <div>
          {!selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Seleziona un&apos;impresa per vedere i cantieri</p>
            </div>
          ) : cantieriLoading ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-slate-400 animate-spin mb-3" />
              <p className="text-slate-500">Caricamento cantieri...</p>
            </div>
          ) : cantieri.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <HardHat className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Nessun cantiere trovato</p>
              <p className="text-slate-400 text-sm mb-4">
                Crea prima un cantiere dalla pagina Imprese
              </p>
              {isManagerOrVerifier && (
                <button
                  onClick={() => router.push(`/cantieri?cid=${selectedCompany}`)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-medium"
                >
                  Vai a Gestione Cantieri
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selezione Cantiere */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                    <HardHat className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Seleziona Cantiere</h3>
                    <p className="text-xs text-slate-500">Scegli il cantiere per cui caricare i documenti</p>
                  </div>
                </div>
                <select
                  value={selectedCantiere}
                  onChange={(e) => {
                    setSelectedCantiere(e.target.value);
                    setSelectedCantiereDocType(null);
                  }}
                  className="input-modern"
                >
                  <option value="">Scegli un cantiere...</option>
                  {cantieri.map((cantiere) => (
                    <option key={cantiere.id} value={cantiere.id}>
                      {cantiere.nome} {cantiere.indirizzo ? `- ${cantiere.indirizzo}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Checklist documenti cantiere */}
              {selectedCantiere && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Colonna Sinistra: Checklist */}
                  <div className="lg:col-span-2">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50">
                        <div className="flex items-center justify-between">
                          <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-orange-500" />
                            Documenti Cantiere
                          </h2>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-orange-700">
                              {cantiereCompletionCount}/{CANTIERE_DOCUMENT_TYPES.length} completati
                            </div>
                            <div className="w-20 h-2 bg-orange-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all"
                                style={{ width: `${(cantiereCompletionCount / CANTIERE_DOCUMENT_TYPES.length) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Cantiere: <span className="font-medium">{cantieri.find(c => c.id === selectedCantiere)?.nome}</span>
                        </p>
                      </div>
                      
                      {cantiereDocsLoading ? (
                        <div className="p-8 text-center">
                          <Loader2 className="w-8 h-8 mx-auto text-slate-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {CANTIERE_DOCUMENT_TYPES.map((docType) => {
                            const status = cantiereDocStatus[docType.key];
                            const isSelected = selectedCantiereDocType === docType.key;
                            const canUpload = canUploadCantiereDoc(docType.key);
                            
                            return (
                              <div
                                key={docType.key}
                                className={`px-6 py-4 transition-colors ${
                                  isSelected ? 'bg-orange-50' : 'hover:bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 flex-1">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      status.uploaded 
                                        ? status.status === 'green' 
                                          ? 'bg-emerald-100' 
                                          : status.status === 'yellow'
                                          ? 'bg-amber-100'
                                          : status.status === 'red'
                                          ? 'bg-red-100'
                                          : 'bg-slate-100'
                                        : docType.uploadedBy === 'hq' ? 'bg-teal-50' : 'bg-orange-50'
                                    }`}>
                                      {status.uploaded ? (
                                        <CheckCircle2 className={`w-5 h-5 ${
                                          status.status === 'green' 
                                            ? 'text-emerald-600' 
                                            : status.status === 'yellow'
                                            ? 'text-amber-600'
                                            : status.status === 'red'
                                            ? 'text-red-600'
                                            : 'text-slate-400'
                                        }`} />
                                      ) : (
                                        <FileText className={`w-5 h-5 ${
                                          docType.uploadedBy === 'hq' ? 'text-teal-500' : 'text-orange-500'
                                        }`} />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-800">
                                        {docType.label}
                                      </p>
                                      {docType.description && (
                                        <p className="text-xs text-slate-500 mt-0.5">
                                          {docType.description}
                                        </p>
                                      )}
                                      <p className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                        docType.uploadedBy === 'hq' 
                                          ? 'bg-teal-100 text-teal-700' 
                                          : 'bg-orange-100 text-orange-700'
                                      }`}>
                                        {docType.uploadedBy === 'hq' ? (
                                          <>
                                            <Shield className="w-3 h-3" />
                                            Caricato da HQ
                                          </>
                                        ) : (
                                          <>
                                            <Building2 className="w-3 h-3" />
                                            Onere dell&apos;impresa
                                          </>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {status.uploaded ? (
                                      <>
                                        <button
                                          onClick={() => status.docId && router.push(`/document?id=${status.docId}&tid=${tenant}`)}
                                          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                          title="Visualizza"
                                        >
                                          <Eye className="w-4 h-4" />
                                        </button>
                                        {canUpload && (
                                          <button
                                            onClick={() => setSelectedCantiereDocType(docType.key)}
                                            className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                            title="Sostituisci"
                                          >
                                            <RefreshCw className="w-4 h-4" />
                                          </button>
                                        )}
                                      </>
                                    ) : canUpload ? (
                                      <button
                                        onClick={() => setSelectedCantiereDocType(docType.key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                          isSelected
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                        }`}
                                      >
                                        <Upload className="w-3.5 h-3.5" />
                                        Carica
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-400 italic">
                                        Solo HQ
                      </span>
                    )}
                  </div>
                </div>
                              </div>
                            );
                          })}
              </div>
            )}
                    </div>
                  </div>

                  {/* Colonna Destra: Area Upload */}
                  <div className="space-y-6">
                    {selectedCantiereDocType ? (
                      <>
                        {/* Documento selezionato */}
                        <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-orange-900">
                                {CANTIERE_DOCUMENT_TYPES.find(d => d.key === selectedCantiereDocType)?.shortLabel}
                              </p>
                              <p className="text-xs text-orange-600">
                                {cantieri.find(c => c.id === selectedCantiere)?.nome}
                              </p>
                            </div>
                            <button
                              onClick={() => setSelectedCantiereDocType(null)}
                              className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-100 rounded-lg"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Toggle AI vs Diretto (Solo HQ) */}
                        {isManagerOrVerifier && (
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-xs text-slate-500 mb-3 font-medium">Modalità caricamento</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setUseAIVerification(true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                  useAIVerification
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <Sparkles className="w-4 h-4" />
                                Verifica AI
                              </button>
                              <button
                                onClick={() => setUseAIVerification(false)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                  !useAIVerification
                                    ? 'bg-slate-700 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <FolderUp className="w-4 h-4" />
                                Diretto
                              </button>
                            </div>
          </div>
        )}

                        {/* 🆕 FORM NOMINATIVI (solo per POS) */}
                        {isPOSSelected && (
                          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-blue-200 p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                <Users className="w-5 h-5 text-white" />
        </div>
                              <div>
                                <h3 className="font-semibold text-slate-800">Personale Operativo</h3>
                                <p className="text-xs text-slate-500">Inserisci i nominativi dei lavoratori per questo cantiere</p>
      </div>
                            </div>

                            {/* Lista nominativi */}
                            <div className="space-y-3 mb-4">
                              {nominativi.map((nominativo, index) => (
                                <div key={nominativo.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs font-medium text-slate-500">Lavoratore {index + 1}</span>
                                    {nominativi.length > 1 && (
                                      <button
                                        onClick={() => removeNominativo(nominativo.id)}
                                        className="ml-auto p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                        title="Rimuovi"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      placeholder="Nome *"
                                      value={nominativo.nome}
                                      onChange={(e) => updateNominativo(nominativo.id, 'nome', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Cognome *"
                                      value={nominativo.cognome}
                                      onChange={(e) => updateNominativo(nominativo.id, 'cognome', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Codice Fiscale"
                                      value={nominativo.codiceFiscale || ''}
                                      onChange={(e) => updateNominativo(nominativo.id, 'codiceFiscale', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Mansione"
                                      value={nominativo.mansione || ''}
                                      onChange={(e) => updateNominativo(nominativo.id, 'mansione', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Errore validazione */}
                            {nominativiError && (
                              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                {nominativiError}
                              </div>
                            )}

                            {/* Pulsante aggiungi */}
                            <button
                              onClick={addNominativo}
                              className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                            >
                              <Plus className="w-4 h-4" />
                              Aggiungi lavoratore
                            </button>

                            {/* Info */}
                            <p className="mt-3 text-xs text-slate-400">
                              * Nome e Cognome obbligatori. I nominativi saranno salvati nell&apos;archivio personale.
                            </p>
                          </div>
                        )}

                        {/* Upload Box */}
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              useAIVerification 
                                ? 'bg-gradient-to-br from-orange-500 to-amber-600'
                                : 'bg-gradient-to-br from-slate-500 to-slate-600'
                            }`}>
                              <Upload className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-800">Carica File</h3>
                              <p className="text-xs text-slate-500">
                                {useAIVerification ? 'Verrà verificato automaticamente' : 'Nessuna verifica AI'}
                              </p>
                            </div>
                          </div>
                          
                          {cantiereUploadSuccess ? (
                            <div className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center bg-green-50">
                              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
                              <p className="font-semibold text-green-700">Documento caricato!</p>
                            </div>
                          ) : (
                            <UploadBox 
                              onUpload={useAIVerification ? handleUploadCantiere : handleDirectUploadCantiere} 
                              accept=".pdf" 
                              maxSizeMB={10}
                              disabled={uploadingCantiere}
                            />
                          )}
                          
                          {uploadingCantiere && (
                            <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Caricamento...</span>
                            </div>
                          )}
                        </div>

                        {/* Pipeline Timeline (solo AI) */}
                        {useAIVerification && cantiereUploadSuccess && cantiereUploadedBlobName && (
                          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-semibold text-slate-800">Elaborazione</h3>
                              {cantiereUploadedDoc?.id && cantiereUploadedDoc?.status && (
                                <button
                                  onClick={() => router.push(`/document?id=${cantiereUploadedDoc.id}&tid=${tenant}`)}
                                  className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                                >
                                  Apri dettaglio →
                                </button>
                              )}
                            </div>
                            <UploadTimeline steps={cantierePipelineSteps} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-8 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
                          <ChevronRight className="w-8 h-8 text-orange-400" />
                        </div>
                        <p className="text-slate-600 font-medium">Seleziona un documento</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Clicca su &quot;Carica&quot; accanto al documento
                        </p>
                      </div>
                    )}

                    {/* Info Box */}
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-orange-800">Documenti obbligatori</p>
                          <p className="text-xs text-orange-700 mt-1">
                            PSC è caricato da HQ. L&apos;impresa deve caricare Accettazione PSC e POS.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
