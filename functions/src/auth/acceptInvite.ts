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
  if (inv.expiresAt && (inv.expiresAt as Timestamp).toDate() < new Date()) throw new Error("INVITE_EXPIRED");

  const role = inv.role || "Member";
  const company_id = inv.company_id || null;

  // set custom claims
  await getAuth().setCustomUserClaims(uid, {
    tenant_id: tid,
    role,
    ...(company_id ? { company_id } : {})
  });

  await ref.set({ accepted: true, acceptedAt: new Date(), acceptedBy: uid }, { merge: true });

  logger.info("Invite accepted", { uid, tid, role, company_id });

  // client dovrà fare getIdToken(true)
  return { ok: true, claims: { tenant_id: tid, role, company_id: company_id || null } };
});

