/**
 * Custom hooks for Firestore real-time data
 */

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
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
export function useDocument(docIdOrPath: string) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docIdOrPath) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Se il path contiene "/" è un path completo, altrimenti cerca in tenant-demo
    if (docIdOrPath.includes('/')) {
      // Path completo tipo "tenant-demo/companies/acme/documents/abc123"
      const docRef = doc(db, docIdOrPath);
      
      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setDocument({ id: snapshot.id, ...snapshot.data() });
          } else {
            setDocument(null);
            setError('Documento non trovato');
          }
          setLoading(false);
        },
        (err) => {
          console.error('Error loading document:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // Solo docId: cerca in tutte le companies di tenant-demo (MVP)
      const tenantId = 'tenant-demo';
      const companies = ['acme', 'beta', 'gamma']; // TODO: recuperare da auth context
      
      // Prova a cercare in ogni company
      const tryCompanies = async () => {
        for (const companyId of companies) {
          try {
            const docRef = doc(db, `tenants/${tenantId}/companies/${companyId}/documents/${docIdOrPath}`);
            const snapshot = await getDoc(docRef);
            
            if (snapshot.exists()) {
              setDocument({ id: snapshot.id, ...snapshot.data() });
              setLoading(false);
              setError(null);
              
              // Setup listener per aggiornamenti real-time
              const unsubscribe = onSnapshot(docRef, (snap) => {
                if (snap.exists()) {
                  setDocument({ id: snap.id, ...snap.data() });
                }
              });
              
              return unsubscribe;
            }
          } catch (err) {
            console.warn(`Document not in ${companyId}`);
          }
        }
        
        setDocument(null);
        setError('Documento non trovato in nessuna azienda');
        setLoading(false);
        return () => {};
      };
      
      const cleanup = tryCompanies();
      return () => { cleanup.then(unsub => unsub()); };
    }
  }, [docIdOrPath]);

  return { document, loading, error };
}

// Legacy: hook con tenantId, companyId, docId separati
export function useDocumentByPath(tenantId: string, companyId: string, docId: string) {
  const fullPath = `tenants/${tenantId}/companies/${companyId}/documents/${docId}`;
  return useDocument(fullPath);
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

