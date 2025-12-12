'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, 
  serverTimestamp, Timestamp, limit 
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebaseClient';
import { ChatMessage } from '@/lib/types';

interface UseMessagesOptions {
  messageLimit?: number;
}

interface UseMessagesReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: Error | null;
  sendMessage: (text: string) => Promise<void>;
  sending: boolean;
}

/**
 * Hook per gestire i messaggi di chat tra HQ e un'azienda
 */
export function useMessages(
  tenantId: string,
  companyId: string,
  senderUid: string,
  senderEmail: string,
  senderRole: 'manager' | 'verifier' | 'uploader',
  options: UseMessagesOptions = {}
): UseMessagesReturn {
  const { messageLimit = 100 } = options;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sending, setSending] = useState(false);

  // Subscribe ai messaggi
  useEffect(() => {
    if (!tenantId || !companyId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    const messagesRef = collection(db, `tenants/${tenantId}/companies/${companyId}/messages`);
    const q = query(
      messagesRef,
      orderBy('createdAt', 'asc'),
      limit(messageLimit)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          msgs.push({
            id: doc.id,
            text: data.text || '',
            senderUid: data.senderUid || '',
            senderEmail: data.senderEmail || '',
            senderRole: data.senderRole || 'uploader',
            createdAt: data.createdAt instanceof Timestamp 
              ? data.createdAt.toDate() 
              : data.createdAt,
            companyId: data.companyId || companyId,
            tenantId: data.tenantId || tenantId,
          });
        });
        setMessages(msgs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useMessages] Error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, companyId, messageLimit]);

  // Funzione per inviare un messaggio
  const sendMessage = useCallback(async (text: string) => {
    if (!tenantId || !companyId || !senderUid || !text.trim()) {
      return;
    }

    setSending(true);
    try {
      const db = getFirebaseDb();
      const messagesRef = collection(db, `tenants/${tenantId}/companies/${companyId}/messages`);
      
      const docRef = await addDoc(messagesRef, {
        text: text.trim(),
        senderUid,
        senderEmail,
        senderRole,
        companyId,
        tenantId,
        createdAt: serverTimestamp(),
      });
      console.log('[useMessages] ✅ Messaggio salvato:', {
        path: `tenants/${tenantId}/companies/${companyId}/messages/${docRef.id}`,
        docId: docRef.id
      });
    } catch (err) {
      console.error('[useMessages] Send error:', err);
      throw err;
    } finally {
      setSending(false);
    }
  }, [tenantId, companyId, senderUid, senderEmail, senderRole]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    sending,
  };
}

/**
 * Hook per ottenere il conteggio messaggi non letti per un'azienda
 * (semplificato - conta messaggi nelle ultime 24h non dal proprio ruolo)
 */
export function useUnreadCount(
  tenantId: string,
  companyId: string,
  currentRole: 'manager' | 'verifier' | 'uploader'
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!tenantId || !companyId) {
      setCount(0);
      return;
    }

    const db = getFirebaseDb();
    const messagesRef = collection(db, `tenants/${tenantId}/companies/${companyId}/messages`);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let unread = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        const msgRole = data.senderRole;
        const createdAt = data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate() 
          : new Date(data.createdAt);
        
        // Conta come "non letto" se:
        // - Il messaggio è delle ultime 24h
        // - Il messaggio non è del mio "tipo" (HQ vs Uploader)
        const isFromOtherSide = 
          (currentRole === 'uploader' && (msgRole === 'manager' || msgRole === 'verifier')) ||
          ((currentRole === 'manager' || currentRole === 'verifier') && msgRole === 'uploader');
        
        if (isFromOtherSide && createdAt > oneDayAgo) {
          unread++;
        }
      });
      setCount(unread);
    });

    return () => unsubscribe();
  }, [tenantId, companyId, currentRole]);

  return count;
}

// Chiave localStorage per ultimo accesso chat
const CHAT_LAST_READ_KEY = 'hq_chat_last_read';

/**
 * Salva il timestamp di ultimo accesso alla chat di un'azienda
 * @param companyId - ID dell'azienda
 * @param latestMessageTimestamp - Timestamp del messaggio più recente (opzionale).
 *        Se fornito, usa max(Date.now(), latestMessageTimestamp + 1) per gestire clock skew.
 */
export function markChatAsRead(companyId: string, latestMessageTimestamp?: number): void {
  console.log('[markChatAsRead] 🟡 CHIAMATO per companyId:', companyId, 'latestMsgTs:', latestMessageTimestamp);
  if (typeof window === 'undefined') {
    console.log('[markChatAsRead] ❌ window undefined, esco');
    return;
  }
  try {
    const stored = localStorage.getItem(CHAT_LAST_READ_KEY);
    const oldData = stored ? JSON.parse(stored) : {};
    const oldValue = oldData[companyId] || 0;
    
    // Usa il timestamp più alto tra: ora, ultimo messaggio + 1ms, o valore esistente
    // Questo garantisce che anche con clock skew, i messaggi visualizzati siano "letti"
    let newValue = Date.now();
    if (latestMessageTimestamp && latestMessageTimestamp >= newValue) {
      newValue = latestMessageTimestamp + 1; // +1ms per essere sicuri
      console.log('[markChatAsRead] ⚠️ Clock skew detected! Usando timestamp messaggio + 1');
    }
    
    // Non sovrascrivere se il valore esistente è già più recente
    if (oldValue >= newValue) {
      console.log('[markChatAsRead] ⏭️ Valore esistente più recente, skip');
      return;
    }
    
    oldData[companyId] = newValue;
    localStorage.setItem(CHAT_LAST_READ_KEY, JSON.stringify(oldData));
    console.log('[markChatAsRead] ✅ SALVATO:', {
      companyId,
      oldValue: oldValue ? new Date(oldValue).toISOString() : 'mai',
      newValue: new Date(newValue).toISOString(),
      latestMsgTs: latestMessageTimestamp ? new Date(latestMessageTimestamp).toISOString() : 'N/A'
    });
  } catch (e) {
    console.warn('[markChatAsRead] ❌ Error:', e);
  }
}

/**
 * Ottiene il timestamp di ultimo accesso alla chat di un'azienda
 */
function getLastReadTime(companyId: string): number {
  if (typeof window === 'undefined') {
    console.log('[getLastReadTime] ❌ window undefined');
    return 0;
  }
  try {
    const stored = localStorage.getItem(CHAT_LAST_READ_KEY);
    if (!stored) {
      console.log('[getLastReadTime] 📭 Nessun dato in localStorage per', companyId);
      return 0;
    }
    const data = JSON.parse(stored);
    const value = data[companyId] || 0;
    console.log('[getLastReadTime] 📖 Letto per', companyId, ':', value ? new Date(value).toISOString() : 'mai');
    return value;
  } catch (e) {
    console.log('[getLastReadTime] ❌ Error:', e);
    return 0;
  }
}

// Interfaccia per i dati raw dei messaggi
interface RawMessageData {
  role: string;
  createdAt: number;
}

/**
 * Hook per contare messaggi non letti da TUTTE le aziende
 * Usato per il badge nella sidebar
 * 
 * FIX: Separato raccolta dati (onSnapshot) dal calcolo (che si aggiorna con localStorage)
 */
export function useGlobalUnreadCount(
  tenantId: string,
  companyIds: string[],
  currentRole: 'manager' | 'verifier' | 'uploader' | null,
  isHQ: boolean
): number {
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Ref per mantenere i messaggi raw senza triggerare re-render
  const messagesDataRef = useRef<Record<string, RawMessageData[]>>({});

  console.log('[useGlobalUnreadCount] 🔄 RENDER - refreshTrigger:', refreshTrigger, 'totalCount:', totalCount, 'currentRole:', currentRole);

  // Funzione per ricalcolare il conteggio basato su localStorage
  const recalculateCount = useCallback(() => {
    console.log('[recalculateCount] 🧮 CHIAMATO - currentRole:', currentRole);
    console.log('[recalculateCount] 📦 messagesDataRef.current:', JSON.stringify(messagesDataRef.current, null, 2));
    
    if (!currentRole) {
      console.log('[recalculateCount] ❌ No currentRole, setting count to 0');
      setTotalCount(0);
      return;
    }

    let total = 0;
    const details: any[] = [];
    
    Object.entries(messagesDataRef.current).forEach(([cid, msgs]) => {
      const lastRead = getLastReadTime(cid);
      let companyUnread = 0;
      
      msgs.forEach((msg, idx) => {
        const isFromOtherSide = 
          (currentRole === 'uploader' && (msg.role === 'manager' || msg.role === 'verifier')) ||
          ((currentRole === 'manager' || currentRole === 'verifier') && msg.role === 'uploader');
        
        const isUnread = isFromOtherSide && msg.createdAt > lastRead;
        
        if (idx < 5) { // Log solo primi 5 messaggi per azienda
          details.push({
            company: cid,
            msgRole: msg.role,
            msgTime: new Date(msg.createdAt).toISOString(),
            lastReadTime: lastRead ? new Date(lastRead).toISOString() : 'mai',
            isFromOtherSide,
            isNewer: msg.createdAt > lastRead,
            isUnread
          });
        }
        
        if (isUnread) {
          total++;
          companyUnread++;
        }
      });
      
      console.log(`[recalculateCount] 📊 Azienda ${cid}: ${companyUnread} non letti su ${msgs.length} messaggi`);
    });
    
    console.log('[recalculateCount] 📋 Dettagli messaggi:', details);
    console.log('[recalculateCount] ✅ TOTALE NON LETTI:', total);
    setTotalCount(total);
  }, [currentRole]);

  // Ascolta eventi per forzare ricalcolo quando localStorage cambia
  useEffect(() => {
    const handleStorageChange = () => {
      console.log('[useGlobalUnreadCount] 🎯 EVENTO RICEVUTO! (storage o chatRead)');
      console.log('[useGlobalUnreadCount] 🔄 Incremento refreshTrigger');
      setRefreshTrigger(n => {
        console.log('[useGlobalUnreadCount] refreshTrigger:', n, '->', n + 1);
        return n + 1;
      });
    };
    
    console.log('[useGlobalUnreadCount] 👂 Registrazione listener per storage e chatRead');
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('chatRead', handleStorageChange);
    
    return () => {
      console.log('[useGlobalUnreadCount] 🛑 Rimozione listener');
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('chatRead', handleStorageChange);
    };
  }, []);

  // Ricalcola quando cambia refreshTrigger (dopo markChatAsRead)
  useEffect(() => {
    console.log('[useGlobalUnreadCount] 🔔 useEffect[refreshTrigger] - trigger:', refreshTrigger);
    recalculateCount();
  }, [refreshTrigger, recalculateCount]);

  // Sottoscrizione a Firestore - raccoglie solo i dati
  useEffect(() => {
    console.log('[useGlobalUnreadCount] 🚀 useEffect[Firestore] - tenantId:', tenantId, 'currentRole:', currentRole, 'isHQ:', isHQ);
    
    if (!tenantId || !currentRole) {
      console.log('[useGlobalUnreadCount] ❌ No tenantId o currentRole, skip');
      messagesDataRef.current = {};
      setTotalCount(0);
      return;
    }

    if (!isHQ && (!companyIds || companyIds.length === 0)) {
      console.log('[useGlobalUnreadCount] ❌ Non è HQ e no companyIds, skip');
      messagesDataRef.current = {};
      setTotalCount(0);
      return;
    }

    const db = getFirebaseDb();
    const unsubscribes: (() => void)[] = [];
    const activeCompanies = new Set<string>();

    // Funzione per ascoltare una singola azienda
    const listenToCompany = (cid: string) => {
      if (activeCompanies.has(cid)) {
        console.log('[listenToCompany] ⏭️ Già in ascolto per:', cid);
        return;
      }
      console.log('[listenToCompany] 👂 Inizio ascolto per:', cid);
      activeCompanies.add(cid);

      const messagesRef = collection(db, `tenants/${tenantId}/companies/${cid}/messages`);
      const q = query(
        messagesRef,
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const unsub = onSnapshot(q, (snapshot) => {
        console.log(`[onSnapshot] 📨 Ricevuti ${snapshot.size} messaggi per azienda:`, cid);
        
        // Salva i dati raw dei messaggi
        const rawMessages: RawMessageData[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const createdAt = data.createdAt instanceof Timestamp 
            ? data.createdAt.toDate().getTime()
            : (data.createdAt ? new Date(data.createdAt).getTime() : 0);
          rawMessages.push({
            role: data.senderRole || 'uploader',
            createdAt
          });
        });
        
        console.log(`[onSnapshot] 💾 Salvati ${rawMessages.length} messaggi raw per:`, cid);
        messagesDataRef.current[cid] = rawMessages;
        
        // Ricalcola il conteggio totale (legge localStorage fresco)
        console.log('[onSnapshot] 🔄 Chiamo recalculateCount dopo aggiornamento dati');
        recalculateCount();
      }, (err) => {
        console.warn(`[useGlobalUnreadCount] ❌ Error for ${cid}:`, err.message);
        messagesDataRef.current[cid] = [];
        recalculateCount();
      });

      unsubscribes.push(unsub);
    };

    if (isHQ) {
      console.log('[useGlobalUnreadCount] 🏢 Modalità HQ - carico tutte le aziende');
      // HQ: carica tutte le aziende e ascolta
      const companiesRef = collection(db, `tenants/${tenantId}/companies`);
      const companiesUnsub = onSnapshot(companiesRef, (snapshot) => {
        console.log('[onSnapshot companies] 🏭 Ricevute', snapshot.size, 'aziende');
        
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            console.log('[onSnapshot companies] 🗑️ Rimossa azienda:', change.doc.id);
            delete messagesDataRef.current[change.doc.id];
            activeCompanies.delete(change.doc.id);
          }
        });

        snapshot.forEach((doc) => {
          if (doc.data().isActive !== false) {
            listenToCompany(doc.id);
          }
        });
        recalculateCount();
      });
      unsubscribes.push(companiesUnsub);
    } else {
      console.log('[useGlobalUnreadCount] 👤 Modalità Uploader - ascolto solo:', companyIds);
      // Uploader: ascolta solo le proprie aziende
      companyIds.forEach(cid => listenToCompany(cid));
    }

    return () => {
      console.log('[useGlobalUnreadCount] 🧹 Cleanup - rimuovo', unsubscribes.length, 'listener');
      unsubscribes.forEach(u => u());
      messagesDataRef.current = {};
      activeCompanies.clear();
    };
  }, [tenantId, companyIds, currentRole, isHQ, recalculateCount]);

  return totalCount;
}
