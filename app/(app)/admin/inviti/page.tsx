'use client';

import { useEffect, useState } from 'react';
import { ManagerOnly } from '@/components/ManagerOnly';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  addDoc, collection, doc, getDocs, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc, deleteDoc
} from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { formatDateTimeIT } from '@/lib/dateUtils';
import { 
  Users, Send, Mail, UserPlus, Building2, ShieldCheck, Eye, 
  Upload, CheckCircle2, Clock, XCircle, AlertTriangle, Loader2,
  Sparkles, BadgeCheck, Ban
} from 'lucide-react';

type Company = { id: string; name: string };

type Invite = {
  id: string;
  email: string;
  role: 'manager' | 'verifier' | 'uploader';
  company_ids: string[];
  status: 'pending' | 'accepted' | 'expired' | 'cancelled' | 'error';
  invitedBy: string;
  createdAt?: Timestamp;
  expiresAt?: Timestamp;
  emailSentAt?: Timestamp;
  errorMessage?: string;
};

const roleConfig = {
  uploader: { 
    label: 'Operatore', 
    description: 'Carica solo i propri documenti',
    icon: Upload,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200'
  },
  verifier: { 
    label: 'Verificatore', 
    description: 'Verifica tutte le aziende',
    icon: Eye,
    color: 'text-sky-600',
    bg: 'bg-sky-100',
    border: 'border-sky-200'
  },
  manager: { 
    label: 'Amministratore', 
    description: 'Gestisce tutto',
    icon: ShieldCheck,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    border: 'border-amber-200'
  },
};

const statusConfig = {
  pending: { 
    label: 'In attesa', 
    icon: Clock, 
    color: 'text-amber-700', 
    bg: 'bg-amber-100',
    border: 'border-amber-300'
  },
  accepted: { 
    label: 'Accettato', 
    icon: CheckCircle2, 
    color: 'text-emerald-700', 
    bg: 'bg-emerald-100',
    border: 'border-emerald-300'
  },
  expired: { 
    label: 'Scaduto', 
    icon: AlertTriangle, 
    color: 'text-slate-600', 
    bg: 'bg-slate-100',
    border: 'border-slate-300'
  },
  cancelled: { 
    label: 'Revocato', 
    icon: Ban, 
    color: 'text-red-700', 
    bg: 'bg-red-100',
    border: 'border-red-300'
  },
  error: { 
    label: 'Errore', 
    icon: XCircle, 
    color: 'text-red-700', 
    bg: 'bg-red-100',
    border: 'border-red-300'
  },
};

export const dynamic = 'force-dynamic';

export default function InvitiPage() {
  const [tenantId, setTenantId] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'verifier' | 'uploader'>('uploader');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Carica tenantId da claims e lista company
  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    
    const sub = auth.onIdTokenChanged(async (u) => {
      if (!u) {
        setPageLoading(false);
        return;
      }
      const r = await u.getIdTokenResult(true);
      const tid = String(r.claims?.tenant_id ?? '');
      setTenantId(tid);

      // carica aziende del tenant
      const qs = await getDocs(collection(db, `tenants/${tid}/companies`));
      const rows: Company[] = [];
      qs.forEach(d => rows.push({ id: d.id, name: d.get('name') ?? d.id }));
      setCompanies(rows);

      // subscribe inviti
      const qInv = query(
        collection(db, `tenants/${tid}/invites`),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(qInv, (snap) => {
        const arr: Invite[] = [];
        snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
        setInvites(arr);
        setPageLoading(false);
      });
      return () => unsub();
    });
    return () => sub();
  }, []);

  const toggleCompany = (cid: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]
    );
  };

  async function handleCreateInvite() {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    
    if (!tenantId) return;
    if (!email) return alert('Inserisci un\'email valida');
    if (role !== 'manager' && selectedCompanyIds.length === 0) {
      return alert('Seleziona almeno un\'azienda (non richiesto solo per manager)');
    }

    setLoading(true);
    try {
      const now = Date.now();
      const expiresAt = Timestamp.fromDate(new Date(now + 7 * 24 * 60 * 60 * 1000));
      const invitedBy = auth.currentUser?.uid ?? 'unknown';

      // 1) Crea l'invito in Firestore (status pending)
      const ref = await addDoc(collection(db, `tenants/${tenantId}/invites`), {
        email,
        role,
        company_ids: role === 'manager' ? [] : selectedCompanyIds,
        status: 'pending',
        invitedBy,
        createdAt: serverTimestamp(),
        expiresAt
      });

      // 2) Invia email normale tramite Trigger Email extension (NO Magic Link)
      setSending(ref.id);
      const inviteLink = `${window.location.origin}/accept-invite?inviteId=${ref.id}&tid=${tenantId}`;
      const roleName = roleConfig[role]?.label || role;
      const companyNames = selectedCompanyIds.length > 0 
        ? selectedCompanyIds.map(cid => companies.find(c => c.id === cid)?.name || cid).join(', ')
        : 'Tutte le aziende';

      await addDoc(collection(db, 'mail'), {
        to: [email],
        message: {
          subject: '🔐 Invito alla piattaforma HQ Document AI',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0f172a;">Sei stato invitato!</h2>
              <p>Sei stato invitato a unirti alla piattaforma <strong>HQ Document AI</strong> con il ruolo di <strong>${roleName}</strong>.</p>
              ${selectedCompanyIds.length > 0 ? `<p>Aziende assegnate: <strong>${companyNames}</strong></p>` : ''}
              <p style="margin: 24px 0;">
                <a href="${inviteLink}" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Accetta Invito
                </a>
              </p>
              <p style="color: #64748b; font-size: 14px;">
                Questo invito scadrà tra 7 giorni.<br>
                Se non hai richiesto questo invito, puoi ignorare questa email.
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
              <p style="color: #94a3b8; font-size: 12px;">HQ Document AI - Gestione Documentale Intelligente</p>
            </div>
          `,
          text: `Sei stato invitato alla piattaforma HQ Document AI con il ruolo di ${roleName}. Clicca qui per accettare: ${inviteLink}`
        }
      });

      // 3) Aggiorna invito con emailSentAt
      await updateDoc(doc(db, `tenants/${tenantId}/invites/${ref.id}`), {
        emailSentAt: serverTimestamp()
      });

      alert('Invito creato e email inviata con successo!');
      setEmail('');
      setRole('uploader');
      setSelectedCompanyIds([]);
    } catch (e: any) {
      console.error(e);
      alert(`Errore invio invito: ${e.message ?? e}`);
    } finally {
      setLoading(false);
      setSending(null);
    }
  }

  async function revokeInvite(id: string) {
    const db = getFirebaseDb();
    if (!tenantId) return;
    if (!confirm('Revocare questo invito?')) return;
    await updateDoc(doc(db, `tenants/${tenantId}/invites/${id}`), {
      status: 'cancelled'
    });
  }

  async function deleteInvite(id: string) {
    const db = getFirebaseDb();
    if (!tenantId) return;
    if (!confirm('Eliminare definitivamente questo invito?')) return;
    await deleteDoc(doc(db, `tenants/${tenantId}/invites/${id}`));
  }

  // Statistiche inviti
  const stats = {
    pending: invites.filter(i => i.status === 'pending').length,
    accepted: invites.filter(i => i.status === 'accepted').length,
    total: invites.length,
  };

  if (pageLoading) {
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
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Users className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-rose-600">
                  Gestione Inviti
                </h1>
                <p className="text-slate-500 mt-1">Invita nuovi utenti alla piattaforma</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-xl border border-orange-200">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-orange-700">Magic Link</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="stat-card stat-card-blue">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100">Totale Inviti</p>
                <p className="text-4xl font-extrabold mt-2">{stats.total}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Mail className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>

          <div className="stat-card stat-card-amber">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-100">In Attesa</p>
                <p className="text-4xl font-extrabold mt-2">{stats.pending}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Clock className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>

          <div className="stat-card stat-card-green">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-100">Accettati</p>
                <p className="text-4xl font-extrabold mt-2">{stats.accepted}</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <BadgeCheck className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Form Nuovo Invito */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Nuovo Invito</h2>
              <p className="text-xs text-slate-500">Compila i campi per inviare un invito</p>
            </div>
          </div>
          
          <div className="grid gap-5 max-w-2xl">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="utente@azienda.it"
                className="input-modern"
              />
            </div>

            {/* Ruolo */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Ruolo
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(Object.entries(roleConfig) as [keyof typeof roleConfig, typeof roleConfig[keyof typeof roleConfig]][]).map(([key, config]) => {
                  const Icon = config.icon;
                  const isSelected = role === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRole(key as any)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? `${config.bg} ${config.border} ${config.color}` 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mb-2 ${isSelected ? config.color : 'text-slate-400'}`} />
                      <p className={`font-semibold text-sm ${isSelected ? config.color : 'text-slate-700'}`}>
                        {config.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{config.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selezione Aziende */}
            {role !== 'manager' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Aziende assegnate
                </label>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
                  {companies.map(c => {
                    const isSelected = selectedCompanyIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCompany(c.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                          isSelected ? 'bg-teal-500 border-teal-500' : 'border-slate-300'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
                {companies.length === 0 && (
                  <p className="text-sm text-slate-500 italic">
                    Nessuna azienda disponibile. Crea prima un&apos;azienda dalla sezione Aziende.
                  </p>
                )}
              </div>
            )}

            {/* Pulsante Invio */}
            <button
              disabled={loading || !email}
              onClick={handleCreateInvite}
              className="mt-2 px-6 py-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl hover:from-orange-600 hover:to-rose-600 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed font-semibold shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Invia Invito
                </>
              )}
            </button>

            {sending && (
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-700 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                <span>Invio link a: <strong>{email}</strong></span>
              </div>
            )}
          </div>
        </section>

        {/* Lista Inviti */}
        <section className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-rose-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Mail className="w-5 h-5 text-orange-500" />
              Storico Inviti
              <span className="ml-2 text-xs font-medium px-2 py-1 bg-orange-100 text-orange-700 rounded-full">
                {invites.length} inviti
              </span>
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            {invites.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Mail className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium">Nessun invito creato</p>
                <p className="text-sm text-slate-400 mt-1">Crea il primo invito usando il form sopra</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Ruolo</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Aziende</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Creato</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Stato</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invites.map(invite => {
                    const roleConf = roleConfig[invite.role];
                    const statusConf = statusConfig[invite.status];
                    const StatusIcon = statusConf.icon;
                    const RoleIcon = roleConf.icon;

                    return (
                      <tr key={invite.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-semibold text-sm">
                              {invite.email.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-slate-700">{invite.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${roleConf.bg} ${roleConf.color}`}>
                            <RoleIcon className="w-3.5 h-3.5" />
                            {roleConf.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {(invite.company_ids ?? []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {invite.company_ids.slice(0, 2).map(cid => (
                                <span key={cid} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                                  {cid}
                                </span>
                              ))}
                              {invite.company_ids.length > 2 && (
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                                  +{invite.company_ids.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatDateTimeIT(invite.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConf.bg} ${statusConf.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {statusConf.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {invite.status === 'pending' && (
                              <button
                                onClick={() => revokeInvite(invite.id)}
                                className="text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Revoca
                              </button>
                            )}
                            {(invite.status === 'cancelled' || invite.status === 'expired' || invite.status === 'error') && (
                              <button
                                onClick={() => deleteInvite(invite.id)}
                                className="text-sm font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Elimina
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Info Box */}
        <div className="mt-8 p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-blue-200/50 rounded-2xl backdrop-blur-sm">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <span className="text-xl">💡</span>
            Come funzionano gli inviti
          </h3>
          <ul className="text-sm text-slate-700 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5">•</span>
              L&apos;invitato riceverà un <strong>magic link</strong> via email
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5">•</span>
              Cliccando sul link, verrà automaticamente registrato con il ruolo assegnato
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5">•</span>
              Gli inviti scadono dopo <strong>7 giorni</strong> se non accettati
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-0.5">•</span>
              Puoi revocare un invito in qualsiasi momento prima dell&apos;accettazione
            </li>
          </ul>
        </div>
      </div>
    </ManagerOnly>
  );
}
