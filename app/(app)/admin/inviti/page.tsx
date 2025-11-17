'use client';

import { useEffect, useState } from 'react';
import { ManagerOnly } from '@/components/ManagerOnly';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import {
  addDoc, collection, doc, getDocs, onSnapshot, orderBy,
  query, serverTimestamp, Timestamp, updateDoc
} from 'firebase/firestore';
import {
  sendSignInLinkToEmail
} from 'firebase/auth';

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

  // Carica tenantId da claims e lista company
  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    
    const sub = auth.onIdTokenChanged(async (u) => {
      if (!u) return;
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
      return onSnapshot(qInv, (snap) => {
        const arr: Invite[] = [];
        snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));
        setInvites(arr);
      });
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

      // 2) Invia magic link con redirect a /accept-invite?inviteId=...
      setSending(ref.id);
      const actionCodeSettings = {
        url: `${window.location.origin}/accept-invite?inviteId=${ref.id}&tid=${tenantId}`,
        handleCodeInApp: true
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      
      // Salva email per completamento sign-in
      window.localStorage.setItem('emailForSignIn', email);

      // 3) Aggiorna invito con emailSentAt
      await updateDoc(doc(db, `tenants/${tenantId}/invites/${ref.id}`), {
        emailSentAt: serverTimestamp()
      });

      alert('Invito creato e link inviato via email');
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

  return (
    <ManagerOnly>
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Gestione Inviti</h1>

        <section className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Nuovo Invito</h2>
          <div className="grid gap-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="utente@azienda.it"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ruolo
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="uploader">Utente Azienda Esterna (carica solo i propri documenti)</option>
                <option value="verifier">Controllore HQ (verifica tutte le aziende)</option>
                <option value="manager">Amministratore HQ (gestisce tutto)</option>
              </select>
            </div>

            {role !== 'manager' && (
              <div>
                <div className="block text-sm font-medium text-slate-700 mb-2">
                  Aziende (selezione multipla)
                </div>
                <div className="grid gap-2 grid-cols-2">
                  {companies.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              disabled={loading || !email}
              onClick={handleCreateInvite}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Invio…' : 'Invia Invito'}
            </button>

            {sending && (
              <div className="text-sm text-slate-600">
                Invio link a: {email} (inviteId: {sending})
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Inviti Attivi</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Ruolo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Aziende</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Creato</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Stato</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm">{i.email}</td>
                    <td className="px-4 py-3 text-sm">{i.role}</td>
                    <td className="px-4 py-3 text-sm">{(i.company_ids ?? []).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {i.createdAt ? i.createdAt.toDate().toLocaleString('it-IT') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        i.status === 'accepted' ? 'bg-green-100 text-green-800' :
                        i.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        i.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {i.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {i.status === 'pending' && (
                        <button
                          onClick={() => revokeInvite(i.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Revoca
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Nessun invito creato
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ManagerOnly>
  );
}

