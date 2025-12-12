// Script per impostare le claims dell'admin
// Esegui con: node scripts/set-admin-claims.js

const admin = require('firebase-admin');

// Inizializza con le credenziali di default (usa GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp({
  projectId: 'repository-ai-477311'
});

async function setAdminClaims() {
  const email = 'm.cracchiolo@hqe.it';
  
  try {
    // Ottieni l'utente per email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('✅ Utente trovato:', userRecord.uid);
    
    // Imposta le claims
    const claims = {
      tenant_id: 'tenant-demo',
      role: 'manager',
      company_ids: []
    };
    
    await admin.auth().setCustomUserClaims(userRecord.uid, claims);
    console.log('✅ Claims impostate:', claims);
    
    // Revoca i token per forzare il refresh
    await admin.auth().revokeRefreshTokens(userRecord.uid);
    console.log('✅ Token revocati - l\'utente dovrà rifare il login');
    
    console.log('\n🎉 Fatto! Ora fai logout e login di nuovo.');
  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
  
  process.exit(0);
}

setAdminClaims();

