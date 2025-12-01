import { onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const REGION = "europe-west1";

export const acceptInvite = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  const email = req.auth?.token?.email as string | undefined;

  if (!uid || !email) {
    throw new Error("UNAUTHENTICATED");
  }

  const { tid, inviteId } = req.data as { tid: string; inviteId: string };
  if (!tid || !inviteId) throw new Error("INVALID_ARGUMENT");

  const db = getFirestore();
  const ref = db.doc(`tenants/${tid}/invites/${inviteId}`);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("INVITE_NOT_FOUND");

  const inv = snap.data() as any;

  if (inv.accepted === true) throw new Error("INVITE_ALREADY_ACCEPTED");
  if (inv.email?.toLowerCase() !== email.toLowerCase()) throw new Error("EMAIL_MISMATCH");
  
  // Safe timestamp check
  if (inv.expiresAt) {
    let expiryDate: Date | null = null;
    if (typeof inv.expiresAt?.toDate === 'function') {
      expiryDate = inv.expiresAt.toDate();
    } else if (inv.expiresAt instanceof Date) {
      expiryDate = inv.expiresAt;
    }
    if (expiryDate && expiryDate < new Date()) {
      throw new Error("INVITE_EXPIRED");
    }
  }

  const role = inv.role || "uploader";
  // Supporta sia company_ids (array) che company_id (singolo per retrocompatibilità)
  const company_ids: string[] = inv.company_ids || (inv.company_id ? [inv.company_id] : []);

  // set custom claims
  await getAuth().setCustomUserClaims(uid, {
    tenant_id: tid,
    role,
    company_ids, // Array di aziende assegnate
  });

  await ref.set({ 
    accepted: true, 
    status: 'accepted',
    acceptedAt: new Date(), 
    acceptedBy: uid 
  }, { merge: true });

  logger.info("Invite accepted", { uid, tid, role, company_ids });

  // client dovrà fare getIdToken(true)
  return { ok: true, claims: { tenant_id: tid, role, company_ids } };
});

