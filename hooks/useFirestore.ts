/**
 * Custom hooks for Firestore real-time data
 */

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit as limitQuery,
  onSnapshot,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

export interface UseDocumentsOptions {
  status?: string;
  docType?: string;
  search?: string;
  limit?: number;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Hook to listen to multiple documents in real-time
 */
export function useDocuments(
  tenantId: string,
  companyId: string,
  options: UseDocumentsOptions = {}
) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId || !companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docsRef = collection(db, `tenants/${tenantId}/companies/${companyId}/documents`);

    const constraints: QueryConstraint[] = [];

    // Add filters
    if (options.status) {
      constraints.push(where('overall.status', '==', options.status));
    }
    if (options.docType) {
      constraints.push(where('docType', '==', options.docType));
    }

    // Add ordering
    const orderField = options.orderByField || 'updatedAt';
    const orderDir = options.orderDirection || 'desc';
    constraints.push(orderBy(orderField, orderDir));

    // Add limit
    if (options.limit) {
      constraints.push(limitQuery(options.limit));
    }

    const q = query(docsRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setDocuments(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading documents:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, companyId, options.status, options.docType, options.limit]);

  return { documents, loading, error };
}

/**
 * Hook to listen to a single document in real-time
 */
export function useDocument(tenantId: string, companyId: string, docId: string) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId || !companyId || !docId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, `tenants/${tenantId}/companies/${companyId}/documents/${docId}`);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setDocument({ id: snapshot.id, ...snapshot.data() });
        } else {
          setDocument(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading document:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, companyId, docId]);

  return { document, loading, error };
}

/**
 * Hook to listen to notifications
 */
export function useNotifications(tenantId: string, userId?: string) {
  const [notifications, setNotifications] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const notifRef = collection(db, `tenants/${tenantId}/notifications`);

    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limitQuery(50),
    ];

    // TODO: Add userId filter when implementing per-user notifications
    // if (userId) {
    //   constraints.push(where('userId', '==', userId));
    // }

    const q = query(notifRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setNotifications(notifs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error loading notifications:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, userId]);

  return { notifications, loading, error };
}

/**
 * Hook to listen to multiple companies' documents (for dashboard aggregation)
 */
export function useMultiCompanyDocuments(
  tenantId: string,
  companyIds: string[],
  options: UseDocumentsOptions = {}
) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tenantId || companyIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribes: (() => void)[] = [];
    const allDocs: DocumentData[] = [];

    companyIds.forEach((companyId) => {
      const docsRef = collection(db, `tenants/${tenantId}/companies/${companyId}/documents`);

      const constraints: QueryConstraint[] = [];

      if (options.status) {
        constraints.push(where('overall.status', '==', options.status));
      }
      if (options.docType) {
        constraints.push(where('docType', '==', options.docType));
      }

      constraints.push(orderBy('updatedAt', 'desc'));

      if (options.limit) {
        constraints.push(limitQuery(options.limit));
      }

      const q = query(docsRef, ...constraints);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const companyDocs = snapshot.docs.map((doc) => ({
            id: doc.id,
            companyId,
            ...doc.data(),
          }));

          // Remove old docs from this company and add new ones
          const filtered = allDocs.filter((d) => d.companyId !== companyId);
          allDocs.length = 0;
          allDocs.push(...filtered, ...companyDocs);

          setDocuments([...allDocs].sort((a, b) =>
            (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
          ));
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(`Error loading documents for company ${companyId}:`, err);
          setError(err as Error);
          setLoading(false);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [tenantId, companyIds.join(','), options.status, options.docType, options.limit]);

  return { documents, loading, error };
}

