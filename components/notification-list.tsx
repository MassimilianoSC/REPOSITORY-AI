'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, limit } from 'firebase/firestore';
import { CheckCircle2, FileText, Clock } from 'lucide-react';
import Link from 'next/link';

// NOTA: Adatta questi import ai tuoi path reali
// import { db } from '@/lib/firebaseClient';
// import { useAuth } from '@/hooks/useAuth';

export function NotificationList() {
  // TODO: Sostituisci con il tuo hook auth reale
  const uid = 'EXAMPLE_UID'; // mock
  const tid = 'EXAMPLE_TENANT'; // mock

  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});

  // Ascolta notifiche del tenant
  useEffect(() => {
    if (!tid) return;

    // TODO: Decommentare quando colleghi Firebase
    /*
    const q = query(
      collection(db, `tenants/${tid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => unsub();
    */

    // Mock data
    setItems([
      {
        id: '1',
        type: 'expiry',
        title: 'DURC in scadenza tra 7 giorni',
        message: 'Il documento DURC risulta in scadenza tra 7 giorni.\nData scadenza: 2024-12-15',
        docId: 'durc_123',
        severity: 'warn',
        createdAt: { toDate: () => new Date('2024-12-08') },
      },
      {
        id: '2',
        type: 'expiry',
        title: 'Visura Camerale in scadenza tra 15 giorni',
        message: 'Il documento Visura Camerale risulta in scadenza tra 15 giorni.\nData scadenza: 2024-12-23',
        docId: 'visura_456',
        severity: 'info',
        createdAt: { toDate: () => new Date('2024-12-08') },
      },
    ]);
  }, [tid]);

  // Ascolta read states
  useEffect(() => {
    if (!tid || !uid) return;

    // TODO: Decommentare quando colleghi Firebase
    /*
    const q = collection(db, `tenants/${tid}/userReads/${uid}/reads`);
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, boolean> = {};
      snap.docs.forEach(d => { map[d.id] = true; });
      setReads(map);
    });
    return () => unsub();
    */

    // Mock: prima notifica letta, seconda no
    setReads({ '1': true });
  }, [tid, uid]);

  async function markAsRead(id: string) {
    if (!tid || !uid) return;

    // TODO: Decommentare quando colleghi Firebase
    /*
    await setDoc(
      doc(db, `tenants/${tid}/userReads/${uid}/reads/${id}`),
      { readAt: serverTimestamp() },
      { merge: true }
    );
    */

    // Mock: aggiungi a reads
    setReads((prev) => ({ ...prev, [id]: true }));
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'warn':
        return 'border-l-yellow-500 bg-yellow-50';
      case 'error':
        return 'border-l-red-500 bg-red-50';
      default:
        return 'border-l-blue-500 bg-blue-50';
    }
  }

  function formatDate(createdAt: any) {
    const date = createdAt?.toDate?.() || new Date();
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Notifiche</h2>
        <span className="text-sm text-slate-500">
          {items.filter((i) => !reads[i.id]).length} non lette
        </span>
      </div>

      {items.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>Nessuna notifica</p>
        </div>
      )}

      {items.map((n) => {
        const unread = !reads[n.id];
        return (
          <div
            key={n.id}
            className={`
              p-4 rounded-lg border-l-4 transition-all
              ${unread ? getSeverityColor(n.severity) : 'border-l-slate-300 bg-white'}
              ${unread ? 'shadow-sm' : 'opacity-75'}
            `}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {n.type === 'expiry' && <Clock className="w-4 h-4 text-slate-500" />}
                  <span className={`font-medium ${unread ? 'text-slate-900' : 'text-slate-600'}`}>
                    {n.title}
                  </span>
                </div>

                <p className="text-sm text-slate-600 whitespace-pre-line mb-2">{n.message}</p>

                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{formatDate(n.createdAt)}</span>
                  {n.docId && (
                    <Link
                      href={`/document/${n.docId}`}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
                    >
                      <FileText className="w-3 h-3" />
                      Apri documento
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                {unread ? (
                  <button
                    onClick={() => markAsRead(n.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                  >
                    Segna come letto
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Letto</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

