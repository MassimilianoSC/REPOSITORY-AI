'use client';

import { useEffect, useState } from 'react';
import { ManagerOnly } from '@/components/ManagerOnly';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  addDoc, collection, doc, getDocs, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc, deleteDoc
} from 'firebase/firestore';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { Building2, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle } from 'lucide-react';

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
      alert('Esiste già un\'azienda con questo nome (o nome simile)');
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
      alert(`Errore creazione azienda: ${e.message ?? e}`);
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

  return (
    <ManagerOnly>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Building2 className="w-8 h-8" />
            Gestione Aziende
          </h1>
          <p className="text-slate-600">
            Crea e gestisci le aziende del tuo tenant. Le aziende create qui saranno disponibili per gli inviti.
          </p>
        </div>

        {/* Form Nuova Azienda */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Nuova Azienda
          </h2>
          
          <div className="flex gap-4">
            <input
              type="text"
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              placeholder="Nome azienda (es. Rossi Costruzioni Srl)"
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
            />
            <button
              disabled={creating || !newCompanyName.trim()}
              onClick={handleCreateCompany}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Crea Azienda
            </button>
          </div>
          
          {newCompanyName.trim() && (
            <p className="mt-2 text-sm text-slate-500">
              ID azienda: <code className="bg-slate-100 px-2 py-1 rounded">{generateCompanyId(newCompanyName)}</code>
            </p>
          )}
        </section>

        {/* Lista Aziende Attive */}
        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Aziende Attive ({activeCompanies.length})
          </h2>
          
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-2" />
              <p className="text-slate-500">Caricamento...</p>
            </div>
          ) : activeCompanies.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Nessuna azienda creata</p>
              <p className="text-sm mt-1">Crea la prima azienda usando il form sopra</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCompanies.map(company => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  {editingId === company.id ? (
                    // Modalità edit
                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editName.trim()}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
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
                  ) : deletingId === company.id ? (
                    // Conferma eliminazione
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        <span>Eliminare "{company.name}"?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteCompany(company.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                        >
                          Conferma
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-sm"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Visualizzazione normale
                    <>
                      <div>
                        <p className="font-medium text-slate-900">{company.name}</p>
                        <p className="text-sm text-slate-500">
                          ID: <code className="bg-slate-100 px-1 rounded">{company.id}</code>
                          {company.createdAt && (
                            <span className="ml-3">
                              Creata: {formatDateTimeIT(company.createdAt)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingId(company.id);
                            setEditName(company.name);
                          }}
                          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                          title="Modifica nome"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(company.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Elimina azienda"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Aziende Disattivate */}
        {inactiveCompanies.length > 0 && (
          <section className="bg-slate-50 rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">
              Aziende Disattivate ({inactiveCompanies.length})
            </h2>
            <div className="space-y-2">
              {inactiveCompanies.map(company => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg opacity-60"
                >
                  <div>
                    <p className="font-medium text-slate-600 line-through">{company.name}</p>
                    <p className="text-xs text-slate-400">ID: {company.id}</p>
                  </div>
                  <button
                    onClick={() => handleReactivateCompany(company.id)}
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    Riattiva
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Info */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">💡 Come funziona</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Le aziende create qui appariranno nella pagina <strong>Inviti</strong></li>
            <li>• Quando inviti un utente, puoi assegnarlo a una o più aziende</li>
            <li>• Gli utenti "uploader" vedranno solo i documenti delle aziende assegnate</li>
            <li>• L'ID azienda viene generato automaticamente dal nome (usato nei path Firestore)</li>
          </ul>
        </div>
      </div>
    </ManagerOnly>
  );
}

