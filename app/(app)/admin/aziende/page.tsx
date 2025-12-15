'use client';

import { useEffect, useState } from 'react';
import { ManagerOnly } from '@/components/ManagerOnly';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  collection, doc, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc
} from 'firebase/firestore';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { 
  Building2, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle,
  Sparkles, RotateCcw, Archive, CheckCircle2, Factory, Building
} from 'lucide-react';

type Company = {
  id: string;
  name: string;
  createdAt?: Timestamp;
  createdBy?: string;
  isActive: boolean;
  documentCount?: number;
};

export const dynamic = 'force-dynamic';

export default function AziendePage() {
  const [tenantId, setTenantId] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form nuovo azienda
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Carica tenantId e lista aziende
  useEffect(() => {
    const auth = getFirebaseAuth();
    
    const sub = auth.onIdTokenChanged(async (u) => {
      if (!u) {
        setLoading(false);
        return;
      }
      
      const r = await u.getIdTokenResult(true);
      const tid = String(r.claims?.tenant_id ?? '');
      setTenantId(tid);

      if (!tid) {
        setLoading(false);
        return;
      }

      const db = getFirebaseDb();
      
      // Subscribe alle aziende del tenant
      const qCompanies = query(
        collection(db, `tenants/${tid}/companies`),
        orderBy('name', 'asc')
      );
      
      const unsub = onSnapshot(qCompanies, (snap) => {
        const arr: Company[] = [];
        snap.forEach(d => {
          const data = d.data();
          arr.push({
            id: d.id,
            name: data.name ?? d.id,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            isActive: data.isActive !== false, // default true
            documentCount: data.documentCount ?? 0,
          });
        });
        setCompanies(arr);
        setLoading(false);
      }, (error) => {
        console.error('Error loading companies:', error);
        setLoading(false);
      });
      
      return () => unsub();
    });
    
    return () => sub();
  }, []);

  // Genera ID azienda dal nome (slug)
  function generateCompanyId(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // rimuovi accenti
      .replace(/[^a-z0-9]+/g, '-') // sostituisci non-alfanumerici con -
      .replace(/^-|-$/g, '') // rimuovi - iniziali/finali
      .substring(0, 50); // max 50 caratteri
  }

  // Crea nuova azienda
  async function handleCreateCompany() {
    if (!tenantId || !newCompanyName.trim()) return;
    
    const name = newCompanyName.trim();
    const companyId = generateCompanyId(name);
    
    // Verifica che non esista già
    if (companies.some(c => c.id === companyId)) {
      alert('Esiste già un\'impresa con questo nome (o nome simile)');
      return;
    }
    
    setCreating(true);
    
    try {
      const auth = getFirebaseAuth();
      const db = getFirebaseDb();
      const uid = auth.currentUser?.uid ?? 'unknown';
      
      // Crea documento con ID specifico (non auto-generato)
      const companyRef = doc(db, `tenants/${tenantId}/companies/${companyId}`);
      await updateDoc(companyRef, {
        name,
        createdAt: serverTimestamp(),
        createdBy: uid,
        isActive: true,
      }).catch(async () => {
        // Se il documento non esiste, crealo con setDoc
        const { setDoc } = await import('firebase/firestore');
        await setDoc(companyRef, {
          name,
          createdAt: serverTimestamp(),
          createdBy: uid,
          isActive: true,
        });
      });
      
      setNewCompanyName('');
      // La lista si aggiorna automaticamente via onSnapshot
    } catch (e: any) {
      console.error(e);
      alert(`Errore creazione impresa: ${e.message ?? e}`);
    } finally {
      setCreating(false);
    }
  }

  // Modifica nome azienda
  async function handleSaveEdit() {
    if (!tenantId || !editingId || !editName.trim()) return;
    
    setSaving(true);
    
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${editingId}`), {
        name: editName.trim(),
      });
      
      setEditingId(null);
      setEditName('');
    } catch (e: any) {
      console.error(e);
      alert(`Errore modifica: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // Elimina azienda (soft delete)
  async function handleDeleteCompany(companyId: string) {
    if (!tenantId) return;
    
    try {
      const db = getFirebaseDb();
      
      // Soft delete: imposta isActive = false
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${companyId}`), {
        isActive: false,
        deletedAt: serverTimestamp(),
      });
      
      setDeletingId(null);
    } catch (e: any) {
      console.error(e);
      alert(`Errore eliminazione: ${e.message ?? e}`);
    }
  }

  // Riattiva azienda
  async function handleReactivateCompany(companyId: string) {
    if (!tenantId) return;
    
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, `tenants/${tenantId}/companies/${companyId}`), {
        isActive: true,
        deletedAt: null,
      });
    } catch (e: any) {
      console.error(e);
      alert(`Errore riattivazione: ${e.message ?? e}`);
    }
  }

  const activeCompanies = companies.filter(c => c.isActive);
  const inactiveCompanies = companies.filter(c => !c.isActive);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <ManagerOnly>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-gradient">
                  Gestione Imprese
                </h1>
                <p className="text-slate-500 mt-1">Crea e gestisci le imprese del tuo tenant</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Multi-tenant</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          <div className="stat-card stat-card-teal">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-teal-100">Imprese Attive</p>
                <p className="text-4xl font-extrabold mt-2">{activeCompanies.length}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Factory className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>

          <div className="stat-card stat-card-purple">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-100">Archiviate</p>
                <p className="text-4xl font-extrabold mt-2">{inactiveCompanies.length}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Archive className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Form Nuova Azienda */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Nuova Impresa</h2>
              <p className="text-xs text-slate-500">Aggiungi una nuova impresa al tenant</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                placeholder="Nome impresa (es. Rossi Costruzioni Srl)"
                className="input-modern"
                onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
              />
            </div>
            <button
              disabled={creating || !newCompanyName.trim()}
              onClick={handleCreateCompany}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed font-semibold shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Crea
            </button>
          </div>
          
          {newCompanyName.trim() && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center gap-2">
              <span className="text-xs text-slate-500">ID impresa:</span>
              <code className="text-xs bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-700 font-mono">
                {generateCompanyId(newCompanyName)}
              </code>
            </div>
          )}
        </section>

        {/* Lista Aziende Attive */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-500" />
              Imprese Attive
              <span className="ml-2 text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                {activeCompanies.length} imprese
              </span>
            </h2>
          </div>
          
          {activeCompanies.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 font-medium">Nessuna impresa creata</p>
              <p className="text-sm text-slate-400 mt-1">Crea la prima impresa usando il form sopra</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeCompanies.map(company => (
                <div
                  key={company.id}
                  className="px-6 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  {editingId === company.id ? (
                    // Modalità edit
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 input-modern py-2"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editName.trim()}
                        className="p-2.5 text-emerald-600 hover:bg-emerald-50 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : deletingId === company.id ? (
                    // Conferma eliminazione
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-medium">Eliminare &quot;{company.name}&quot;?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteCompany(company.id)}
                          className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-medium transition-colors"
                        >
                          Conferma
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition-colors"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Visualizzazione normale
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{company.name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <code className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                              {company.id}
                            </code>
                            {company.createdAt && (
                              <span className="text-xs text-slate-400">
                                Creata: {formatDateTimeIT(company.createdAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(company.id);
                            setEditName(company.name);
                          }}
                          className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                          title="Modifica nome"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(company.id)}
                          className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Elimina impresa"
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

        {/* Aziende Disattivate */}
        {inactiveCompanies.length > 0 && (
          <section className="bg-slate-100/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/50">
              <h2 className="font-bold text-slate-600 flex items-center gap-2">
                <Archive className="w-5 h-5 text-slate-400" />
                Imprese Archiviate
                <span className="ml-2 text-xs font-medium px-2 py-1 bg-slate-200 text-slate-600 rounded-full">
                  {inactiveCompanies.length}
                </span>
              </h2>
            </div>
            <div className="divide-y divide-slate-200/50">
              {inactiveCompanies.map(company => (
                <div
                  key={company.id}
                  className="px-6 py-4 flex items-center justify-between opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-500 line-through">{company.name}</p>
                      <code className="text-xs text-slate-400">{company.id}</code>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReactivateCompany(company.id)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-xl font-medium transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Riattiva
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Info Box */}
        <div className="mt-8 p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-blue-200/50 rounded-2xl backdrop-blur-sm">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span className="text-xl">💡</span>
            Come funziona
          </h3>
          <ul className="text-sm text-slate-700 space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              Le imprese create qui appariranno nella pagina <strong>Inviti</strong>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              Quando inviti un utente, puoi assegnarlo a una o più imprese
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              Gli utenti &quot;operatore&quot; vedranno solo i documenti delle imprese assegnate
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              L&apos;ID impresa viene generato automaticamente dal nome
            </li>
          </ul>
        </div>
      </div>
    </ManagerOnly>
  );
}
