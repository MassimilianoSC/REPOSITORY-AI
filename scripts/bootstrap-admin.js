// Script una tantum per configurare il primo admin
// Uso: node scripts/bootstrap-admin.js YOUR_EMAIL@example.com

const admin = require('firebase-admin');

// Inizializza con le credenziali di default (gcloud)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'repository-ai-477311'
});

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('❌ Errore: devi specificare l\'email');
    console.log('Uso: node scripts/bootstrap-admin.js YOUR_EMAIL@example.com');
    process.exit(1);
  }

  try {
    console.log(`🔍 Cerco utente con email: ${email}...`);
    
    // Cerca l'utente esistente
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      console.log(`✅ Utente trovato: ${user.uid}`);
    } catch (e) {
      // Se non esiste, crealo
      console.log(`⚠️  Utente non trovato, lo creo...`);
      user = await admin.auth().createUser({
        email: email,
        emailVerified: true
      });
      console.log(`✅ Utente creato: ${user.uid}`);
    }

    // Imposta i custom claims
    console.log(`🔧 Imposto custom claims...`);
    await admin.auth().setCustomUserClaims(user.uid, {
      tenant_id: 'tenant-demo',
      company_ids: ['Acme Corp', 'Beta Inc', 'Gamma LLC'],
      role: 'manager'
    });

    // Invalida i token vecchi
    await admin.auth().revokeRefreshTokens(user.uid);

    console.log(`\n✅ ✅ ✅ COMPLETATO! ✅ ✅ ✅\n`);
    console.log(`Email: ${email}`);
    console.log(`UID: ${user.uid}`);
    console.log(`Tenant: tenant-demo`);
    console.log(`Role: manager`);
    console.log(`Companies: Acme Corp, Beta Inc, Gamma LLC`);
    console.log(`\n🎉 Ora puoi fare login e usare l'app!\n`);

  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
}

main();

