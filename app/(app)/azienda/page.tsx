'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { TrafficLight } from '@/components/traffic-light';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { mapBackendToUI } from '@/lib/statusMapper';
import { getIssuedAt, getExpiresAt, fmtDate } from '@/lib/fields';
import { useAuth } from '@/hooks/useAuth';

interface AggregateStatus {
  companyStatus: 'green' | 'yellow' | 'red' | 'na';
  totalRequired: number;
  totalOk: number;
  totalNotOk: number;
  totalExpiringSoon: number;
  nextExpiryAt: any;
}

interface DocItem {
  id: string;
  docType: string;
  status: 'green' | 'yellow' | 'red' | 'na';
  displayName?: string;
  expiresAt?: any;
  issuedAt?: any;
}

export default function AziendaPage() {
  const sp = useSearchParams();
  const cid = sp.get('cid');
  
  // ✅ FIX: Usa hook useAuth per ottenere tenantId (fallback da URL per retrocompatibilità)
  const { tenantId: authTenantId, loading: authLoading } = useAuth();
  const tid = sp.get('tid') || authTenantId || '';
  
  const [agg, setAgg] = useState<AggregateStatus | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tid || !cid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Carica dati azienda (compreso aggregateStatus)
    const cRef = doc(db, `tenants/${tid}/companies/${cid}`);
    getDoc(cRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setCompanyName(data?.name || cid);
        setAgg(data?.aggregateStatus || null);
      }
      setLoading(false);
    });

    // Listener real-time sui documenti richiesti
    const qDocs = query(
      collection(db, `tenants/${tid}/companies/${cid}/documents`),
      where('isDeleted', '==', false),  // FIX BUG #3: escludi eliminati
      where('isCurrent', '==', true),
      where('requiredForCompany', '==', true),
    );

    const unsub = onSnapshot(qDocs, (snap) => {
      const items = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as DocItem));
      setDocs(items);
    });

    return () => unsub();
  }, [tid, cid]);

  // Loading state durante autenticazione
  if (authLoading) {
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
  if (!tid) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  if (!cid) {
    return (
      <div className="p-8">
        <p className="text-red-600">Errore: ID azienda mancante (parametro ?cid=...)</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <p>Caricamento...</p>
      </div>
    );
  }

  const statusColor = mapBackendToUI(agg?.companyStatus);

  const statusLabel = agg?.companyStatus === 'green' ? 'Idoneo' :
                      agg?.companyStatus === 'yellow' ? 'Idoneo con prescrizioni' :
                      agg?.companyStatus === 'red' ? 'Non idoneo' : 'N/D';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
          <ArrowLeft size={20} />
          <span>Torna alla Dashboard</span>
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Stato Azienda</h1>
            <p className="text-slate-600">{companyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <TrafficLight status={statusColor} size="lg" />
            <span className="text-xl font-semibold text-slate-900">{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600 mb-1">Totali Richiesti</p>
          <p className="text-2xl font-bold text-slate-900">{agg?.totalRequired || 0}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm text-green-700 mb-1">Idonei</p>
          <p className="text-2xl font-bold text-green-900">{agg?.totalOk || 0}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <p className="text-sm text-yellow-700 mb-1">In Scadenza (≤10gg)</p>
          <p className="text-2xl font-bold text-yellow-900">{agg?.totalExpiringSoon || 0}</p>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <p className="text-sm text-red-700 mb-1">Non Idonei</p>
          <p className="text-2xl font-bold text-red-900">{agg?.totalNotOk || 0}</p>
        </div>
      </div>

      {/* Documenti Richiesti */}
      <section className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Documenti Richiesti
        </h2>
        
        {docs.length === 0 ? (
          <p className="text-slate-500 italic">Nessun documento richiesto per questa azienda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Documento</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Stato</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Emissione</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Scadenza</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => {
                  const exp = fmtDate(getExpiresAt(d));
                  const iss = fmtDate(getIssuedAt(d));
                  const mappedStatus = mapBackendToUI(d.status);
                  
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm text-slate-900">{d.displayName || d.docType}</td>
                      <td className="py-3 px-4">
                        <TrafficLight status={mappedStatus} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">{iss}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{exp}</td>
                      <td className="py-3 px-4">
                        <Link 
                          href={`/document?id=${d.id}&tid=${tid}`}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Apri
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Note normative */}
      <section className="mt-6 bg-slate-50 rounded-lg border border-slate-200 p-4">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900">
            Note normative e riferimenti
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              • <strong>Contenuti minimi formazione</strong>: DM 16/01/1997 (lavoratori, RLS, datori di lavoro)
            </li>
            <li>
              • <strong>Preposti 12 ore</strong>: nuovo Accordo Stato-Regioni (transitorio 8h valido fino a 12/2025, aggiornamento biennale)
            </li>
          </ul>
        </details>
      </section>
    </div>
  );
}

