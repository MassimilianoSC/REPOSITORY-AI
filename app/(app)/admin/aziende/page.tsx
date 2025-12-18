'use client';

import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  collection, doc, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc, getDoc
} from 'firebase/firestore';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { 
  Building2, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle,
  Sparkles, RotateCcw, Archive, CheckCircle2, Factory, HardHat, ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

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
  const router = useRouter();
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Determina se è HQ (manager/verifier)
  const isHQ = role === 'manager' || role === 'verifier';
  
  // Form nuovo azienda (solo HQ)
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Edit inline (solo HQ)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation (solo HQ)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ✅ Redirect automatico se Uploader con singola impresa
  useEffect(() => {
    if (!authLoading && role === 'uploader' && companyIds.length === 1) {
      router.replace(`/cantieri?cid=${companyIds[0]}`);
    }
  }, [authLoading, role, companyIds, router]);

  // Carica lista aziende
  useEffect(() => {
    if (authLoading || !tenantId) {
      return;
    }

    // Se Uploader con singola impresa, non caricare (sta facendo redirect)
    if (role === 'uploader' && companyIds.length === 1) {
      return;
    }

    const db = getFirebaseDb();
    
    if (isHQ) {
      // HQ: carica tutte le aziende
      const qCompanies = query(
        collection(db, `tenants/${tenantId}/companies`),
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
            isActive: data.isActive !== false,
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
    } else {
      // Uploader: carica solo le proprie imprese
      const loadCompanies = async () => {
        try {
          const arr: Company[] = [];
          
          for (const cid of companyIds) {
            const docRef = doc(db, `tenants/${tenantId}/companies/${cid}`);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const data = snap.data();
              if (data.isActive !== false) {
                arr.push({
                  id: snap.id,
                  name: data.name ?? snap.id,
                  createdAt: data.createdAt,
                  createdBy: data.createdBy,
                  isActive: data.isActive !== false,
                  documentCount: data.documentCount ?? 0,
                });
              }
            }
          }
          
          setCompanies(arr);
        } catch (err) {
          console.error('Error loading companies for uploader:', err);
        } finally {
          setLoading(false);
        }
      };
      
      loadCompanies();
    }
  }, [tenantId, authLoading, isHQ, companyIds, role]);

  // Genera ID azienda dal nome (slug) - solo HQ
  function generateCompanyId(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  // Crea nuova azienda - solo HQ
  async function handleCreateCompany() {
    if (!isHQ || !tenantId || !newCompanyName.trim()) return;
    
    const name = newCompanyName.trim();
    const companyId = generateCompanyId(name);
    
    if (companies.some(c => c.id === companyId)) {
      alert('Esiste già un\'impresa con questo nome (o nome simile)');
      return;
    }
    
    setCreating(true);
    
    try {
      const auth = getFirebaseAuth();
      const db = getFirebaseDb();
      const uid = auth.currentUser?.uid ?? 'unknown';
      
      const companyRef = doc(db, `tenants/${tenantId}/companies/${companyId}`);
      await updateDoc(companyRef, {
        name,
        createdAt: serverTimestamp(),
        createdBy: uid,
        isActive: true,
      }).catch(async () => {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(companyRef, {
          name,
          createdAt: serverTimestamp(),
          createdBy: uid,
          isActive: true,
        });
      });
      
      setNewCompanyName('');
    } catch (e: any) {
      console.error(e);
      alert(`Errore creazione impresa: ${e.message ?? e}`);
    } finally {
      setCreating(false);
    }
  }

  // Modifica nome azienda - solo HQ
  async function handleSaveEdit() {
    if (!isHQ || !tenantId || !editingId || !editName.trim()) return;
    
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

  // Elimina azienda (soft delete) - solo HQ
  async function handleDeleteCompany(companyId: string) {
    if (!isHQ || !tenantId) return;
    
    try {
      const db = getFirebaseDb();
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

  // Riattiva azienda - solo HQ
  async function handleReactivateCompany(companyId: string) {
    if (!isHQ || !tenantId) return;
    
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

  // Loading / Redirect in corso
  if (authLoading || loading || (role === 'uploader' && companyIds.length === 1)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  // Non autenticato
  if (!tenantId) {
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
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-gradient">
                  {isHQ ? 'Gestione Imprese' : 'Le Mie Imprese'}
                </h1>
                {/* Badge azienda per Uploader con più imprese */}
                {!isHQ && companyIds.length > 1 && (
                  <span className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full text-sm font-semibold shadow-sm">
                    {companyIds.length} imprese
                  </span>
                )}
              </div>
              <p className="text-slate-500 mt-1">
                {isHQ ? 'Crea e gestisci le imprese del tuo tenant' : 'Accedi ai tuoi cantieri, personale e mezzi'}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              {isHQ ? 'Multi-tenant' : 'Impresa'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards - Solo per HQ */}
      {isHQ && (
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
      )}

      {/* Form Nuova Azienda - Solo per HQ */}
      {isHQ && (
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
      )}

      {/* Lista Aziende Attive */}
      <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-500" />
            {isHQ ? 'Imprese Attive' : 'Le Tue Imprese'}
            <span className="ml-2 text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
              {activeCompanies.length} imprese
            </span>
          </h2>
        </div>
        
        {activeCompanies.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">
              {isHQ ? 'Nessuna impresa creata' : 'Nessuna impresa assegnata'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {isHQ ? 'Crea la prima impresa usando il form sopra' : 'Contatta l\'amministratore'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeCompanies.map(company => (
              <div
                key={company.id}
                className="px-6 py-4 hover:bg-slate-50/50 transition-colors"
              >
                {editingId === company.id && isHQ ? (
                  // Modalità edit (solo HQ)
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
                ) : deletingId === company.id && isHQ ? (
                  // Conferma eliminazione (solo HQ)
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
                    <div 
                      className="flex items-center gap-4 flex-1 cursor-pointer group"
                      onClick={() => router.push(`/cantieri?cid=${company.id}`)}
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center group-hover:from-emerald-200 group-hover:to-teal-200 transition-colors">
                        <Building2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 group-hover:text-teal-700 transition-colors flex items-center gap-2">
                          {company.name}
                          <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-teal-500" />
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <code className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">
                            {company.id}
                          </code>
                          {isHQ && company.createdAt && (
                            <span className="text-xs text-slate-400">
                              Creata: {formatDateTimeIT(company.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => router.push(`/cantieri?cid=${company.id}`)}
                        className="p-2.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-xl transition-colors"
                        title="Gestisci cantieri"
                      >
                        <HardHat className="w-4 h-4" />
                      </button>
                      {/* Bottoni edit/delete solo per HQ */}
                      {isHQ && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(company.id);
                              setEditName(company.name);
                            }}
                            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                            title="Modifica nome"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(company.id);
                            }}
                            className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Elimina impresa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Aziende Disattivate - Solo HQ */}
      {isHQ && inactiveCompanies.length > 0 && (
        <section className="bg-slate-100/50 backdrop-blur-sm rounded-2xl border border-slate-200/50 overflow-hidden mb-8">
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
      <div className="p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-blue-200/50 rounded-2xl backdrop-blur-sm">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">💡</span>
          {isHQ ? 'Come funziona' : 'Cosa puoi fare'}
        </h3>
        <ul className="text-sm text-slate-700 space-y-2">
          {isHQ ? (
            <>
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
                <CheckCircle2 className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                Clicca su un&apos;impresa per gestire i suoi <strong>cantieri</strong>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                Clicca su un&apos;impresa per gestire <strong>cantieri, personale e mezzi</strong>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                Da lì potrai definire il personale e i mezzi prima di caricare i documenti
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                I dipendenti e mezzi inseriti saranno disponibili per l&apos;upload documenti
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
