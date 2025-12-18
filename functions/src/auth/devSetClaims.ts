import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";

const REGION = "europe-west1";

// NON deployare in produzione. Usala solo con Emulator o accesso limitato.
export const devSetClaims = onCall({ region: REGION }, async (request) => {
  try {
    // Estrai i parametri dalla callable
    const { email, claims } = request.data;
    
    if (!email || !claims || !claims.tenant_id || !claims.role) {
      throw new HttpsError('invalid-argument', 'email e claims (tenant_id, role) sono obbligatori');
    }

    // Ottieni UID dall'email
    const userRecord = await getAuth().getUserByEmail(email);
    const uid = userRecord.uid;

    // Imposta i custom claims
    await getAuth().setCustomUserClaims(uid, {
      tenant_id: claims.tenant_id,
      role: claims.role,
      company_ids: claims.company_ids || []
    });

    // ⚠️ FIX CRITICO: Invalida tutti i token esistenti
    await getAuth().revokeRefreshTokens(uid);

    console.log(`✅ Claims impostati per ${email} (${uid}):`, claims);

    return { 
      success: true, 
      message: 'Claims configurati con successo',
      uid,
      claims 
    };
  } catch (e: any) {
    console.error('❌ Errore devSetClaims:', e);
    throw new HttpsError('internal', e?.message || 'Errore durante la configurazione dei claims');
  }
});

