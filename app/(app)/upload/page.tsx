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
  Briefcase, Filter, Search, Archive, Download, Truck
} from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { DownloadButton } from '@/components/DownloadButton';
import { useDocumentsCollectionGroup, useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { mapBackendToUI } from '@/lib/statusMapper';
import { getIssuedAt, getExpiresAt, fmtDate, getConfidence } from '@/lib/fields';
import { DocumentItem } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { ITP_DOCUMENT_TYPES, CANTIERE_DOCUMENT_TYPES, PERSONALE_DOCUMENT_TYPES, getITPDocumentType, getPersonaleDocumentType } from '@/lib/documentTypes';

export const dynamic = 'force-dynamic';

type MainTab = 'carica' | 'visualizza';
type CaricaTab = 'itp' | 'personale' | 'cantieri' | 'mezzi';
type VisualizzaTab = 'tutti' | 'itp' | 'cantieri' | 'personale' | 'mezzi';

interface UploadedITPDoc {
  docTypeKey: string;
  status: string;
  uploadedAt: any;
  blobName?: string;
  docId?: string;
}

// Array vuoto stabile per evitare re-render
const EMPTY_COMPANY_IDS: string[] = [];

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenantId: tenant, role, companyIds, user, loading: authLoading } = useAuth();
  
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  
  // Stato TAB principale (Carica vs Visualizza)
  const [mainTab, setMainTab] = useState<MainTab>('carica');
  const [caricaTab, setCaricaTab] = useState<CaricaTab>('itp');
  const [visualizzaTab, setVisualizzaTab] = useState<VisualizzaTab>('tutti');
  
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
  // FORM MEZZI POS
  // ============================================
  interface MezzoPOS {
    id: string;
    targa: string;
    tipo: string;
    marcaModello?: string;
    isExisting?: boolean; // true se selezionato da esistenti
  }
  const [mezziPOS, setMezziPOS] = useState<MezzoPOS[]>([]);
  
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
  
  // 🆕 Form aggiunta manuale dipendente
  const [showAddPersonaleForm, setShowAddPersonaleForm] = useState(false);
  const [newPersonale, setNewPersonale] = useState({ nome: '', cognome: '', codiceFiscale: '', mansione: '' });
  const [savingPersonale, setSavingPersonale] = useState(false);
  
  // 🆕 Modifica/Assegnazione cantiere
  const [editingPersonaleId, setEditingPersonaleId] = useState<string | null>(null);
  const [assigningCantiere, setAssigningCantiere] = useState<string | null>(null);
  const [deletingPersonaleId, setDeletingPersonaleId] = useState<string | null>(null);

  // 🆕 TAB PERSONALE: Documenti per dipendente
  const [selectedPersonale, setSelectedPersonale] = useState<string | null>(null);
  const [selectedPersonaleDocType, setSelectedPersonaleDocType] = useState<string | null>(null);
  const [uploadedPersonaleDocs, setUploadedPersonaleDocs] = useState<{docTypeKey: string; status: string; docId?: string; uploadedAt?: any}[]>([]);
  const [personaleDocsLoading, setPersonaleDocsLoading] = useState(false);
  const [uploadingPersonale, setUploadingPersonale] = useState(false);
  const [personaleUploadSuccess, setPersonaleUploadSuccess] = useState(false);
  const [personaleUploadedBlobName, setPersonaleUploadedBlobName] = useState('');

  // ============================================
  // TAB MEZZI: Stati
  // ============================================
  interface MezzoRecord {
    id: string;
    targa: string;
    tipo: string;
    marcaModello?: string;
    cantieriAssegnati: string[];
    createdAt?: any;
  }
  const [mezziList, setMezziList] = useState<MezzoRecord[]>([]);
  const [mezziLoading, setMezziLoading] = useState(false);
  const [mezziFilterCantiere, setMezziFilterCantiere] = useState<string>('all');
  
  // Form aggiunta manuale mezzo
  const [showAddMezzoForm, setShowAddMezzoForm] = useState(false);
  const [newMezzo, setNewMezzo] = useState({ targa: '', tipo: '', marcaModello: '' });
  const [savingMezzo, setSavingMezzo] = useState(false);
  
  // Modifica/Assegnazione cantiere mezzo
  const [assigningMezzoCantiere, setAssigningMezzoCantiere] = useState<string | null>(null);
  const [deletingMezzoId, setDeletingMezzoId] = useState<string | null>(null);

  // ============================================
  // TAB VISUALIZZA: Stati (ex Archivio)
  // ============================================
  const [archivioCompanyFilter, setArchivioCompanyFilter] = useState<string>('all');

  // 🆕 Query documenti per Archivio (stessi hook di Scadenze/Dashboard)
  const { documents: managerAllDocs, loading: managerDocsLoading } = useDocumentsCollectionGroup(
    isManagerOrVerifier && !authLoading ? (tenant || '') : '',
    undefined,
    { limit: 500 }
  );

  const { documents: uploaderAllDocs, loading: uploaderDocsLoading } = useMultiCompanyDocuments(
    !isManagerOrVerifier && !authLoading ? (tenant || '') : '',
    !isManagerOrVerifier && !authLoading ? companyIds : EMPTY_COMPANY_IDS,
    { limit: 500 }
  );

  // Seleziona i documenti in base al ruolo
  const allDocumentsRaw = isManagerOrVerifier ? managerAllDocs : uploaderAllDocs;
  const allDocsLoading = isManagerOrVerifier ? managerDocsLoading : uploaderDocsLoading;

  // Trasforma documenti raw in DocumentItem per la tabella
  const allDocuments: DocumentItem[] = useMemo(() => {
    return allDocumentsRaw.map((doc) => ({
      id: doc.id,
      docType: doc.docType || 'Sconosciuto',
      status: mapBackendToUI(doc.overall?.status || doc.status),
      issuedAt: fmtDate(getIssuedAt(doc)),
      expiresAt: fmtDate(getExpiresAt(doc)),
      confidence: getConfidence(doc),
      reason: doc.overall?.reason || doc.reason || '',
      company: doc.companyId || 'N/D',
      tenant: tenant || undefined,
      blobName: doc.blobName || undefined,
      source: doc.source || 'ai',
      docCategory: doc.docCategory || undefined,
      docTypeKey: doc.docTypeKey || undefined,
      cantiereId: doc.cantiereId || undefined,
    }));
  }, [allDocumentsRaw, tenant]);

  // Filtra documenti per archivio
  const filteredArchiveDocs = useMemo(() => {
    let docs = allDocuments;
    
    // Filtra per impresa
    if (archivioCompanyFilter !== 'all') {
      docs = docs.filter(d => d.company === archivioCompanyFilter);
    }
    
    // Filtra per sub-tab categoria
    if (visualizzaTab === 'itp') {
      docs = docs.filter(d => d.docCategory === 'itp');
    } else if (visualizzaTab === 'cantieri') {
      docs = docs.filter(d => d.docCategory === 'cantiere');
    } else if (visualizzaTab === 'personale') {
      docs = docs.filter(d => d.docCategory === 'personale');
    } else if (visualizzaTab === 'mezzi') {
      docs = docs.filter(d => d.docCategory === 'mezzi');
    }
    
    return docs;
  }, [allDocuments, archivioCompanyFilter, visualizzaTab]);

  // Estrai imprese uniche per filtro archivio
  const archivioUniqueCompanies = useMemo(() => {
    return Array.from(new Set(allDocuments.map(d => d.company)));
  }, [allDocuments]);

  // ============================================
  // 🆕 LETTURA QUERY PARAMS (da NavigationSheet)
  // ============================================
  
  useEffect(() => {
    if (paramsApplied || companiesLoading || firestoreCompanies.length === 0) return;
    
    const tabParam = searchParams.get('tab');
    const companyParam = searchParams.get('company');
    const cantiereParam = searchParams.get('cantiere');
    
    // Applica tab - supporta sia i sub-tab (itp, personale, cantieri) che visualizza
    if (tabParam) {
      if (['itp', 'personale', 'cantieri'].includes(tabParam)) {
        setMainTab('carica');
        setCaricaTab(tabParam as CaricaTab);
      } else if (tabParam === 'visualizza' || tabParam === 'archivio') {
        setMainTab('visualizza');
      }
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
          
          // ✅ FIX: Auto-seleziona se l'Uploader ha una sola impresa
          if (companies.length === 1 && !selectedCompany) {
            setSelectedCompany(companies[0].id);
          }
        } catch (err) {
          console.error("Error loading companies for uploader:", err);
        } finally {
          setCompaniesLoading(false);
        }
      };

      loadCompanies();
    }
  }, [tenant, authLoading, isManagerOrVerifier, companyIds, selectedCompany]);

  // ============================================
  // TAB ITP: CARICAMENTO DOCUMENTI GIÀ PRESENTI
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || mainTab !== 'carica' || caricaTab !== 'itp') {
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
  }, [tenant, selectedCompany, mainTab, caricaTab]);

  // ============================================
  // TAB CANTIERI: CARICAMENTO CANTIERI
  // (caricato anche per TAB Personale - serve per filtro)
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || mainTab !== 'carica' || (caricaTab !== 'cantieri' && caricaTab !== 'personale')) {
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
  }, [tenant, selectedCompany, mainTab, caricaTab]);

  // ============================================
  // TAB CANTIERI: CARICAMENTO DOCUMENTI GIÀ PRESENTI
  // ============================================
  
  useEffect(() => {
    if (!tenant || !selectedCompany || !selectedCantiere || mainTab !== 'carica' || caricaTab !== 'cantieri') {
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
  }, [tenant, selectedCompany, selectedCantiere, mainTab, caricaTab]);

  // ============================================
  // TAB PERSONALE: CARICAMENTO DIPENDENTI
  // ============================================
  
  // 🆕 Carica personale SEMPRE quando c'è impresa selezionata (serve anche per form POS)
  useEffect(() => {
    if (!tenant || !selectedCompany) {
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
  }, [tenant, selectedCompany]);

  // Personale filtrato per cantiere
  const filteredPersonale = useMemo(() => {
    if (personaleFilterCantiere === 'all') {
      return personaleList;
    }
    return personaleList.filter(p => p.cantieriAssegnati.includes(personaleFilterCantiere));
  }, [personaleList, personaleFilterCantiere]);

  // 🆕 TAB PERSONALE: CARICAMENTO DOCUMENTI DIPENDENTE
  useEffect(() => {
    if (!tenant || !selectedCompany || !selectedPersonale || mainTab !== 'carica' || caricaTab !== 'personale') {
      setUploadedPersonaleDocs([]);
      return;
    }

    setPersonaleDocsLoading(true);
    const db = getFirebaseDb();

    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/documents`),
      where('docCategory', '==', 'personale'),
      where('personaleId', '==', selectedPersonale),
      where('isCurrent', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: {docTypeKey: string; status: string; docId?: string; uploadedAt?: any}[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        docs.push({
          docTypeKey: data.docTypeKey || '',
          status: data.status || data.overall?.status || 'gray',
          docId: docSnap.id,
          uploadedAt: data.uploadedAt,
        });
      });
      setUploadedPersonaleDocs(docs);
      setPersonaleDocsLoading(false);
    }, (err) => {
      console.error("Error loading personale docs:", err);
      setPersonaleDocsLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany, selectedPersonale, mainTab, caricaTab]);

  // Conta documenti personale completati
  const personaleCompletionCount = useMemo(() => {
    return uploadedPersonaleDocs.length;
  }, [uploadedPersonaleDocs]);

  // Stato documenti personale per checklist
  const personaleDocStatus = useMemo(() => {
    const statusMap: Record<string, {uploaded: boolean; status: string; docId?: string}> = {};
    PERSONALE_DOCUMENT_TYPES.forEach(docType => {
      const found = uploadedPersonaleDocs.find(d => d.docTypeKey === docType.key);
      statusMap[docType.key] = {
        uploaded: !!found,
        status: found?.status || 'gray',
        docId: found?.docId,
      };
    });
    return statusMap;
  }, [uploadedPersonaleDocs]);

  // ============================================
  // TAB MEZZI: CARICAMENTO MEZZI
  // ============================================
  
  // Carica mezzi SEMPRE quando c'è impresa selezionata
  useEffect(() => {
    if (!tenant || !selectedCompany) {
      setMezziList([]);
      return;
    }

    setMezziLoading(true);
    const db = getFirebaseDb();
    
    const q = query(
      collection(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi`),
      orderBy('targa', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr: MezzoRecord[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isActive !== false) {
          arr.push({
            id: docSnap.id,
            targa: data.targa || '',
            tipo: data.tipo || '',
            marcaModello: data.marcaModello,
            cantieriAssegnati: data.cantieriAssegnati || [],
            createdAt: data.createdAt,
          });
        }
      });
      setMezziList(arr);
      setMezziLoading(false);
    }, (err) => {
      console.error("Error loading mezzi:", err);
      setMezziLoading(false);
    });

    return () => unsubscribe();
  }, [tenant, selectedCompany]);

  // Mezzi filtrati per cantiere
  const filteredMezzi = useMemo(() => {
    if (mezziFilterCantiere === 'all') {
      return mezziList;
    }
    return mezziList.filter(m => m.cantieriAssegnati.includes(mezziFilterCantiere));
  }, [mezziList, mezziFilterCantiere]);

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
  // UPLOAD DOCUMENTI PERSONALE
  // ============================================

  // Upload con verifica AI per documenti personale
  const handleUploadPersonale = async (file: File) => {
    if (!selectedCompany || !selectedPersonaleDocType || !selectedPersonale || !tenant) {
      throw new Error('Seleziona impresa, dipendente e tipo documento');
    }

    setUploadingPersonale(true);
    setPersonaleUploadSuccess(false);

    try {
      const uuid = crypto.randomUUID();
      const docId = uuid;
      // Path: docs/{tenant}/{company}/{docId}.pdf - verrà processato dalla Cloud Function
      const storagePath = `docs/${tenant}/${selectedCompany}/${docId}.pdf`;
      const storageRef = ref(storage, storagePath);

      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          customMetadata: {
            docTypeKey: selectedPersonaleDocType,
            docCategory: 'personale',
            personaleId: selectedPersonale,
          },
        });
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('[Personale Upload] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

      setPersonaleUploadedBlobName(storagePath);
      console.log('[Personale Upload] ✅ File caricato, pipeline AI avviata');
      
      setTimeout(() => {
        setSelectedPersonaleDocType(null);
      }, 5000);

    } catch (error) {
      console.error('[Personale Upload] ❌ Errore:', error);
      throw error;
    } finally {
      setUploadingPersonale(false);
    }
  };

  // Upload DIRETTO (senza verifica AI) per documenti personale
  const handleDirectUploadPersonale = async (file: File) => {
    if (!selectedCompany || !selectedPersonaleDocType || !selectedPersonale || !tenant) {
      throw new Error('Seleziona impresa, dipendente e tipo documento');
    }

    setUploadingPersonale(true);
    setPersonaleUploadSuccess(false);

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
            console.log('[DirectUpload Personale] Progress:', progress);
          },
          reject,
          () => resolve()
        );
      });

      // 2. Scrivi direttamente in Firestore
      const db = getFirebaseDb();
      const docRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/documents/${docId}`);
      
      const personaleDocType = getPersonaleDocumentType(selectedPersonaleDocType);
      const persona = personaleList.find(p => p.id === selectedPersonale);
      
      const documentData: Record<string, any> = {
        blobName: storagePath,
        tenantId: tenant,
        companyId: selectedCompany,
        source: 'direct',
        docCategory: 'personale',
        docTypeKey: selectedPersonaleDocType,
        docType: personaleDocType?.label || selectedPersonaleDocType,
        personaleId: selectedPersonale,
        personaleName: persona ? `${persona.nome} ${persona.cognome}` : '',
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

      // 3. Crea anche il pointer per il documento personale
      const pointerKey = `${selectedPersonale}_${selectedPersonaleDocType}`;
      const pointerRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/docIndex/${pointerKey}`);
      await setDoc(pointerRef, {
        currentDocId: docId,
        docType: selectedPersonaleDocType,
        personaleId: selectedPersonale,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log('[DirectUpload Personale] ✅ Documento salvato:', docId);
      setPersonaleUploadSuccess(true);
      
      // Reset dopo successo
      setTimeout(() => {
        setSelectedPersonaleDocType(null);
        setPersonaleUploadSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('[DirectUpload Personale] ❌ Errore:', error);
      throw error;
    } finally {
      setUploadingPersonale(false);
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

  // ============================================
  // HELPER MEZZI POS
  // ============================================
  
  const addMezzoPOS = () => {
    setMezziPOS([...mezziPOS, { id: crypto.randomUUID(), targa: '', tipo: '' }]);
  };

  const removeMezzoPOS = (id: string) => {
    setMezziPOS(mezziPOS.filter(m => m.id !== id));
  };

  const updateMezzoPOS = (id: string, field: keyof MezzoPOS, value: string) => {
    setMezziPOS(mezziPOS.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const resetMezziPOS = () => {
    setMezziPOS([]);
  };

  // 🆕 Salva un nuovo dipendente manualmente (Tab Personale)
  const saveNewPersonale = async () => {
    if (!tenant || !selectedCompany) return;
    if (!newPersonale.nome.trim() || !newPersonale.cognome.trim()) {
      alert('Nome e Cognome sono obbligatori');
      return;
    }
    
    setSavingPersonale(true);
    try {
      const db = getFirebaseDb();
      
      // Genera ID basato su nome+cognome
      const personaleId = `${newPersonale.nome.toLowerCase().trim()}-${newPersonale.cognome.toLowerCase().trim()}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const personaleRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/personale/${personaleId}`);
      
      // Controlla se esiste già
      const { getDoc } = await import('firebase/firestore');
      const existingDoc = await getDoc(personaleRef);
      
      if (existingDoc.exists()) {
        alert('Un dipendente con questo nome e cognome esiste già');
        setSavingPersonale(false);
        return;
      }
      
      // Crea nuovo dipendente
      await setDoc(personaleRef, {
        nome: newPersonale.nome.trim(),
        cognome: newPersonale.cognome.trim(),
        codiceFiscale: newPersonale.codiceFiscale.trim().toUpperCase() || null,
        mansione: newPersonale.mansione.trim() || null,
        tenantId: tenant,
        companyId: selectedCompany,
        cantieriAssegnati: [], // Nessun cantiere inizialmente
        createdAt: serverTimestamp(),
        createdManually: true, // Flag per distinguere da quelli creati via POS
        isActive: true,
      });
      
      // Reset form e chiudi
      setNewPersonale({ nome: '', cognome: '', codiceFiscale: '', mansione: '' });
      setShowAddPersonaleForm(false);
      
    } catch (err) {
      console.error('Error saving personale:', err);
      alert('Errore nel salvataggio del dipendente');
    } finally {
      setSavingPersonale(false);
    }
  };

  // 🆕 Assegna dipendente a un cantiere
  const assignPersonaleToCantiere = async (personaleId: string, cantiereId: string) => {
    if (!tenant || !selectedCompany || !cantiereId) return;
    
    setAssigningCantiere(personaleId);
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/personale/${personaleId}`);
      
      const { arrayUnion, updateDoc } = await import('firebase/firestore');
      await updateDoc(personaleRef, {
        cantieriAssegnati: arrayUnion(cantiereId),
      });
      
    } catch (err) {
      console.error('Error assigning cantiere:', err);
      alert('Errore nell\'assegnazione al cantiere');
    } finally {
      setAssigningCantiere(null);
    }
  };

  // 🆕 Rimuovi dipendente da un cantiere
  const removePersonaleFromCantiere = async (personaleId: string, cantiereId: string) => {
    if (!tenant || !selectedCompany) return;
    
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/personale/${personaleId}`);
      
      const { arrayRemove, updateDoc } = await import('firebase/firestore');
      await updateDoc(personaleRef, {
        cantieriAssegnati: arrayRemove(cantiereId),
      });
      
    } catch (err) {
      console.error('Error removing from cantiere:', err);
      alert('Errore nella rimozione dal cantiere');
    }
  };

  // 🆕 Elimina dipendente
  const deletePersonale = async (personaleId: string) => {
    if (!tenant || !selectedCompany) return;
    
    if (!confirm('Sei sicuro di voler eliminare questo dipendente?')) return;
    
    setDeletingPersonaleId(personaleId);
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/personale/${personaleId}`);
      
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(personaleRef);
      
    } catch (err) {
      console.error('Error deleting personale:', err);
      alert('Errore nell\'eliminazione del dipendente');
    } finally {
      setDeletingPersonaleId(null);
    }
  };

  // ============================================
  // MEZZI: FUNZIONI CRUD
  // ============================================

  // Salva un nuovo mezzo manualmente (Tab Mezzi)
  const saveNewMezzo = async () => {
    if (!tenant || !selectedCompany) return;
    if (!newMezzo.targa.trim() || !newMezzo.tipo.trim()) {
      alert('Targa e Tipo sono obbligatori');
      return;
    }
    
    setSavingMezzo(true);
    try {
      const db = getFirebaseDb();
      
      // Genera ID basato su targa
      const mezzoId = newMezzo.targa.toUpperCase().trim()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const mezzoRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi/${mezzoId}`);
      
      // Controlla se esiste già
      const { getDoc } = await import('firebase/firestore');
      const existingDoc = await getDoc(mezzoRef);
      
      if (existingDoc.exists()) {
        alert('Un mezzo con questa targa esiste già');
        setSavingMezzo(false);
        return;
      }
      
      // Crea nuovo mezzo
      await setDoc(mezzoRef, {
        targa: newMezzo.targa.trim().toUpperCase(),
        tipo: newMezzo.tipo.trim(),
        marcaModello: newMezzo.marcaModello.trim() || null,
        tenantId: tenant,
        companyId: selectedCompany,
        cantieriAssegnati: [], // Nessun cantiere inizialmente
        createdAt: serverTimestamp(),
        isActive: true,
      });
      
      // Reset form e chiudi
      setNewMezzo({ targa: '', tipo: '', marcaModello: '' });
      setShowAddMezzoForm(false);
      
    } catch (err) {
      console.error('Error saving mezzo:', err);
      alert('Errore nel salvataggio del mezzo');
    } finally {
      setSavingMezzo(false);
    }
  };

  // Assegna mezzo a un cantiere
  const assignMezzoToCantiere = async (mezzoId: string, cantiereId: string) => {
    if (!tenant || !selectedCompany || !cantiereId) return;
    
    setAssigningMezzoCantiere(mezzoId);
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi/${mezzoId}`);
      
      const { arrayUnion, updateDoc } = await import('firebase/firestore');
      await updateDoc(mezzoRef, {
        cantieriAssegnati: arrayUnion(cantiereId),
      });
      
    } catch (err) {
      console.error('Error assigning cantiere to mezzo:', err);
      alert('Errore nell\'assegnazione al cantiere');
    } finally {
      setAssigningMezzoCantiere(null);
    }
  };

  // Rimuovi mezzo da un cantiere
  const removeMezzoFromCantiere = async (mezzoId: string, cantiereId: string) => {
    if (!tenant || !selectedCompany) return;
    
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi/${mezzoId}`);
      
      const { arrayRemove, updateDoc } = await import('firebase/firestore');
      await updateDoc(mezzoRef, {
        cantieriAssegnati: arrayRemove(cantiereId),
      });
      
    } catch (err) {
      console.error('Error removing mezzo from cantiere:', err);
      alert('Errore nella rimozione dal cantiere');
    }
  };

  // Elimina mezzo
  const deleteMezzo = async (mezzoId: string) => {
    if (!tenant || !selectedCompany) return;
    
    if (!confirm('Sei sicuro di voler eliminare questo mezzo?')) return;
    
    setDeletingMezzoId(mezzoId);
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi/${mezzoId}`);
      
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(mezzoRef);
      
    } catch (err) {
      console.error('Error deleting mezzo:', err);
      alert('Errore nell\'eliminazione del mezzo');
    } finally {
      setDeletingMezzoId(null);
    }
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

  // Salva i mezzi nella collezione mezzi (quando si carica POS)
  const saveMezziPOSToFirestore = async () => {
    if (!tenant || !selectedCompany || !selectedCantiere) return;
    
    const db = getFirebaseDb();
    const validMezzi = mezziPOS.filter(m => m.targa.trim() && m.tipo.trim());
    
    for (const mezzo of validMezzi) {
      // Genera ID basato su targa (per evitare duplicati)
      const mezzoId = mezzo.targa.toUpperCase().trim()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const mezzoRef = doc(db, `tenants/${tenant}/companies/${selectedCompany}/mezzi/${mezzoId}`);
      
      // Leggi il documento esistente per aggiornare cantieriAssegnati
      const { getDoc, arrayUnion } = await import('firebase/firestore');
      const existingDoc = await getDoc(mezzoRef);
      
      if (existingDoc.exists()) {
        // Aggiorna: aggiungi il cantiere alla lista
        await setDoc(mezzoRef, {
          cantieriAssegnati: arrayUnion(selectedCantiere),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        // Crea nuovo
        await setDoc(mezzoRef, {
          targa: mezzo.targa.trim().toUpperCase(),
          tipo: mezzo.tipo.trim(),
          ...(mezzo.marcaModello && { marcaModello: mezzo.marcaModello.trim() }),
          cantieriAssegnati: [selectedCantiere],
          companyId: selectedCompany,
          tenantId: tenant,
          createdAt: serverTimestamp(),
          isActive: true,
        });
      }
      
      console.log(`[MezziPOS] Salvato: ${mezzo.targa} (${mezzo.tipo}) per cantiere ${selectedCantiere}`);
    }
  };

  // Controlla se il documento selezionato è POS (richiede nominativi e mezzi)
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

      // 🆕 Salva nominativi e mezzi se POS
      if (isPOSSelected) {
        await saveNominativiToFirestore();
        await saveMezziPOSToFirestore();
        resetNominativi();
        resetMezziPOS();
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

      // 🆕 Salva nominativi e mezzi se POS
      if (isPOSSelected) {
        await saveNominativiToFirestore();
        await saveMezziPOSToFirestore();
        resetNominativi();
        resetMezziPOS();
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
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-gradient">
                  Gestione Documenti
                </h1>
                {/* ✅ Badge azienda per Uploader con singola impresa */}
                {!isManagerOrVerifier && firestoreCompanies.length === 1 && (
                  <span className="px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-full text-sm font-semibold shadow-sm">
                    {firestoreCompanies[0].name}
                  </span>
                )}
              </div>
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

      {/* ========== TAB PRINCIPALE: CARICA / VISUALIZZA ========== */}
      <div className="flex gap-3 mb-6 p-2 bg-slate-100 rounded-2xl">
        <button
          onClick={() => setMainTab('carica')}
          className={`
            flex-1 px-8 py-4 font-bold text-lg transition-all flex items-center justify-center gap-3 rounded-xl
            ${mainTab === 'carica'
              ? 'bg-white text-emerald-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }
          `}
        >
          <Upload className="w-6 h-6" />
          <span>Carica Documenti</span>
        </button>
        <button
          onClick={() => setMainTab('visualizza')}
          className={`
            flex-1 px-8 py-4 font-bold text-lg transition-all flex items-center justify-center gap-3 rounded-xl
            ${mainTab === 'visualizza'
              ? 'bg-white text-teal-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }
          `}
        >
          <Eye className="w-6 h-6" />
          <span>Visualizza Documenti</span>
          {allDocuments.length > 0 && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              mainTab === 'visualizza' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {allDocuments.length}
            </span>
          )}
        </button>
        </div>

      {/* ========== SEZIONE CARICA DOCUMENTI ========== */}
      {mainTab === 'carica' && (
        <>
          {/* Selezione Impresa - Mostrata solo se Manager/Verifier o Uploader con più imprese */}
          {(isManagerOrVerifier || firestoreCompanies.length > 1) && (
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
          )}

          {/* Sub-TAB per Carica */}
          <div className="flex gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setCaricaTab('itp')}
              className={`
                flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                ${caricaTab === 'itp'
                  ? 'bg-white text-violet-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <FileCheck className="w-5 h-5" />
              <span>ITP</span>
              {selectedCompany && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  caricaTab === 'itp' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {itpCompletionCount}/{ITP_DOCUMENT_TYPES.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setCaricaTab('personale')}
              className={`
                flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                ${caricaTab === 'personale'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <Users className="w-5 h-5" />
              <span>Personale</span>
            </button>
            <button
              onClick={() => setCaricaTab('cantieri')}
              className={`
                flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                ${caricaTab === 'cantieri'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <HardHat className="w-5 h-5" />
              <span>Cantieri</span>
            </button>
            <button
              onClick={() => setCaricaTab('mezzi')}
              className={`
                flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                ${caricaTab === 'mezzi'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <Truck className="w-5 h-5" />
              <span>Mezzi</span>
            </button>
          </div>
        </>
      )}

      {/* ========== TAB 1: DOCUMENTAZIONE ITP ========== */}
      {mainTab === 'carica' && caricaTab === 'itp' && (
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
      {mainTab === 'carica' && caricaTab === 'personale' && (
        <div className="space-y-6">
          {!selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Seleziona un&apos;impresa per vedere i documenti del personale</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <Users className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Documenti Personale</h2>
                    <p className="text-sm text-slate-500">
                      Carica documenti per i {personaleList.length} dipendenti registrati
                    </p>
                  </div>
                </div>
              </div>

              {/* ✅ Warning se non ci sono dipendenti inseriti */}
              {personaleList.length === 0 ? (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-900 mb-3">⚠️ Prima inserisci il personale</h3>
                      <p className="text-sm text-amber-800 mb-4">
                        Per caricare i documenti del personale, devi prima inserire i nominativi.
                      </p>
                      <div className="bg-white/60 rounded-xl p-4 mb-4">
                        <p className="text-sm font-semibold text-amber-900 mb-3">Come fare? Hai 2 opzioni:</p>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <p className="text-sm text-amber-800">Clicca il tasto sotto che ti porterà alla <strong>pagina Imprese → Cantieri</strong> e aggiungi il personale</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                            <p className="text-sm text-amber-800">Carica il <strong>POS</strong> (Piano Operativo di Sicurezza) aggiungendo il personale</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/cantieri?cid=${selectedCompany}`)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-amber-500/25"
                      >
                        <Users className="w-4 h-4" />
                        Vai a Inserimento Personale
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-900 mb-2">✅ Dipendenti inseriti</h3>
                      <p className="text-sm text-emerald-700 mb-4">
                        Clicca il tasto sotto che ti porterà alla <strong>pagina Imprese → Cantieri</strong> e modifica il personale.
                      </p>
                      <button
                        onClick={() => router.push(`/cantieri?cid=${selectedCompany}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        <Users className="w-4 h-4" />
                        Modifica Dipendenti
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Selezione Dipendente + Documenti */}
              {personaleList.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Colonna Sinistra: Lista Dipendenti */}
                  <div className="lg:col-span-1">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-blue-500" />
                          Seleziona Dipendente
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{personaleList.length} registrati</p>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
                        {personaleList.map((persona) => (
                          <button
                            key={persona.id}
                            onClick={() => {
                              setSelectedPersonale(persona.id);
                              setSelectedPersonaleDocType(null);
                            }}
                            className={`w-full px-4 py-3 text-left transition-colors ${
                              selectedPersonale === persona.id 
                                ? 'bg-blue-50 border-l-4 border-blue-500' 
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <p className="font-medium text-slate-800 text-sm">
                              {persona.cognome} {persona.nome}
                            </p>
                            {persona.mansione && (
                              <p className="text-xs text-slate-500 mt-0.5">{persona.mansione}</p>
                            )}
                            {selectedPersonale === persona.id && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                                <FileCheck className="w-3 h-3" />
                                {personaleCompletionCount}/{PERSONALE_DOCUMENT_TYPES.length} doc
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Colonna Centrale: Checklist Documenti */}
                  <div className="lg:col-span-2">
                    {selectedPersonale ? (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-blue-500" />
                                Documenti di {personaleList.find(p => p.id === selectedPersonale)?.cognome} {personaleList.find(p => p.id === selectedPersonale)?.nome}
                              </h2>
                              <p className="text-xs text-slate-500 mt-1">
                                {personaleList.find(p => p.id === selectedPersonale)?.mansione || 'Mansione non specificata'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-blue-700">
                                {personaleCompletionCount}/{PERSONALE_DOCUMENT_TYPES.length}
                              </div>
                              <div className="w-20 h-2 bg-blue-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                                  style={{ width: `${(personaleCompletionCount / PERSONALE_DOCUMENT_TYPES.length) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {personaleDocsLoading ? (
                          <div className="p-8 text-center">
                            <Loader2 className="w-8 h-8 mx-auto text-slate-400 animate-spin" />
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                            {/* Raggruppa per categoria */}
                            {['amministrativo', 'nomina', 'formazione', 'altro'].map((category) => {
                              const docsInCategory = PERSONALE_DOCUMENT_TYPES.filter(d => d.category === category);
                              if (docsInCategory.length === 0) return null;
                              
                              const categoryLabels: Record<string, string> = {
                                amministrativo: '📋 Documenti Amministrativi',
                                nomina: '👤 Nomine',
                                formazione: '🎓 Formazione',
                                altro: '📁 Altro'
                              };
                              
                              return (
                                <div key={category}>
                                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                      {categoryLabels[category]}
                                    </p>
                                  </div>
                                  {docsInCategory.map((docType) => {
                                    const status = personaleDocStatus[docType.key];
                                    const isSelected = selectedPersonaleDocType === docType.key;
                                    
                                    return (
                                      <div
                                        key={docType.key}
                                        className={`px-4 py-3 transition-colors ${
                                          isSelected ? 'bg-blue-50' : 'hover:bg-slate-50/50'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                                              status?.uploaded 
                                                ? status.status === 'green' 
                                                  ? 'bg-emerald-100' 
                                                  : status.status === 'yellow'
                                                  ? 'bg-amber-100'
                                                  : status.status === 'red'
                                                  ? 'bg-red-100'
                                                  : 'bg-slate-100'
                                                : 'bg-slate-100'
                                            }`}>
                                              {status?.uploaded ? (
                                                <CheckCircle2 className={`w-4 h-4 ${
                                                  status.status === 'green' 
                                                    ? 'text-emerald-600' 
                                                    : status.status === 'yellow'
                                                    ? 'text-amber-600'
                                                    : status.status === 'red'
                                                    ? 'text-red-600'
                                                    : 'text-slate-400'
                                                }`} />
                                              ) : (
                                                <Clock className="w-4 h-4 text-slate-400" />
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium text-slate-700 text-sm truncate">
                                                {docType.shortLabel}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {status?.uploaded ? (
                                              <>
                                                <button
                                                  onClick={() => status.docId && router.push(`/document?id=${status.docId}&tid=${tenant}`)}
                                                  className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                                                  title="Visualizza"
                                                >
                                                  <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => setSelectedPersonaleDocType(docType.key)}
                                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                  title="Sostituisci"
                                                >
                                                  <RefreshCw className="w-3.5 h-3.5" />
                                                </button>
                                              </>
                                            ) : (
                                              <button
                                                onClick={() => setSelectedPersonaleDocType(docType.key)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                                                  isSelected
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                }`}
                                              >
                                                <Upload className="w-3 h-3" />
                                                Carica
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
                        <User className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-600 font-medium">Seleziona un dipendente</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Clicca su un nome dalla lista per vedere i suoi documenti
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Colonna Destra: Area Upload */}
                  <div className="space-y-4">
                    {selectedPersonaleDocType && selectedPersonale ? (
                      <>
                        {/* Documento selezionato */}
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-blue-900">
                                {getPersonaleDocumentType(selectedPersonaleDocType)?.shortLabel}
                              </p>
                              <p className="text-xs text-blue-600 line-clamp-1">
                                {personaleList.find(p => p.id === selectedPersonale)?.cognome} {personaleList.find(p => p.id === selectedPersonale)?.nome}
                              </p>
                            </div>
                            <button
                              onClick={() => setSelectedPersonaleDocType(null)}
                              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Toggle AI vs Diretto */}
                        {isManagerOrVerifier && (
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-xs text-slate-500 mb-3 font-medium">Modalità caricamento</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setUseAIVerification(true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                  useAIVerification
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Verifica AI
                              </button>
                              <button
                                onClick={() => setUseAIVerification(false)}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                  !useAIVerification
                                    ? 'bg-slate-700 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <FolderUp className="w-3.5 h-3.5" />
                                Diretto
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Upload Box */}
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-4">
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              useAIVerification 
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                                : 'bg-gradient-to-br from-slate-500 to-slate-600'
                            }`}>
                              <Upload className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-800 text-sm">Carica File</h3>
                              <p className="text-xs text-slate-500">
                                {useAIVerification ? 'Verifica automatica' : 'Nessuna verifica'}
                              </p>
                            </div>
                          </div>
                          
                          {personaleUploadSuccess ? (
                            <div className="border-2 border-dashed border-green-300 rounded-xl p-6 text-center bg-green-50">
                              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 mb-2" />
                              <p className="font-semibold text-green-700 text-sm">Documento caricato!</p>
                            </div>
                          ) : (
                            <UploadBox 
                              onUpload={useAIVerification ? handleUploadPersonale : handleDirectUploadPersonale} 
                              accept=".pdf" 
                              maxSizeMB={10}
                              disabled={uploadingPersonale}
                            />
                          )}
                          
                          {uploadingPersonale && (
                            <div className="mt-3 flex items-center justify-center gap-2 text-slate-600">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm">Caricamento...</span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-8 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                          <ChevronRight className="w-7 h-7 text-slate-400" />
                        </div>
                        <p className="text-slate-600 font-medium text-sm">Seleziona un documento</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Clicca &quot;Carica&quot; nella checklist
                        </p>
                      </div>
                    )}

                    {/* Info Box */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-blue-800">25 tipi documento</p>
                          <p className="text-xs text-blue-700 mt-0.5">
                            UniLav, Idoneità, Nomine, Formazioni...
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========== TAB 3: CANTIERI ========== */}
      {mainTab === 'carica' && caricaTab === 'cantieri' && (
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
                Clicca il tasto sotto che ti porterà alla pagina Imprese → Cantieri e crea un cantiere
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
                                <p className="text-xs text-slate-500">Assegna i lavoratori a questo cantiere</p>
                              </div>
                            </div>

                            {/* 🆕 SEZIONE 1: Seleziona da dipendenti esistenti */}
                            {personaleList.length > 0 && (
                              <div className="mb-5">
                                <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                                  <Users className="w-4 h-4 text-blue-500" />
                                  Seleziona da esistenti
                                </p>
                                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 divide-y divide-slate-200">
                                  {personaleList.map((persona) => {
                                    const isAlreadyAssigned = persona.cantieriAssegnati?.includes(selectedCantiere);
                                    const isSelected = nominativi.some(
                                      n => n.nome.toLowerCase() === persona.nome.toLowerCase() && 
                                           n.cognome.toLowerCase() === persona.cognome.toLowerCase()
                                    );
                                    return (
                                      <label
                                        key={persona.id}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                          isAlreadyAssigned ? 'bg-green-50' : isSelected ? 'bg-blue-50' : 'hover:bg-slate-100'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected || isAlreadyAssigned}
                                          disabled={isAlreadyAssigned}
                                          onChange={(e) => {
                                            if (e.target.checked && !isAlreadyAssigned) {
                                              // Aggiungi ai nominativi
                                              setNominativi([...nominativi, {
                                                id: crypto.randomUUID(),
                                                nome: persona.nome,
                                                cognome: persona.cognome,
                                                codiceFiscale: persona.codiceFiscale,
                                                mansione: persona.mansione,
                                              }]);
                                            } else if (!e.target.checked) {
                                              // Rimuovi dai nominativi
                                              setNominativi(nominativi.filter(
                                                n => !(n.nome.toLowerCase() === persona.nome.toLowerCase() && 
                                                       n.cognome.toLowerCase() === persona.cognome.toLowerCase())
                                              ));
                                            }
                                          }}
                                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex-1">
                                          <span className="font-medium text-slate-700">{persona.cognome} {persona.nome}</span>
                                          {persona.mansione && (
                                            <span className="ml-2 text-xs text-slate-500">({persona.mansione})</span>
                                          )}
                                        </div>
                                        {isAlreadyAssigned && (
                                          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                            Già assegnato
                      </span>
                    )}
                                      </label>
                                    );
                                  })}
                  </div>
                </div>
                            )}

                            {/* Divisore */}
                            <div className="relative my-5">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-200" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-3 text-slate-400 font-medium">Oppure aggiungi nuovi</span>
                              </div>
                            </div>

                            {/* SEZIONE 2: Aggiungi nuovi nominativi */}
                            <div className="space-y-3 mb-4">
                              {nominativi.filter(n => !personaleList.some(
                                p => p.nome.toLowerCase() === n.nome.toLowerCase() && 
                                     p.cognome.toLowerCase() === n.cognome.toLowerCase()
                              )).map((nominativo, index) => (
                                <div key={nominativo.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs font-medium text-slate-500">Nuovo lavoratore</span>
                                    <button
                                      onClick={() => removeNominativo(nominativo.id)}
                                      className="ml-auto p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                      title="Rimuovi"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
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

                            {/* Pulsante aggiungi nuovo */}
                            <button
                              onClick={addNominativo}
                              className="w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                            >
                              <Plus className="w-4 h-4" />
                              Aggiungi nuovo lavoratore
                            </button>

                            {/* Riepilogo selezione */}
                            {nominativi.filter(n => n.nome.trim() && n.cognome.trim()).length > 0 && (
                              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm font-medium text-blue-800">
                                  {nominativi.filter(n => n.nome.trim() && n.cognome.trim()).length} lavoratori selezionati
                                </p>
          </div>
        )}

                            {/* Info */}
                            <p className="mt-3 text-xs text-slate-400">
                              I lavoratori saranno assegnati a questo cantiere e salvati nell&apos;archivio personale.
                            </p>
                          </div>
                        )}

                        {/* 🆕 FORM MEZZI (solo per POS) */}
                        {isPOSSelected && (
                          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-amber-200 p-6">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                                <Truck className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-800">Mezzi di Cantiere</h3>
                                <p className="text-xs text-slate-500">Assegna i mezzi a questo cantiere</p>
                              </div>
                            </div>

                            {/* SEZIONE 1: Seleziona da mezzi esistenti */}
                            {mezziList.length > 0 && (
                              <div className="mb-5">
                                <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-amber-500" />
                                  Seleziona da esistenti
                                </p>
                                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 divide-y divide-slate-200">
                                  {mezziList.map((mezzo) => {
                                    const isAlreadyAssigned = mezzo.cantieriAssegnati?.includes(selectedCantiere);
                                    const isSelected = mezziPOS.some(
                                      m => m.targa.toUpperCase() === mezzo.targa.toUpperCase()
                                    );
                                    return (
                                      <label
                                        key={mezzo.id}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                          isAlreadyAssigned ? 'bg-green-50' : isSelected ? 'bg-amber-50' : 'hover:bg-slate-100'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected || isAlreadyAssigned}
                                          disabled={isAlreadyAssigned}
                                          onChange={(e) => {
                                            if (e.target.checked && !isAlreadyAssigned) {
                                              // Aggiungi ai mezzi POS
                                              setMezziPOS([...mezziPOS, {
                                                id: crypto.randomUUID(),
                                                targa: mezzo.targa,
                                                tipo: mezzo.tipo,
                                                marcaModello: mezzo.marcaModello,
                                                isExisting: true,
                                              }]);
                                            } else if (!e.target.checked) {
                                              // Rimuovi dai mezzi POS
                                              setMezziPOS(mezziPOS.filter(
                                                m => m.targa.toUpperCase() !== mezzo.targa.toUpperCase()
                                              ));
                                            }
                                          }}
                                          className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <div className="flex-1">
                                          <span className="font-bold text-slate-700">{mezzo.targa}</span>
                                          <span className="ml-2 text-sm text-slate-500">({mezzo.tipo})</span>
                                          {mezzo.marcaModello && (
                                            <span className="ml-2 text-xs text-slate-400">{mezzo.marcaModello}</span>
                                          )}
                                        </div>
                                        {isAlreadyAssigned && (
                                          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                            Già assegnato
                                          </span>
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Divisore */}
                            <div className="relative my-5">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-200" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-3 text-slate-400 font-medium">Oppure aggiungi nuovi</span>
                              </div>
                            </div>

                            {/* SEZIONE 2: Aggiungi nuovi mezzi */}
                            <div className="space-y-3 mb-4">
                              {mezziPOS.filter(m => !m.isExisting).map((mezzo) => (
                                <div key={mezzo.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Truck className="w-4 h-4 text-amber-500" />
                                    <span className="text-xs font-medium text-slate-500">Nuovo mezzo</span>
                                    <button
                                      onClick={() => removeMezzoPOS(mezzo.id)}
                                      className="ml-auto p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                      title="Rimuovi"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <input
                                      type="text"
                                      placeholder="Targa *"
                                      value={mezzo.targa}
                                      onChange={(e) => updateMezzoPOS(mezzo.id, 'targa', e.target.value.toUpperCase())}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent uppercase"
                                    />
                                    <select
                                      value={mezzo.tipo}
                                      onChange={(e) => updateMezzoPOS(mezzo.id, 'tipo', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    >
                                      <option value="">Tipo *</option>
                                      <option value="Escavatore">Escavatore</option>
                                      <option value="Camion">Camion</option>
                                      <option value="Gru">Gru</option>
                                      <option value="Furgone">Furgone</option>
                                      <option value="Autocarro">Autocarro</option>
                                      <option value="Betoniera">Betoniera</option>
                                      <option value="Carrello Elevatore">Carrello Elevatore</option>
                                      <option value="Pala Meccanica">Pala Meccanica</option>
                                      <option value="Piattaforma Aerea">Piattaforma Aerea</option>
                                      <option value="Altro">Altro</option>
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="Marca/Modello"
                                      value={mezzo.marcaModello || ''}
                                      onChange={(e) => updateMezzoPOS(mezzo.id, 'marcaModello', e.target.value)}
                                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Pulsante aggiungi nuovo */}
                            <button
                              onClick={addMezzoPOS}
                              className="w-full py-2 border-2 border-dashed border-amber-300 rounded-xl text-amber-600 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                            >
                              <Plus className="w-4 h-4" />
                              Aggiungi nuovo mezzo
                            </button>

                            {/* Riepilogo selezione */}
                            {mezziPOS.filter(m => m.targa.trim() && m.tipo.trim()).length > 0 && (
                              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm font-medium text-amber-800">
                                  {mezziPOS.filter(m => m.targa.trim() && m.tipo.trim()).length} mezzi selezionati
                                </p>
                              </div>
                            )}

                            {/* Info */}
                            <p className="mt-3 text-xs text-slate-400">
                              I mezzi saranno assegnati a questo cantiere e salvati nell&apos;archivio mezzi.
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

      {/* ========== TAB 4: MEZZI ========== */}
      {mainTab === 'carica' && caricaTab === 'mezzi' && (
        <div className="space-y-6">
          {!selectedCompany ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Seleziona un&apos;impresa per vedere i documenti dei mezzi</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                    <Truck className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Documenti Mezzi</h2>
                    <p className="text-sm text-slate-500">
                      Carica documenti per i {mezziList.length} mezzi registrati
                    </p>
                  </div>
                </div>
              </div>

              {/* ✅ Warning se non ci sono mezzi inseriti */}
              {mezziList.length === 0 ? (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-900 mb-3">⚠️ Prima inserisci i mezzi</h3>
                      <p className="text-sm text-amber-800 mb-4">
                        Per caricare i documenti dei mezzi, devi prima inserire le targhe o i nomi dei mezzi.
                      </p>
                      <div className="bg-white/60 rounded-xl p-4 mb-4">
                        <p className="text-sm font-semibold text-amber-900 mb-3">Come fare? Hai 2 opzioni:</p>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                            <p className="text-sm text-amber-800">Clicca il tasto sotto che ti porterà alla <strong>pagina Imprese → Cantieri</strong> e aggiungi i mezzi</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                            <p className="text-sm text-amber-800">Carica il <strong>POS</strong> (Piano Operativo di Sicurezza) aggiungendo i mezzi</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/cantieri?cid=${selectedCompany}`)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-amber-500/25"
                      >
                        <Truck className="w-4 h-4" />
                        Vai a Inserimento Mezzi
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-900 mb-2">✅ Mezzi inseriti</h3>
                      <p className="text-sm text-emerald-700 mb-4">
                        Clicca il tasto sotto che ti porterà alla <strong>pagina Imprese → Cantieri</strong> e modifica i mezzi.
                      </p>
                      <button
                        onClick={() => router.push(`/cantieri?cid=${selectedCompany}`)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        <Truck className="w-4 h-4" />
                        Modifica Mezzi
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Placeholder per documenti futuri */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
                <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Upload Documenti Mezzi</h3>
                <p className="text-slate-500 text-sm max-w-md mx-auto">
                  I documenti dei mezzi (libretti, revisioni, assicurazioni, ecc.) saranno gestiti in questa sezione.
                  La funzionalità sarà disponibile prossimamente.
                </p>
                {mezziList.length > 0 && (
                  <div className="mt-6 p-4 bg-slate-50 rounded-xl inline-block">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold">{mezziList.length}</span> mezzi registrati per questa impresa
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========== SEZIONE VISUALIZZA DOCUMENTI ========== */}
      {mainTab === 'visualizza' && (
        <div className="space-y-6">
          {/* Header con filtri */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                  <Archive className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Archivio Documenti</h2>
                  <p className="text-sm text-slate-500">
                    {allDocsLoading ? 'Caricamento...' : `${filteredArchiveDocs.length} documenti`}
                  </p>
                </div>
              </div>
              
              {/* Filtro Impresa - ✅ FIX: Nascosto se Uploader ha una sola azienda */}
              {(isManagerOrVerifier || firestoreCompanies.length > 1) && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">Impresa:</span>
                  </div>
                  <select
                    value={archivioCompanyFilter}
                    onChange={(e) => setArchivioCompanyFilter(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent min-w-[200px]"
                  >
                    <option value="all">Tutte le imprese</option>
                    {archivioUniqueCompanies.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Sub-tab categoria */}
            <div className="flex gap-2 mt-6 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'tutti' as VisualizzaTab, label: 'Tutti', count: allDocuments.length },
                { key: 'itp' as VisualizzaTab, label: 'ITP', count: allDocuments.filter(d => d.docCategory === 'itp').length },
                { key: 'cantieri' as VisualizzaTab, label: 'Cantieri', count: allDocuments.filter(d => d.docCategory === 'cantiere').length },
                { key: 'personale' as VisualizzaTab, label: 'Personale', count: allDocuments.filter(d => d.docCategory === 'personale').length },
                { key: 'mezzi' as VisualizzaTab, label: 'Mezzi', count: allDocuments.filter(d => d.docCategory === 'mezzi').length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setVisualizzaTab(tab.key)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                    visualizzaTab === tab.key
                      ? 'bg-white text-teal-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    visualizzaTab === tab.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tabella documenti */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <DataTable
              data={filteredArchiveDocs}
              columns={[
                {
                  key: 'status',
                  header: 'Stato',
                  render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
                  className: 'w-16',
                },
                {
                  key: 'docType',
                  header: 'Tipo Documento',
                },
                {
                  key: 'company',
                  header: 'Impresa',
                },
                {
                  key: 'docCategory',
                  header: 'Categoria',
                  render: (doc: DocumentItem) => (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      doc.docCategory === 'itp' ? 'bg-violet-100 text-violet-700' :
                      doc.docCategory === 'cantiere' ? 'bg-orange-100 text-orange-700' :
                      doc.docCategory === 'personale' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {doc.docCategory === 'itp' ? 'ITP' :
                       doc.docCategory === 'cantiere' ? 'Cantiere' :
                       doc.docCategory === 'personale' ? 'Personale' :
                       'Altro'}
                    </span>
                  ),
                },
                {
                  key: 'issuedAt',
                  header: 'Emesso',
                },
                {
                  key: 'expiresAt',
                  header: 'Scadenza',
                },
                {
                  key: 'source',
                  header: 'Fonte',
                  render: (doc: DocumentItem) => (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      doc.source === 'direct' 
                        ? 'bg-slate-100 text-slate-600' 
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {doc.source === 'direct' ? '📁 Diretto' : '🤖 AI'}
                    </span>
                  ),
                  className: 'w-24',
                },
                {
                  key: 'actions',
                  header: 'Azioni',
                  render: (doc: DocumentItem) => (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/document?id=${doc.id}&tid=${tenant}`);
                        }}
                        className="p-2 rounded-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 text-slate-500"
                        title="Visualizza dettagli"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {doc.blobName && (
                        <DownloadButton 
                          blobName={doc.blobName} 
                          variant="icon"
                          fileName={`${doc.docType}_${doc.company}.pdf`}
                        />
                      )}
                    </div>
                  ),
                  className: 'w-24',
                },
              ]}
              loading={allDocsLoading}
              onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenant}`)}
              emptyMessage="Nessun documento trovato in questa categoria."
            />
          </div>

          {/* Info Box */}
          <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-teal-800">Archivio completo</p>
                <p className="text-xs text-teal-700 mt-1">
                  Qui puoi consultare tutti i documenti caricati. Usa i filtri per categoria e impresa per trovare rapidamente ciò che cerchi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
