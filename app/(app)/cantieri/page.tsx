'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  collection, doc, onSnapshot, orderBy, query, 
  serverTimestamp, Timestamp, updateDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { 
  Building2, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle,
  ArrowLeft, MapPin, Calendar, User, FileText, HardHat
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type Cantiere = {
  id: string;
  nome: string;
  indirizzo: string;
  dataInizio?: Timestamp;
  dataFinePrevista?: Timestamp;
  committente?: string;
  note?: string;
  createdAt?: Timestamp;
  createdBy?: string;
  isActive: boolean;
};

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
    indirizzo: '',
    dataInizio: '',
    dataFinePrevista: '',
    committente: '',
    note: '',
  });
  const [creating, setCreating] = useState(false);
  
  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    nome: '',
    indirizzo: '',
    dataInizio: '',
    dataFinePrevista: '',
    committente: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          indirizzo: data.indirizzo ?? '',
          dataInizio: data.dataInizio,
          dataFinePrevista: data.dataFinePrevista,
          committente: data.committente,
          note: data.note,
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
      
      const { setDoc } = await import('firebase/firestore');
      await setDoc(cantiereRef, {
        nome: formData.nome.trim(),
        indirizzo: formData.indirizzo.trim(),
        ...(formData.dataInizio && { dataInizio: new Date(formData.dataInizio) }),
        ...(formData.dataFinePrevista && { dataFinePrevista: new Date(formData.dataFinePrevista) }),
        ...(formData.committente && { committente: formData.committente.trim() }),
        ...(formData.note && { note: formData.note.trim() }),
        createdAt: serverTimestamp(),
        createdBy: uid,
        isActive: true,
        companyId: companyId,
        tenantId: tenantId,
      });
      
      // Reset form
      setFormData({
        nome: '',
        indirizzo: '',
        dataInizio: '',
        dataFinePrevista: '',
        committente: '',
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
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${companyId}/cantieri/${editingId}`), {
        nome: editData.nome.trim(),
        indirizzo: editData.indirizzo.trim(),
        dataInizio: editData.dataInizio ? new Date(editData.dataInizio) : null,
        dataFinePrevista: editData.dataFinePrevista ? new Date(editData.dataFinePrevista) : null,
        committente: editData.committente?.trim() || null,
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

  const activeCantieri = cantieri.filter(c => c.isActive);

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
      </div>

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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Note
              </label>
              <input
                type="text"
                value={formData.note}
                onChange={e => setFormData({...formData, note: e.target.value})}
                placeholder="Note aggiuntive..."
                className="input-modern"
              />
            </div>
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
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <HardHat className="w-5 h-5 text-orange-500" />
            Cantieri Attivi
            <span className="ml-2 text-xs font-medium px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
              {activeCantieri.length} cantieri
            </span>
          </h2>
        </div>
        
        {activeCantieri.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <HardHat className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Nessun cantiere creato</p>
            <p className="text-sm text-slate-400 mt-1">Crea il primo cantiere per questa impresa</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeCantieri.map(cantiere => (
              <div
                key={cantiere.id}
                className="px-6 py-4 hover:bg-slate-50/50 transition-colors"
              >
                {editingId === cantiere.id ? (
                  // Modalità edit
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={editData.nome}
                        onChange={e => setEditData({...editData, nome: e.target.value})}
                        placeholder="Nome cantiere"
                        className="input-modern"
                      />
                      <input
                        type="text"
                        value={editData.indirizzo}
                        onChange={e => setEditData({...editData, indirizzo: e.target.value})}
                        placeholder="Indirizzo"
                        className="input-modern"
                      />
                      <input
                        type="date"
                        value={editData.dataInizio}
                        onChange={e => setEditData({...editData, dataInizio: e.target.value})}
                        className="input-modern"
                      />
                      <input
                        type="date"
                        value={editData.dataFinePrevista}
                        onChange={e => setEditData({...editData, dataFinePrevista: e.target.value})}
                        className="input-modern"
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
                        value={editData.note}
                        onChange={e => setEditData({...editData, note: e.target.value})}
                        placeholder="Note"
                        className="input-modern"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                      >
                        <X className="w-5 h-5" />
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
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center flex-shrink-0">
                        <HardHat className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{cantiere.nome}</p>
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
                        {cantiere.note && (
                          <p className="mt-2 text-xs text-slate-400 italic">{cantiere.note}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingId(cantiere.id);
                          setEditData({
                            nome: cantiere.nome,
                            indirizzo: cantiere.indirizzo,
                            dataInizio: formatDateForInput(cantiere.dataInizio),
                            dataFinePrevista: formatDateForInput(cantiere.dataFinePrevista),
                            committente: cantiere.committente || '',
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
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

