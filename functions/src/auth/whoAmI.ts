import { onCall, HttpsError } from "firebase-functions/v2/https";

const REGION = "europe-west1";

/**
 * whoAmI - Debug function per verificare le custom claims dell'utente
 * 
 * Utile per troubleshooting: il client può chiamare questa funzione
 * per vedere le claims correnti senza dover ispezionare manualmente il token.
 */
export const whoAmI = onCall({ region: REGION }, (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }

  return {
    uid: req.auth.uid,
    email: req.auth.token.email || null,
    claims: {
      tenant_id: req.auth.token.tenant_id || null,
      role: req.auth.token.role || null,
      company_ids: req.auth.token.company_ids || [],
    },
    // Informazioni aggiuntive per debug
    token_issued_at: req.auth.token.iat,
    token_expires_at: req.auth.token.exp,
  };
});

