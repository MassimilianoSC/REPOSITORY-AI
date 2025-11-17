import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { recomputeCompanyAggregate } from '../aggregates/companyStatus';
import { getRequiredDocTypes } from '../lib/rulebookLoader';
import * as path from 'node:path';

const REGION = 'europe-west1';
const DEFAULT_BUCKET = process.env.STORAGE_BUCKET || 'repository-ai-477311.appspot.com';
const DELETE_RETENTION_DAYS = parseInt(process.env.DELETE_RETENTION_DAYS ?? '30', 10);

function assertManagerOrThrow(auth?: any) {
  if (!auth?.token) throw new HttpsError('unauthenticated', 'Auth required');
  if (auth.token.role !== 'manager')
    throw new HttpsError('permission-denied', 'Only manager can delete');
}

export const deleteDocument = onCall({ region: REGION }, async (req) => {
  assertManagerOrThrow(req.auth);

  const { tenantId, companyId, docId, reason } = req.data || {};

  if (!tenantId || !companyId || !docId) {
    throw new HttpsError('invalid-argument', 'Missing tenantId/companyId/docId');
  }

  const db = getFirestore();
  const bucket = getStorage().bucket(DEFAULT_BUCKET);

  const docRef = db.doc(`tenants/${tenantId}/companies/${companyId}/documents/${docId}`);
  const snap = await docRef.get();

  if (!snap.exists) throw new HttpsError('not-found', 'Document not found');

  const data = snap.data()!;

  // Idempotenza: se già eliminato, torna ok
  if (data.deletedAt) {
    console.log(`[deleteDocument] Document already deleted: ${docId}`);
    return { ok: true, alreadyDeleted: true };
  }

  const blobPath = data.blobName || data.upload?.path;
  const wasCurrent = !!data.isCurrent;
  const supersedes: string | undefined = data.supersedes;

  console.log(`[deleteDocument] Deleting document ${docId} (current: ${wasCurrent}, blob: ${blobPath})`);

  // Transazione Firestore
  await db.runTransaction(async (tx) => {
    // 1) Soft delete + audit
    tx.update(docRef, {
      isCurrent: false,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: req.auth!.uid,
      deletedReason: String(reason ?? ''),
      lifecycle: { status: 'deleted', at: FieldValue.serverTimestamp() }
    });

    // 2) Promuovi versione precedente se esiste
    if (wasCurrent && supersedes) {
      const prevRef = docRef.parent.doc(supersedes);
      const prevSnap = await tx.get(prevRef);
      if (prevSnap.exists && !prevSnap.get('deletedAt')) {
        console.log(`[deleteDocument] Promoting previous version: ${supersedes}`);
        tx.update(prevRef, { isCurrent: true, supersededBy: FieldValue.delete() });
      }
    }

    // 3) Audit log
    const logRef = db.collection(`tenants/${tenantId}/audit`).doc();
    tx.set(logRef, {
      type: 'doc_deleted',
      tenantId,
      companyId,
      docPath: docRef.path,
      docId,
      by: req.auth!.uid,
      byEmail: req.auth!.token?.email || 'unknown',
      reason: String(reason ?? ''),
      at: FieldValue.serverTimestamp()
    });
  });

  // 4) Sposta file in trash (fuori dalla transazione)
  if (blobPath) {
    const src = bucket.file(blobPath);
    const dst = bucket.file(
      `trash/${tenantId}/${companyId}/${docId}/${path.basename(blobPath)}`
    );

    try {
      const [exists] = await src.exists();
      if (exists) {
        await src.copy(dst);
        await src.delete();
        await dst.setMetadata({
          metadata: {
            deletedAt: new Date().toISOString(),
            retainUntilDays: String(DELETE_RETENTION_DAYS),
            originalPath: blobPath,
          }
        });
        console.log(`[deleteDocument] File moved to trash: ${blobPath} -> ${dst.name}`);
      } else {
        console.warn(`[deleteDocument] Blob not found, skipping: ${blobPath}`);
      }
    } catch (e: any) {
      // Non bloccare la cancellazione se il file non esiste
      console.warn('[deleteDocument] Storage move-to-trash failed:', e.message);
    }
  }

  // 5) Ricalcola aggregato azienda
  try {
    const requiredDocTypes = getRequiredDocTypes();
    await recomputeCompanyAggregate(tenantId, companyId, requiredDocTypes);
    console.log(`[deleteDocument] Aggregate recomputed for company ${companyId}`);
  } catch (aggErr: any) {
    console.error('[deleteDocument] Failed to recompute aggregate:', aggErr);
  }

  return { ok: true, deletedAt: new Date().toISOString() };
});

