'use client';

import { useState, useEffect, useCallback } from 'react';
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
      
      await addDoc(messagesRef, {
        text: text.trim(),
        senderUid,
        senderEmail,
        senderRole,
        companyId,
        tenantId,
        createdAt: serverTimestamp(),
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
