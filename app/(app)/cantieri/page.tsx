'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  collection, doc, onSnapshot, orderBy, query, 
  serverTimestamp, Timestamp, updateDoc, deleteDoc, getDoc, setDoc
} from 'firebase/firestore';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { 
  Building2, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle,
  ArrowLeft, MapPin, Calendar, User, FileText, HardHat, Archive, 
  RotateCcw, Hash, Briefcase, Shield, Users, ChevronDown, ChevronUp,
  Truck, Filter, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MEZZO_TYPES } from '@/lib/documentTypes';

type Cantiere = {
  id: string;
  nome: string;
  codiceSito?: string;
  indirizzo: string;
  dataInizio?: Timestamp;
  dataFinePrevista?: Timestamp;
  committente?: string;
  impresaAffidataria?: string;
  impreseEsecutrici?: string[]; // Array di imprese
  rdl?: string; // Responsabile dei Lavori
  dl?: string;  // Direttore Lavori
  csp?: string; // Coordinatore Sicurezza Progettazione
  cse?: string; // Coordinatore Sicurezza Esecuzione
  note?: string;
  stato: 'attivo' | 'archiviato';
  createdAt?: Timestamp;
  createdBy?: string;
  isActive: boolean;
};

interface PersonaleRecord {
  id: string;
  nome: string;
  cognome: string;
  codiceFiscale?: string;
  mansione?: string;
  cantieriAssegnati: string[];
  createdAt?: any;
}

interface MezzoRecord {
  id: string;
  targa: string;
  tipo: string;
  marcaModello?: string;
  cantieriAssegnati: string[];
  createdAt?: any;
}

type ActiveTab = 'cantieri' | 'personale' | 'mezzi';

export const dynamic = 'force-dynamic';

export default function CantieriPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('cid') || '';
  
  const { tenantId, role, loading: authLoading } = useAuth();
  const isHQ = role === 'manager' || role === 'verifier';
  
  const [companyName, setCompanyName] = useState<string>('');
  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form nuovo cantiere
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    codiceSito: '',
    indirizzo: '',
    dataInizio: '',
    dataFinePrevista: '',
    committente: '',
    impresaAffidataria: '',
    impreseEsecutrici: '',  // Stringa separata da virgole
    rdl: '',
    dl: '',
    csp: '',
    cse: '',
    note: '',
  });
  const [creating, setCreating] = useState(false);
  
  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    nome: '',
    codiceSito: '',
    indirizzo: '',
    dataInizio: '',
    dataFinePrevista: '',
    committente: '',
    impresaAffidataria: '',
    impreseEsecutrici: '',
    rdl: '',
    dl: '',
    csp: '',
    cse: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  
  // Filtro stato
  const [showArchived, setShowArchived] = useState(false);
  
  // Espandi dettagli
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ============================================
  // TAB ATTIVO
  // ============================================
  const [activeTab, setActiveTab] = useState<ActiveTab>('cantieri');

  // ============================================
  // PERSONALE: Stati
  // ============================================
  const [personaleList, setPersonaleList] = useState<PersonaleRecord[]>([]);
  const [personaleLoading, setPersonaleLoading] = useState(false);
  const [personaleFilterCantiere, setPersonaleFilterCantiere] = useState<string>('all');
  const [showAddPersonaleForm, setShowAddPersonaleForm] = useState(false);
  const [newPersonale, setNewPersonale] = useState({ nome: '', cognome: '', codiceFiscale: '', mansione: '' });
  const [savingPersonale, setSavingPersonale] = useState(false);
  const [assigningPersonaleCantiere, setAssigningPersonaleCantiere] = useState<string | null>(null);
  const [deletingPersonaleId, setDeletingPersonaleId] = useState<string | null>(null);

  // ============================================
  // MEZZI: Stati
  // ============================================
  const [mezziList, setMezziList] = useState<MezzoRecord[]>([]);
  const [mezziLoading, setMezziLoading] = useState(false);
  const [mezziFilterCantiere, setMezziFilterCantiere] = useState<string>('all');
  const [showAddMezzoForm, setShowAddMezzoForm] = useState(false);
  const [newMezzo, setNewMezzo] = useState({ targa: '', tipo: '', marcaModello: '' });
  const [savingMezzo, setSavingMezzo] = useState(false);
  const [assigningMezzoCantiere, setAssigningMezzoCantiere] = useState<string | null>(null);
  const [deletingMezzoId, setDeletingMezzoId] = useState<string | null>(null);

  // Carica nome impresa e lista cantieri
  useEffect(() => {
    if (!tenantId || !companyId || authLoading) {
      if (!authLoading && !companyId) setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    
    // Carica nome impresa
    const loadCompanyName = async () => {
      const companyRef = doc(db, `tenants/${tenantId}/companies/${companyId}`);
      const snap = await getDoc(companyRef);
      if (snap.exists()) {
        setCompanyName(snap.data().name || companyId);
      }
    };
    loadCompanyName();
    
    // Subscribe ai cantieri dell'impresa
    const qCantieri = query(
      collection(db, `tenants/${tenantId}/companies/${companyId}/cantieri`),
      orderBy('nome', 'asc')
    );
    
    const unsub = onSnapshot(qCantieri, (snap) => {
      const arr: Cantiere[] = [];
      snap.forEach(d => {
        const data = d.data();
        arr.push({
          id: d.id,
          nome: data.nome ?? '',
          codiceSito: data.codiceSito,
          indirizzo: data.indirizzo ?? '',
          dataInizio: data.dataInizio,
          dataFinePrevista: data.dataFinePrevista,
          committente: data.committente,
          impresaAffidataria: data.impresaAffidataria,
          impreseEsecutrici: data.impreseEsecutrici || [],
          rdl: data.rdl,
          dl: data.dl,
          csp: data.csp,
          cse: data.cse,
          note: data.note,
          stato: data.stato || 'attivo',
          createdAt: data.createdAt,
          createdBy: data.createdBy,
          isActive: data.isActive !== false,
        });
      });
      setCantieri(arr);
      setLoading(false);
    }, (error) => {
      console.error('Error loading cantieri:', error);
      setLoading(false);
    });
    
    return () => unsub();
  }, [tenantId, companyId, authLoading]);

  // ============================================
  // CARICA PERSONALE
  // ============================================
  useEffect(() => {
    if (!tenantId || !companyId) {
      setPersonaleList([]);
      return;
    }
    
    setPersonaleLoading(true);
    const db = getFirebaseDb();
    const q = query(
      collection(db, `tenants/${tenantId}/companies/${companyId}/personale`),
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
    }, (error) => {
      console.error('Error loading personale:', error);
      setPersonaleLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, companyId]);

  // ============================================
  // CARICA MEZZI
  // ============================================
  useEffect(() => {
    if (!tenantId || !companyId) {
      setMezziList([]);
      return;
    }
    
    setMezziLoading(true);
    const db = getFirebaseDb();
    const q = query(
      collection(db, `tenants/${tenantId}/companies/${companyId}/mezzi`),
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
    }, (error) => {
      console.error('Error loading mezzi:', error);
      setMezziLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, companyId]);

  // ============================================
  // PERSONALE: Filtri
  // ============================================
  const filteredPersonale = useMemo(() => {
    if (personaleFilterCantiere === 'all') {
      return personaleList;
    }
    return personaleList.filter(p => p.cantieriAssegnati.includes(personaleFilterCantiere));
  }, [personaleList, personaleFilterCantiere]);

  // ============================================
  // MEZZI: Filtri
  // ============================================
  const filteredMezzi = useMemo(() => {
    if (mezziFilterCantiere === 'all') {
      return mezziList;
    }
    return mezziList.filter(m => m.cantieriAssegnati.includes(mezziFilterCantiere));
  }, [mezziList, mezziFilterCantiere]);

  // Genera ID cantiere dal nome
  function generateCantiereId(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) + '-' + Date.now().toString(36);
  }

  // Crea nuovo cantiere
  async function handleCreateCantiere() {
    if (!tenantId || !companyId || !formData.nome.trim() || !formData.indirizzo.trim()) {
      alert('Nome e indirizzo sono obbligatori');
      return;
    }
    
    setCreating(true);
    
    try {
      const auth = getFirebaseAuth();
      const db = getFirebaseDb();
      const uid = auth.currentUser?.uid ?? 'unknown';
      const cantiereId = generateCantiereId(formData.nome);
      
      const cantiereRef = doc(db, `tenants/${tenantId}/companies/${companyId}/cantieri/${cantiereId}`);
      
      // Parse imprese esecutrici (separate da virgola)
      const impreseArr = formData.impreseEsecutrici
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const { setDoc } = await import('firebase/firestore');
      await setDoc(cantiereRef, {
        nome: formData.nome.trim(),
        ...(formData.codiceSito && { codiceSito: formData.codiceSito.trim() }),
        indirizzo: formData.indirizzo.trim(),
        ...(formData.dataInizio && { dataInizio: new Date(formData.dataInizio) }),
        ...(formData.dataFinePrevista && { dataFinePrevista: new Date(formData.dataFinePrevista) }),
        ...(formData.committente && { committente: formData.committente.trim() }),
        ...(formData.impresaAffidataria && { impresaAffidataria: formData.impresaAffidataria.trim() }),
        ...(impreseArr.length > 0 && { impreseEsecutrici: impreseArr }),
        ...(formData.rdl && { rdl: formData.rdl.trim() }),
        ...(formData.dl && { dl: formData.dl.trim() }),
        ...(formData.csp && { csp: formData.csp.trim() }),
        ...(formData.cse && { cse: formData.cse.trim() }),
        ...(formData.note && { note: formData.note.trim() }),
        stato: 'attivo',
        createdAt: serverTimestamp(),
        createdBy: uid,
        isActive: true,
        companyId: companyId,
        tenantId: tenantId,
      });
      
      // Reset form
      setFormData({
        nome: '',
        codiceSito: '',
        indirizzo: '',
        dataInizio: '',
        dataFinePrevista: '',
        committente: '',
        impresaAffidataria: '',
        impreseEsecutrici: '',
        rdl: '',
        dl: '',
        csp: '',
        cse: '',
        note: '',
      });
      setShowForm(false);
    } catch (e: any) {
      console.error(e);
      alert(`Errore creazione cantiere: ${e.message ?? e}`);
    } finally {
      setCreating(false);
    }
  }

  // Salva modifica cantiere
  async function handleSaveEdit() {
    if (!tenantId || !companyId || !editingId || !editData.nome.trim() || !editData.indirizzo.trim()) {
      alert('Nome e indirizzo sono obbligatori');
      return;
    }
    
    setSaving(true);
    
    try {
      const db = getFirebaseDb();
      
      // Parse imprese esecutrici
      const impreseArr = editData.impreseEsecutrici
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${companyId}/cantieri/${editingId}`), {
        nome: editData.nome.trim(),
        codiceSito: editData.codiceSito?.trim() || null,
        indirizzo: editData.indirizzo.trim(),
        dataInizio: editData.dataInizio ? new Date(editData.dataInizio) : null,
        dataFinePrevista: editData.dataFinePrevista ? new Date(editData.dataFinePrevista) : null,
        committente: editData.committente?.trim() || null,
        impresaAffidataria: editData.impresaAffidataria?.trim() || null,
        impreseEsecutrici: impreseArr,
        rdl: editData.rdl?.trim() || null,
        dl: editData.dl?.trim() || null,
        csp: editData.csp?.trim() || null,
        cse: editData.cse?.trim() || null,
        note: editData.note?.trim() || null,
        updatedAt: serverTimestamp(),
      });
      
      setEditingId(null);
    } catch (e: any) {
      console.error(e);
      alert(`Errore modifica: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // Archivia/Riattiva cantiere
  async function handleToggleArchive(cantiereId: string, currentStato: string) {
    if (!tenantId || !companyId) return;
    
    try {
      const db = getFirebaseDb();
      const newStato = currentStato === 'archiviato' ? 'attivo' : 'archiviato';
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${companyId}/cantieri/${cantiereId}`), {
        stato: newStato,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      console.error(e);
      alert(`Errore: ${e.message ?? e}`);
    }
  }

  // ============================================
  // PERSONALE: FUNZIONI CRUD
  // ============================================

  const saveNewPersonale = async () => {
    if (!tenantId || !companyId) return;
    if (!newPersonale.nome.trim() || !newPersonale.cognome.trim()) {
      alert('Nome e Cognome sono obbligatori');
      return;
    }
    
    setSavingPersonale(true);
    try {
      const db = getFirebaseDb();
      
      const personaleId = `${newPersonale.nome.toLowerCase().trim()}-${newPersonale.cognome.toLowerCase().trim()}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const personaleRef = doc(db, `tenants/${tenantId}/companies/${companyId}/personale/${personaleId}`);
      
      const existingDoc = await getDoc(personaleRef);
      
      if (existingDoc.exists()) {
        alert('Un dipendente con questo nome e cognome esiste già');
        setSavingPersonale(false);
        return;
      }
      
      await setDoc(personaleRef, {
        nome: newPersonale.nome.trim(),
        cognome: newPersonale.cognome.trim(),
        ...(newPersonale.codiceFiscale && { codiceFiscale: newPersonale.codiceFiscale.trim().toUpperCase() }),
        ...(newPersonale.mansione && { mansione: newPersonale.mansione.trim() }),
        cantieriAssegnati: [],
        createdAt: serverTimestamp(),
        isActive: true,
        companyId: companyId,
        tenantId: tenantId,
      });
      
      setNewPersonale({ nome: '', cognome: '', codiceFiscale: '', mansione: '' });
      setShowAddPersonaleForm(false);
      
    } catch (err) {
      console.error('Error saving personale:', err);
      alert('Errore nel salvataggio del dipendente');
    } finally {
      setSavingPersonale(false);
    }
  };

  const assignPersonaleToCantiere = async (personaleId: string, cantiereId: string) => {
    if (!tenantId || !companyId || !cantiereId) return;
    
    setAssigningPersonaleCantiere(personaleId);
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenantId}/companies/${companyId}/personale/${personaleId}`);
      
      const { arrayUnion } = await import('firebase/firestore');
      await updateDoc(personaleRef, {
        cantieriAssegnati: arrayUnion(cantiereId),
      });
      
    } catch (err) {
      console.error('Error assigning cantiere:', err);
      alert('Errore nell\'assegnazione al cantiere');
    } finally {
      setAssigningPersonaleCantiere(null);
    }
  };

  const removePersonaleFromCantiere = async (personaleId: string, cantiereId: string) => {
    if (!tenantId || !companyId) return;
    
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenantId}/companies/${companyId}/personale/${personaleId}`);
      
      const { arrayRemove } = await import('firebase/firestore');
      await updateDoc(personaleRef, {
        cantieriAssegnati: arrayRemove(cantiereId),
      });
    } catch (err) {
      console.error('Error removing cantiere:', err);
    }
  };

  const deletePersonale = async (personaleId: string) => {
    if (!tenantId || !companyId) return;
    
    if (!confirm('Sei sicuro di voler eliminare questo dipendente?')) return;
    
    setDeletingPersonaleId(personaleId);
    try {
      const db = getFirebaseDb();
      const personaleRef = doc(db, `tenants/${tenantId}/companies/${companyId}/personale/${personaleId}`);
      
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

  const saveNewMezzo = async () => {
    if (!tenantId || !companyId) return;
    if (!newMezzo.targa.trim() || !newMezzo.tipo.trim()) {
      alert('Targa e Tipo sono obbligatori');
      return;
    }
    
    setSavingMezzo(true);
    try {
      const db = getFirebaseDb();
      
      const mezzoId = newMezzo.targa.toUpperCase().trim()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      const mezzoRef = doc(db, `tenants/${tenantId}/companies/${companyId}/mezzi/${mezzoId}`);
      
      const existingDoc = await getDoc(mezzoRef);
      
      if (existingDoc.exists()) {
        alert('Un mezzo con questa targa esiste già');
        setSavingMezzo(false);
        return;
      }
      
      await setDoc(mezzoRef, {
        targa: newMezzo.targa.trim().toUpperCase(),
        tipo: newMezzo.tipo.trim(),
        ...(newMezzo.marcaModello && { marcaModello: newMezzo.marcaModello.trim() }),
        cantieriAssegnati: [],
        createdAt: serverTimestamp(),
        isActive: true,
        companyId: companyId,
        tenantId: tenantId,
      });
      
      setNewMezzo({ targa: '', tipo: '', marcaModello: '' });
      setShowAddMezzoForm(false);
      
    } catch (err) {
      console.error('Error saving mezzo:', err);
      alert('Errore nel salvataggio del mezzo');
    } finally {
      setSavingMezzo(false);
    }
  };

  const assignMezzoToCantiere = async (mezzoId: string, cantiereId: string) => {
    if (!tenantId || !companyId || !cantiereId) return;
    
    setAssigningMezzoCantiere(mezzoId);
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenantId}/companies/${companyId}/mezzi/${mezzoId}`);
      
      const { arrayUnion } = await import('firebase/firestore');
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

  const removeMezzoFromCantiere = async (mezzoId: string, cantiereId: string) => {
    if (!tenantId || !companyId) return;
    
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenantId}/companies/${companyId}/mezzi/${mezzoId}`);
      
      const { arrayRemove } = await import('firebase/firestore');
      await updateDoc(mezzoRef, {
        cantieriAssegnati: arrayRemove(cantiereId),
      });
    } catch (err) {
      console.error('Error removing cantiere from mezzo:', err);
    }
  };

  const deleteMezzo = async (mezzoId: string) => {
    if (!tenantId || !companyId) return;
    
    if (!confirm('Sei sicuro di voler eliminare questo mezzo?')) return;
    
    setDeletingMezzoId(mezzoId);
    try {
      const db = getFirebaseDb();
      const mezzoRef = doc(db, `tenants/${tenantId}/companies/${companyId}/mezzi/${mezzoId}`);
      
      await deleteDoc(mezzoRef);
      
    } catch (err) {
      console.error('Error deleting mezzo:', err);
      alert('Errore nell\'eliminazione del mezzo');
    } finally {
      setDeletingMezzoId(null);
    }
  };

  // Elimina cantiere
  async function handleDeleteCantiere(cantiereId: string) {
    if (!tenantId || !companyId) return;
    
    try {
      const db = getFirebaseDb();
      await deleteDoc(doc(db, `tenants/${tenantId}/companies/${companyId}/cantieri/${cantiereId}`));
      setDeletingId(null);
    } catch (e: any) {
      console.error(e);
      alert(`Errore eliminazione: ${e.message ?? e}`);
    }
  }

  // Formatta data per input
  function formatDateForInput(timestamp?: Timestamp): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toISOString().split('T')[0];
  }

  // Formatta data per display
  function formatDateDisplay(timestamp?: Timestamp): string {
    if (!timestamp) return '—';
    return timestamp.toDate().toLocaleDateString('it-IT');
  }

  const activeCantieri = cantieri.filter(c => c.isActive && c.stato !== 'archiviato');
  const archivedCantieri = cantieri.filter(c => c.isActive && c.stato === 'archiviato');
  const displayCantieri = showArchived ? archivedCantieri : activeCantieri;

  // Loading
  if (authLoading || loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  // No company ID
  if (!companyId) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>ID impresa mancante. Torna alla pagina Imprese.</p>
          <button
            onClick={() => router.push('/admin/aziende')}
            className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
          >
            Vai a Imprese
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/admin/aziende')}
          className="flex items-center gap-2 text-slate-500 hover:text-teal-600 mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Torna a Imprese</span>
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <HardHat className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient-warm">
                Cantieri
              </h1>
              <p className="text-slate-500 mt-1 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {companyName || companyId}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-xl border border-orange-200">
            <MapPin className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-700">{activeCantieri.length} cantieri</span>
          </div>
        </div>

        {/* TAB Navigation */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('cantieri')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'cantieri'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25'
                : 'bg-white/80 text-slate-600 hover:bg-orange-50 border border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <HardHat className="w-4 h-4" />
              Cantieri
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'cantieri' ? 'bg-white/20' : 'bg-orange-100 text-orange-700'
              }`}>
                {activeCantieri.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('personale')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'personale'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-white/80 text-slate-600 hover:bg-blue-50 border border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Personale
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'personale' ? 'bg-white/20' : 'bg-blue-100 text-blue-700'
              }`}>
                {personaleList.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('mezzi')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'mezzi'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25'
                : 'bg-white/80 text-slate-600 hover:bg-amber-50 border border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Mezzi
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'mezzi' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'
              }`}>
                {mezziList.length}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ============================================ */}
      {/* TAB: CANTIERI */}
      {/* ============================================ */}
      {activeTab === 'cantieri' && (
        <>
      {/* Pulsante Nuovo Cantiere */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-6 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-xl hover:from-orange-600 hover:to-amber-700 font-semibold shadow-lg shadow-orange-500/25 transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuovo Cantiere
        </button>
      )}

      {/* Form Nuovo Cantiere */}
      {showForm && (
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <Plus className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Nuovo Cantiere</h2>
                <p className="text-xs text-slate-500">Aggiungi un cantiere per {companyName}</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Sezione: Dati Principali */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <HardHat className="w-4 h-4" />
              Dati Principali
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome Cantiere <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                  placeholder="es. Ristrutturazione Via Roma 15"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Codice Sito
                </label>
                <input
                  type="text"
                  value={formData.codiceSito}
                  onChange={e => setFormData({...formData, codiceSito: e.target.value})}
                  placeholder="es. CAN-001"
                  className="input-modern"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Indirizzo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.indirizzo}
                  onChange={e => setFormData({...formData, indirizzo: e.target.value})}
                  placeholder="es. Via Roma 15, 00100 Roma"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Data Inizio
                </label>
                <input
                  type="date"
                  value={formData.dataInizio}
                  onChange={e => setFormData({...formData, dataInizio: e.target.value})}
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Data Fine Prevista
                </label>
                <input
                  type="date"
                  value={formData.dataFinePrevista}
                  onChange={e => setFormData({...formData, dataFinePrevista: e.target.value})}
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Committente
                </label>
                <input
                  type="text"
                  value={formData.committente}
                  onChange={e => setFormData({...formData, committente: e.target.value})}
                  placeholder="es. Comune di Roma"
                  className="input-modern"
                />
              </div>
            </div>
          </div>

          {/* Sezione: Imprese */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Imprese
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Impresa Affidataria
                </label>
                <input
                  type="text"
                  value={formData.impresaAffidataria}
                  onChange={e => setFormData({...formData, impresaAffidataria: e.target.value})}
                  placeholder="Nome impresa affidataria"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Imprese Esecutrici
                </label>
                <input
                  type="text"
                  value={formData.impreseEsecutrici}
                  onChange={e => setFormData({...formData, impreseEsecutrici: e.target.value})}
                  placeholder="Separate da virgola: Impresa A, Impresa B"
                  className="input-modern"
                />
                <p className="text-xs text-slate-400 mt-1">Inserisci più imprese separate da virgola</p>
              </div>
            </div>
          </div>

          {/* Sezione: Figure Professionali */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Figure Professionali
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  RDL (Responsabile dei Lavori)
                </label>
                <input
                  type="text"
                  value={formData.rdl}
                  onChange={e => setFormData({...formData, rdl: e.target.value})}
                  placeholder="Nome e cognome"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  DL (Direttore Lavori)
                </label>
                <input
                  type="text"
                  value={formData.dl}
                  onChange={e => setFormData({...formData, dl: e.target.value})}
                  placeholder="Nome e cognome"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  CSP (Coord. Sicurezza Progettazione)
                </label>
                <input
                  type="text"
                  value={formData.csp}
                  onChange={e => setFormData({...formData, csp: e.target.value})}
                  placeholder="Nome e cognome"
                  className="input-modern"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  CSE (Coord. Sicurezza Esecuzione)
                </label>
                <input
                  type="text"
                  value={formData.cse}
                  onChange={e => setFormData({...formData, cse: e.target.value})}
                  placeholder="Nome e cognome"
                  className="input-modern"
                />
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Note
            </label>
            <textarea
              value={formData.note}
              onChange={e => setFormData({...formData, note: e.target.value})}
              placeholder="Note aggiuntive..."
              rows={2}
              className="input-modern"
            />
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-medium transition-colors"
            >
              Annulla
            </button>
            <button
              disabled={creating || !formData.nome.trim() || !formData.indirizzo.trim()}
              onClick={handleCreateCantiere}
              className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-xl hover:from-orange-600 hover:to-amber-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed font-semibold shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Crea Cantiere
            </button>
          </div>
        </section>
      )}

      {/* Lista Cantieri */}
      <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <HardHat className="w-5 h-5 text-orange-500" />
              {showArchived ? 'Cantieri Archiviati' : 'Cantieri Attivi'}
              <span className="ml-2 text-xs font-medium px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                {displayCantieri.length} cantieri
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowArchived(false)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  !showArchived 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Attivi ({activeCantieri.length})
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
                  showArchived 
                    ? 'bg-slate-600 text-white' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                Archiviati ({archivedCantieri.length})
              </button>
            </div>
          </div>
        </div>
        
        {displayCantieri.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <HardHat className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">
              {showArchived ? 'Nessun cantiere archiviato' : 'Nessun cantiere creato'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {showArchived 
                ? 'I cantieri archiviati appariranno qui'
                : 'Crea il primo cantiere per questa impresa'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayCantieri.map(cantiere => (
              <div
                key={cantiere.id}
                className="px-6 py-4 hover:bg-slate-50/50 transition-colors"
              >
                {editingId === cantiere.id ? (
                  // Modalità edit
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={editData.nome}
                          onChange={e => setEditData({...editData, nome: e.target.value})}
                          placeholder="Nome cantiere *"
                          className="input-modern"
                        />
                      </div>
                      <input
                        type="text"
                        value={editData.codiceSito}
                        onChange={e => setEditData({...editData, codiceSito: e.target.value})}
                        placeholder="Codice sito"
                        className="input-modern"
                      />
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={editData.indirizzo}
                          onChange={e => setEditData({...editData, indirizzo: e.target.value})}
                          placeholder="Indirizzo *"
                          className="input-modern"
                        />
                      </div>
                      <input
                        type="date"
                        value={editData.dataInizio}
                        onChange={e => setEditData({...editData, dataInizio: e.target.value})}
                        className="input-modern"
                        title="Data inizio"
                      />
                      <input
                        type="date"
                        value={editData.dataFinePrevista}
                        onChange={e => setEditData({...editData, dataFinePrevista: e.target.value})}
                        className="input-modern"
                        title="Data fine prevista"
                      />
                      <input
                        type="text"
                        value={editData.committente}
                        onChange={e => setEditData({...editData, committente: e.target.value})}
                        placeholder="Committente"
                        className="input-modern"
                      />
                      <input
                        type="text"
                        value={editData.impresaAffidataria}
                        onChange={e => setEditData({...editData, impresaAffidataria: e.target.value})}
                        placeholder="Impresa affidataria"
                        className="input-modern"
                      />
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={editData.impreseEsecutrici}
                          onChange={e => setEditData({...editData, impreseEsecutrici: e.target.value})}
                          placeholder="Imprese esecutrici (separate da virgola)"
                          className="input-modern"
                        />
                      </div>
                      <input
                        type="text"
                        value={editData.rdl}
                        onChange={e => setEditData({...editData, rdl: e.target.value})}
                        placeholder="RDL"
                        className="input-modern"
                      />
                      <input
                        type="text"
                        value={editData.dl}
                        onChange={e => setEditData({...editData, dl: e.target.value})}
                        placeholder="DL"
                        className="input-modern"
                      />
                      <input
                        type="text"
                        value={editData.csp}
                        onChange={e => setEditData({...editData, csp: e.target.value})}
                        placeholder="CSP"
                        className="input-modern"
                      />
                      <input
                        type="text"
                        value={editData.cse}
                        onChange={e => setEditData({...editData, cse: e.target.value})}
                        placeholder="CSE"
                        className="input-modern"
                      />
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={editData.note}
                          onChange={e => setEditData({...editData, note: e.target.value})}
                          placeholder="Note"
                          className="input-modern"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-2 text-sm font-medium"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salva
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm font-medium"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : deletingId === cantiere.id ? (
                  // Conferma eliminazione
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-red-600">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">Eliminare &quot;{cantiere.nome}&quot;?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteCantiere(cantiere.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-medium"
                      >
                        Conferma
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  // Visualizzazione normale
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          cantiere.stato === 'archiviato'
                            ? 'bg-slate-100'
                            : 'bg-gradient-to-br from-orange-100 to-amber-100'
                        }`}>
                          <HardHat className={`w-6 h-6 ${
                            cantiere.stato === 'archiviato' ? 'text-slate-400' : 'text-orange-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800">{cantiere.nome}</p>
                            {cantiere.codiceSito && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                                {cantiere.codiceSito}
                              </span>
                            )}
                            {cantiere.stato === 'archiviato' && (
                              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs flex items-center gap-1">
                                <Archive className="w-3 h-3" />
                                Archiviato
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {cantiere.indirizzo}
                            </span>
                            {cantiere.committente && (
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {cantiere.committente}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                            {cantiere.dataInizio && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Inizio: {formatDateDisplay(cantiere.dataInizio)}
                              </span>
                            )}
                            {cantiere.dataFinePrevista && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Fine: {formatDateDisplay(cantiere.dataFinePrevista)}
                              </span>
                            )}
                          </div>
                          
                          {/* Pulsante espandi */}
                          <button
                            onClick={() => setExpandedId(expandedId === cantiere.id ? null : cantiere.id)}
                            className="mt-2 text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                          >
                            {expandedId === cantiere.id ? (
                              <>
                                <ChevronUp className="w-3 h-3" />
                                Nascondi dettagli
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                Mostra dettagli
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleArchive(cantiere.id, cantiere.stato)}
                          className={`p-2.5 rounded-xl transition-colors ${
                            cantiere.stato === 'archiviato'
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                          title={cantiere.stato === 'archiviato' ? 'Riattiva' : 'Archivia'}
                        >
                          {cantiere.stato === 'archiviato' ? (
                            <RotateCcw className="w-4 h-4" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(cantiere.id);
                            setEditData({
                              nome: cantiere.nome,
                              codiceSito: cantiere.codiceSito || '',
                              indirizzo: cantiere.indirizzo,
                              dataInizio: formatDateForInput(cantiere.dataInizio),
                              dataFinePrevista: formatDateForInput(cantiere.dataFinePrevista),
                              committente: cantiere.committente || '',
                              impresaAffidataria: cantiere.impresaAffidataria || '',
                              impreseEsecutrici: cantiere.impreseEsecutrici?.join(', ') || '',
                              rdl: cantiere.rdl || '',
                              dl: cantiere.dl || '',
                              csp: cantiere.csp || '',
                              cse: cantiere.cse || '',
                              note: cantiere.note || '',
                            });
                          }}
                          className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                          title="Modifica"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(cantiere.id)}
                          className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Dettagli espansi */}
                    {expandedId === cantiere.id && (
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        {/* Imprese */}
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            Imprese
                          </h4>
                          <div className="space-y-1 text-slate-600">
                            {cantiere.impresaAffidataria && (
                              <p><span className="text-slate-400">Affidataria:</span> {cantiere.impresaAffidataria}</p>
                            )}
                            {cantiere.impreseEsecutrici && cantiere.impreseEsecutrici.length > 0 && (
                              <div>
                                <span className="text-slate-400">Esecutrici:</span>
                                <ul className="ml-4 list-disc">
                                  {cantiere.impreseEsecutrici.map((imp, i) => (
                                    <li key={i}>{imp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {!cantiere.impresaAffidataria && (!cantiere.impreseEsecutrici || cantiere.impreseEsecutrici.length === 0) && (
                              <p className="text-slate-400 italic">Non specificato</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Figure professionali */}
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1">
                            <Shield className="w-4 h-4" />
                            Figure Professionali
                          </h4>
                          <div className="space-y-1 text-slate-600">
                            {cantiere.rdl && <p><span className="text-slate-400">RDL:</span> {cantiere.rdl}</p>}
                            {cantiere.dl && <p><span className="text-slate-400">DL:</span> {cantiere.dl}</p>}
                            {cantiere.csp && <p><span className="text-slate-400">CSP:</span> {cantiere.csp}</p>}
                            {cantiere.cse && <p><span className="text-slate-400">CSE:</span> {cantiere.cse}</p>}
                            {!cantiere.rdl && !cantiere.dl && !cantiere.csp && !cantiere.cse && (
                              <p className="text-slate-400 italic">Non specificato</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Note */}
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            Note
                          </h4>
                          <p className="text-slate-600">
                            {cantiere.note || <span className="text-slate-400 italic">Nessuna nota</span>}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {/* ============================================ */}
      {/* TAB: PERSONALE */}
      {/* ============================================ */}
      {activeTab === 'personale' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Gestione Personale</h2>
                  <p className="text-sm text-slate-500">
                    {personaleList.length} dipendenti registrati per {companyName}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Filtro Cantiere */}
                <div className="flex items-center gap-2 text-slate-500">
                  <Filter className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">Cantiere:</span>
                </div>
                <select
                  value={personaleFilterCantiere}
                  onChange={(e) => setPersonaleFilterCantiere(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Tutti i cantieri</option>
                  {activeCantieri.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                
                {/* Pulsante Aggiungi */}
                <button
                  onClick={() => setShowAddPersonaleForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-500/25"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Aggiungi</span>
                </button>
              </div>
            </div>

            {/* Form aggiunta dipendente */}
            {showAddPersonaleForm && (
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Nuovo Dipendente
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={newPersonale.nome}
                    onChange={(e) => setNewPersonale({...newPersonale, nome: e.target.value})}
                    placeholder="Nome *"
                    className="px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                  <input
                    type="text"
                    value={newPersonale.cognome}
                    onChange={(e) => setNewPersonale({...newPersonale, cognome: e.target.value})}
                    placeholder="Cognome *"
                    className="px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                  <input
                    type="text"
                    value={newPersonale.codiceFiscale}
                    onChange={(e) => setNewPersonale({...newPersonale, codiceFiscale: e.target.value.toUpperCase()})}
                    placeholder="Codice Fiscale"
                    className="px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white font-mono"
                    maxLength={16}
                  />
                  <input
                    type="text"
                    value={newPersonale.mansione}
                    onChange={(e) => setNewPersonale({...newPersonale, mansione: e.target.value})}
                    placeholder="Mansione"
                    className="px-3 py-2 border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => {
                      setShowAddPersonaleForm(false);
                      setNewPersonale({ nome: '', cognome: '', codiceFiscale: '', mansione: '' });
                    }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={saveNewPersonale}
                    disabled={savingPersonale || !newPersonale.nome.trim() || !newPersonale.cognome.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {savingPersonale ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Salva
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lista dipendenti */}
          {personaleLoading ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Loader2 className="w-10 h-10 mx-auto text-blue-400 animate-spin mb-3" />
              <p className="text-slate-500">Caricamento personale...</p>
            </div>
          ) : personaleList.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Nessun dipendente registrato</p>
              <p className="text-slate-400 text-sm max-w-md mx-auto mb-4">
                Usa il pulsante &quot;+ Aggiungi&quot; per creare un dipendente.
              </p>
              <button
                onClick={() => setShowAddPersonaleForm(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Aggiungi Dipendente
              </button>
            </div>
          ) : filteredPersonale.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Filter className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Nessun dipendente per questo cantiere</p>
              <button
                onClick={() => setPersonaleFilterCantiere('all')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Mostra tutti
              </button>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {filteredPersonale.map((persona) => (
                  <div key={persona.id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">
                            {persona.cognome} {persona.nome}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            {persona.mansione && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {persona.mansione}
                              </span>
                            )}
                            {persona.codiceFiscale && (
                              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                                {persona.codiceFiscale}
                              </span>
                            )}
                          </div>
                          {/* Cantieri assegnati */}
                          {persona.cantieriAssegnati && persona.cantieriAssegnati.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {persona.cantieriAssegnati.map(cid => {
                                const cantiere = activeCantieri.find(c => c.id === cid);
                                return (
                                  <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    <HardHat className="w-3 h-3" />
                                    {cantiere?.nome || cid}
                                    <button
                                      onClick={() => removePersonaleFromCantiere(persona.id, cid)}
                                      className="ml-1 hover:text-red-600"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Dropdown assegna a cantiere */}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignPersonaleToCantiere(persona.id, e.target.value);
                            }
                          }}
                          disabled={assigningPersonaleCantiere === persona.id}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">+ Assegna cantiere</option>
                          {activeCantieri
                            .filter(c => !persona.cantieriAssegnati?.includes(c.id))
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.nome}</option>
                            ))
                          }
                        </select>
                        <button
                          onClick={() => deletePersonale(persona.id)}
                          disabled={deletingPersonaleId === persona.id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Elimina"
                        >
                          {deletingPersonaleId === persona.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* TAB: MEZZI */}
      {/* ============================================ */}
      {activeTab === 'mezzi' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Gestione Mezzi</h2>
                  <p className="text-sm text-slate-500">
                    {mezziList.length} mezzi registrati per {companyName}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Filtro Cantiere */}
                <div className="flex items-center gap-2 text-slate-500">
                  <Filter className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">Cantiere:</span>
                </div>
                <select
                  value={mezziFilterCantiere}
                  onChange={(e) => setMezziFilterCantiere(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="all">Tutti i cantieri</option>
                  {activeCantieri.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                
                {/* Pulsante Aggiungi */}
                <button
                  onClick={() => setShowAddMezzoForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-amber-500/25"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Aggiungi</span>
                </button>
              </div>
            </div>

            {/* Form aggiunta mezzo */}
            {showAddMezzoForm && (
              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Nuovo Mezzo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={newMezzo.targa}
                    onChange={(e) => setNewMezzo({...newMezzo, targa: e.target.value.toUpperCase()})}
                    placeholder="Targa *"
                    className="px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white font-mono uppercase"
                  />
                  <select
                    value={newMezzo.tipo}
                    onChange={(e) => setNewMezzo({...newMezzo, tipo: e.target.value})}
                    className="px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                  >
                    <option value="">Seleziona tipo *</option>
                    {MEZZO_TYPES.map(tipo => (
                      <option key={tipo.key} value={tipo.key}>{tipo.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newMezzo.marcaModello}
                    onChange={(e) => setNewMezzo({...newMezzo, marcaModello: e.target.value})}
                    placeholder="Marca/Modello"
                    className="px-3 py-2 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => {
                      setShowAddMezzoForm(false);
                      setNewMezzo({ targa: '', tipo: '', marcaModello: '' });
                    }}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={saveNewMezzo}
                    disabled={savingMezzo || !newMezzo.targa.trim() || !newMezzo.tipo.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {savingMezzo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Salva
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Lista mezzi */}
          {mezziLoading ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Loader2 className="w-10 h-10 mx-auto text-amber-400 animate-spin mb-3" />
              <p className="text-slate-500">Caricamento mezzi...</p>
            </div>
          ) : mezziList.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Nessun mezzo registrato</p>
              <p className="text-slate-400 text-sm max-w-md mx-auto mb-4">
                Usa il pulsante &quot;+ Aggiungi&quot; per registrare un mezzo.
              </p>
              <button
                onClick={() => setShowAddMezzoForm(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Aggiungi Mezzo
              </button>
            </div>
          ) : filteredMezzi.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-12 text-center">
              <Filter className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Nessun mezzo per questo cantiere</p>
              <button
                onClick={() => setMezziFilterCantiere('all')}
                className="text-amber-600 hover:text-amber-700 text-sm font-medium"
              >
                Mostra tutti
              </button>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {filteredMezzi.map((mezzo) => (
                  <div key={mezzo.id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 font-mono">
                            {mezzo.targa}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              {mezzo.tipo}
                            </span>
                            {mezzo.marcaModello && (
                              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                                {mezzo.marcaModello}
                              </span>
                            )}
                          </div>
                          {/* Cantieri assegnati */}
                          {mezzo.cantieriAssegnati && mezzo.cantieriAssegnati.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {mezzo.cantieriAssegnati.map(cid => {
                                const cantiere = activeCantieri.find(c => c.id === cid);
                                return (
                                  <span key={cid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
                                    <HardHat className="w-3 h-3" />
                                    {cantiere?.nome || cid}
                                    <button
                                      onClick={() => removeMezzoFromCantiere(mezzo.id, cid)}
                                      className="ml-1 hover:text-red-600"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Dropdown assegna a cantiere */}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignMezzoToCantiere(mezzo.id, e.target.value);
                            }
                          }}
                          disabled={assigningMezzoCantiere === mezzo.id}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">+ Assegna cantiere</option>
                          {activeCantieri
                            .filter(c => !mezzo.cantieriAssegnati?.includes(c.id))
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.nome}</option>
                            ))
                          }
                        </select>
                        <button
                          onClick={() => deleteMezzo(mezzo.id)}
                          disabled={deletingMezzoId === mezzo.id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Elimina"
                        >
                          {deletingMezzoId === mezzo.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

