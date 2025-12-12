// Script per verificare le claims di un utente
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'repository-ai-477311' });
}

async function checkUserClaims() {
  const email = 'm.cracchiolo@hqe.it';
  
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('📧 Email:', userRecord.email);
    console.log('🆔 UID:', userRecord.uid);
    console.log('📅 Creato:', userRecord.metadata.creationTime);
    console.log('🔐 Custom Claims:', JSON.stringify(userRecord.customClaims, null, 2));
    console.log('📱 Providers:', userRecord.providerData.map(p => p.providerId).join(', '));
  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
  
  process.exit(0);
}

checkUserClaims();

