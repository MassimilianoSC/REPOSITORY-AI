/**
 * Document Versioning - Step 8D (Piano Developer)
 * Gestisce versioning automatico con idempotenza basata su contentHash
 */

import * as admin from "firebase-admin";

export interface VersioningInput {
  db: FirebaseFirestore.Firestore;
  tenantId: string;
  companyId: string;
  docType: string;
  storagePath?: string;
  contentHash: string;
  data: Record<string, any>;
  logicalKey?: string;
  enableIdempotency?: boolean;
}

export interface VersioningResult {
  newId: string;
  version: number;
  supersededId?: string;
  didCreateNewVersion: boolean;
}

export async function createVersionedDocument(input: VersioningInput): Promise<VersioningResult> {
  const {
    db, tenantId, companyId, docType,
    logicalKey = `${tenantId}:${companyId}:${docType}`,
    contentHash, data, enableIdempotency = true
  } = input;

  const col = db.collection(`tenants/${tenantId}/companies/${companyId}/documents`);

  return await db.runTransaction(async (tx) => {
    // 1) prendi versione corrente
    const curSnap = await tx.get(
      col.where('logicalKey', '==', logicalKey).where('isCurrent', '==', true).limit(1)
    );

    const prevDoc = curSnap.empty ? null : curSnap.docs[0];

    // Idempotenza: se lo stesso contentHash è già l'ultima versione → non creare nuova
    if (enableIdempotency && prevDoc?.get('contentHash') === contentHash) {
      // aggiorna solo qualche metadato se serve (es. lastProcessedAt)
      tx.update(prevDoc.ref, { lastProcessedAt: new Date() });
      return {
        newId: prevDoc.id,
        version: prevDoc.get('version') ?? 1,
        didCreateNewVersion: false,
      };
    }

    // 2) prepara nuova versione
    const newRef = col.doc(); // nuova versione = nuovo docId
    const prevVersion = prevDoc?.get('version') ?? 0;
    const newVersion = prevVersion + 1;

    // 3) set nuova versione
    tx.set(newRef, {
      ...data,
      tenantId, companyId, docType,
      logicalKey,
      contentHash,
      version: newVersion,
      isCurrent: true,
      supersedes: prevDoc?.id ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4) chiudi la versione precedente (se esiste)
    if (prevDoc) {
      tx.update(prevDoc.ref, {
        isCurrent: false,
        supersededBy: newRef.id,
        updatedAt: new Date(),
      });
    }

    console.log(JSON.stringify({
      type: "document_versioned",
      newId: newRef.id,
      version: newVersion,
      supersededId: prevDoc?.id,
      didCreateNewVersion: true,
      contentHash,
      logicalKey,
      timestamp: new Date().toISOString(),
    }));

    return {
      newId: newRef.id,
      version: newVersion,
      supersededId: prevDoc?.id,
      didCreateNewVersion: true
    };
  });
}
