/**
 * Script per svuotare la Knowledge Base
 * ⚠️ ATTENZIONE: Elimina TUTTI i chunks!
 * 
 * Uso: node scripts/clear-kb.js
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Inizializza Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'repository-ai-477311'
  });
}

const db = admin.firestore();
const TENANT_ID = 'tenant-demo';

async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function clearKB() {
  console.log('🗑️  SVUOTAMENTO KNOWLEDGE BASE');
  console.log('='.repeat(60));
  console.log(`📍 Collection: tenants/${TENANT_ID}/kb_chunks\n`);

  const chunksRef = db.collection(`tenants/${TENANT_ID}/kb_chunks`);
  const snapshot = await chunksRef.count().get();
  const count = snapshot.data().count;

  console.log(`⚠️  Trovati ${count} chunks da eliminare\n`);

  if (count === 0) {
    console.log('✅ KB già vuota, nulla da fare');
    return;
  }

  const confirmed = await confirm(`❓ Sei sicuro di voler eliminare ${count} chunks? (y/N): `);
  
  if (!confirmed) {
    console.log('❌ Operazione annullata');
    return;
  }

  console.log('\n🔄 Eliminazione in corso...');
  
  // Elimina in batch (max 500 per batch)
  const BATCH_SIZE = 500;
  let deleted = 0;

  while (true) {
    const batch = db.batch();
    const docs = await chunksRef.limit(BATCH_SIZE).get();
    
    if (docs.empty) break;
    
    docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    deleted += docs.size;
    console.log(`   Eliminati: ${deleted}/${count}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ KB svuotata! Eliminati ${deleted} chunks`);
  console.log('\n📋 PROSSIMI PASSI:');
  console.log('1. Carica i PDF in Storage: kb/tenant-demo/norme/');
  console.log('2. Esegui: node scripts/ingest-kb-new.js');
}

// Esegui
clearKB().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('💥 Errore:', err);
  process.exit(1);
});
