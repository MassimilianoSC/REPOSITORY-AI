'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Bell } from 'lucide-react';

// NOTA: Adatta questi import ai tuoi path reali
// import { db } from '@/lib/firebaseClient';
// import { useAuth } from '@/hooks/useAuth'; // hook che restituisce { uid, tid }

interface NotificationBellProps {
  onOpen: () => void;
}

export function NotificationBell({ onOpen }: NotificationBellProps) {
  // TODO: Sostituisci con il tuo hook auth reale
  const uid = 'EXAMPLE_UID'; // mock
  const tid = 'EXAMPLE_TENANT'; // mock

  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<Record<string, boolean>>({});

  // Ascolta ultime 50 notifiche del tenant (ordinamento recente)
  useEffect(() => {
    if (!tid) return;

    // TODO: Decommentare quando colleghi Firebase
    /*
    const q = query(
      collection(db, `tenants/${tid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
    */

    // Mock data per ora
    setItems([
      { id: '1', title: 'DURC in scadenza tra 7 giorni', createdAt: new Date() },
      { id: '2', title: 'Visura Camerale in scadenza tra 15 giorni', createdAt: new Date() },
    ]);
  }, [tid]);

  // Leggi i read states dell'utente per le ultime 50
  useEffect(() => {
    if (!tid || !uid || items.length === 0) return;

    // TODO: Decommentare quando colleghi Firebase
    /*
    (async () => {
      const readsCol = collection(db, `tenants/${tid}/userReads/${uid}/reads`);
      const snap = await getDocs(readsCol);
      const map: Record<string, boolean> = {};
      snap.forEach(d => { map[d.id] = true; });
      setReads(map);
    })();
    */

    // Mock: nessuno letto
    setReads({});
  }, [tid, uid, items]);

  const unreadCount = useMemo(
    () => items.filter(i => !reads[i.id]).length,
    [items, reads]
  );

  return (
    <button
      onClick={onOpen}
      className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
      aria-label={`Notifiche (${unreadCount} non lette)`}
    >
      <Bell className="w-5 h-5 text-slate-700" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 rounded-full bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center font-medium">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

