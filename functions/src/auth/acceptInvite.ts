import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const REGION = "europe-west1";

/**
 * acceptInvite - Accetta un invito e imposta le custom claims
 * 
 * FIX CRITICO: Dopo setCustomUserClaims, revoca i refresh tokens
 * per forzare il client a ottenere un nuovo token con le claims fresche.
 */
export const acceptInvite = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  const email = req.auth?.token?.email as string | undefined;
  const emailVerified = req.auth?.token?.email_verified as boolean | undefined;
  const signInProvider = req.auth?.token?.firebase?.sign_in_provider as string | undefined;

  if (!uid || !email) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }

  // 🔐 SICUREZZA: Se l'utente usa email+password, richiedi email verificata
  // Google/Microsoft verificano automaticamente l'email, quindi sono OK
  if (signInProvider === 'password' && !emailVerified) {
    logger.warn("Email not verified for password sign-in", { uid, email, signInProvider });
    throw new HttpsError('failed-precondition', 'Email non verificata. Controlla la tua casella di posta.');
  }

  const { tid, inviteId } = req.data as { tid: string; inviteId: string };
  if (!tid || !inviteId) {
    throw new HttpsError('invalid-argument', 'Missing tid/inviteId');
  }

  const db = getFirestore();
  const invRef = db.doc(`tenants/${tid}/invites/${inviteId}`);

  // Usa transazione per garantire consistenza
  const { role, company_ids } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invite not found');
    }

    const inv = snap.data()!;

    // Se già accettato, ritorna i dati esistenti
    if (inv.status === 'accepted' || inv.accepted === true) {
      logger.info("Invite already accepted, returning existing data", { uid, tid });
      return {
        role: inv.role || 'uploader',
        company_ids: inv.company_ids || []
      };
    }

    // 🔐 SICUREZZA: Rifiuta inviti cancellati, scaduti o in errore
    if (inv.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Questo invito è stato revocato');
    }
    if (inv.status === 'expired') {
      throw new HttpsError('failed-precondition', 'Questo invito è scaduto');
    }
    if (inv.status === 'error') {
      throw new HttpsError('failed-precondition', 'Questo invito ha un errore');
    }

    // Verifica email match
    if (inv.email?.toLowerCase() !== email.toLowerCase()) {
      throw new HttpsError('permission-denied', 'Email mismatch');
    }

    // Verifica scadenza
    if (inv.expiresAt) {
      let expiryDate: Date | null = null;
      if (typeof inv.expiresAt?.toDate === 'function') {
        expiryDate = inv.expiresAt.toDate();
      } else if (inv.expiresAt instanceof Date) {
        expiryDate = inv.expiresAt;
      }
      if (expiryDate && expiryDate < new Date()) {
        throw new HttpsError('failed-precondition', 'Invite expired');
      }
    }

    // Guardrail: company_ids obbligatorio per uploader
    const invRole = inv.role || 'uploader';
    const invCompanyIds: string[] = inv.company_ids || (inv.company_id ? [inv.company_id] : []);
    
    if (invRole === 'uploader' && (!Array.isArray(invCompanyIds) || invCompanyIds.length === 0)) {
      throw new HttpsError('failed-precondition', 'Invite has no company_ids - uploader must have at least one company');
    }

    // Aggiorna l'invito
    tx.update(invRef, {
      status: 'accepted',
      accepted: true,
      acceptedBy: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return {
      role: invRole,
      company_ids: invCompanyIds
    };
  });

  // 1) Imposta custom claims
  await getAuth().setCustomUserClaims(uid, {
    tenant_id: tid,
    role,
    company_ids, // Array di stringhe
  });

  logger.info("Custom claims set, invite accepted", { uid, tid, role, company_ids });
  
  // NOTA: NON usiamo revokeRefreshTokens() perché invalida completamente la sessione
  // Il client deve fare getIdToken(true) per ottenere le nuove claims

  return { 
    ok: true, 
    tenant_id: tid, 
    role, 
    company_ids,
    email 
  };
});

