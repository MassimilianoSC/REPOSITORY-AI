/**
 * Document Versioning - Step 8D
 * Gestisce versioning automatico dei documenti quando si carica un nuovo file
 * dello stesso docType per la stessa azienda.
 * 
 * Schema:
 * - version: numero versione (1, 2, 3, ...)
 * - isCurrent: true solo per la versione corrente
 * - supersedes: docRef alla versione precedente
 * - supersededBy: docRef che ha sostituito questa versione (null se current)
 * - groupKey: `${companyId}:${docType}` per raggruppare versioni
 */

import { getFirestore, FieldValue, DocumentReference } from "firebase-admin/firestore";

export interface VersionedDocumentData {
  version: number;
  isCurrent: boolean;
  supersedes: DocumentReference | null;
  supersededBy: DocumentReference | null;
  groupKey: string;
  [key: string]: any;
}

/**
 * Crea o aggiorna un documento con versioning transazionale
 * 
 * @param tenantId - ID tenant
 * @param companyId - ID azienda
 * @param docType - Tipo documento (DURC, VISURA, etc.)
 * @param newDocRef - Riferimento al nuovo documento
 * @param payload - Dati del documento
 * @returns Promise con info versione
 */
export async function createVersionedDocument(
  tenantId: string,
  companyId: string,
  docType: string,
  newDocRef: DocumentReference,
  payload: any
): Promise<{ version: number; supersededPrevious: boolean }> {
  const db = getFirestore();

  const result = await db.runTransaction(async (tx) => {
    // 1. Cerca versione corrente esistente
    const q = db.collectionGroup('documents')
      .where('tenantId', '==', tenantId)
      .where('companyId', '==', companyId)
      .where('doc.docType', '==', docType)
      .where('isCurrent', '==', true)
      .limit(1);

    const currentDocs = await tx.get(q);

    let version = 1;
    let supersedesRef: DocumentReference | null = null;
    let supersededPrevious = false;

    // 2. Se esiste una versione corrente, marcala come superseded
    if (!currentDocs.empty) {
      const prevDoc = currentDocs.docs[0];
      const prevRef = prevDoc.ref;
      const prevData = prevDoc.data();

      version = (prevData.version ?? 1) + 1;
      supersedesRef = prevRef;
      supersededPrevious = true;

      // Marca la versione precedente come non corrente
      tx.update(prevRef, {
        isCurrent: false,
        supersededBy: newDocRef,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(JSON.stringify({
        type: "document_superseded",
        prevDocId: prevRef.id,
        newDocId: newDocRef.id,
        docType,
        companyId,
        prevVersion: prevData.version,
        newVersion: version,
        timestamp: new Date().toISOString(),
      }));
    }

    // 3. Crea il nuovo documento con versioning
    const groupKey = `${companyId}:${docType}`;

    tx.set(newDocRef, {
      ...payload,
      version,
      isCurrent: true,
      supersedes: supersedesRef,
      supersededBy: null,
      groupKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(JSON.stringify({
      type: "document_versioned",
      docId: newDocRef.id,
      docType,
      companyId,
      tenantId,
      version,
      supersedes: supersedesRef?.id || null,
      timestamp: new Date().toISOString(),
    }));

    return { version, supersededPrevious };
  });

  return result;
}

/**
 * Recupera lo storico versioni di un documento
 * 
 * @param groupKey - Chiave gruppo `${companyId}:${docType}`
 * @returns Array di documenti ordinati per versione (desc)
 */
export async function getDocumentHistory(
  groupKey: string
): Promise<any[]> {
  const db = getFirestore();

  const snapshot = await db.collectionGroup('documents')
    .where('groupKey', '==', groupKey)
    .orderBy('version', 'desc')
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

/**
 * Recupera la versione corrente di un documento
 * 
 * @param tenantId - ID tenant
 * @param companyId - ID azienda
 * @param docType - Tipo documento
 * @returns Documento corrente o null
 */
export async function getCurrentVersion(
  tenantId: string,
  companyId: string,
  docType: string
): Promise<any | null> {
  const db = getFirestore();

  const snapshot = await db.collectionGroup('documents')
    .where('tenantId', '==', tenantId)
    .where('companyId', '==', companyId)
    .where('doc.docType', '==', docType)
    .where('isCurrent', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  };
}

