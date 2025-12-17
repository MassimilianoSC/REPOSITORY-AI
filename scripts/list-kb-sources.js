/**
 * Script per listare i documenti sorgente nella Knowledge Base
 * Mostra quali file sono stati vettorializzati
 * 
 * Uso: node scripts/list-kb-sources.js
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin (usa le credenziali di default)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'repository-ai-477311'
  });
}

const db = admin.firestore();
const TENANT_ID = 'tenant-demo';

async function listKBSources() {
  console.log('📚 Analisi Knowledge Base');
  console.log('='.repeat(60));
  console.log(`📍 Tenant: ${TENANT_ID}`);
  console.log(`📍 Collection: tenants/${TENANT_ID}/kb_chunks\n`);

  try {
    const chunksRef = db.collection(`tenants/${TENANT_ID}/kb_chunks`);
    const snapshot = await chunksRef.get();

    if (snapshot.empty) {
      console.log('❌ Nessun chunk trovato nella KB');
      return;
    }

    console.log(`✅ Totale chunks: ${snapshot.size}\n`);

    // Raggruppa per source
    const sourceMap = new Map();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const source = data.source || 'UNKNOWN';
      const page = data.page || 0;
      
      if (!sourceMap.has(source)) {
        sourceMap.set(source, {
          chunks: 0,
          pages: new Set(),
          sampleText: data.text?.substring(0, 100) || '',
          createdAt: data.createdAt
        });
      }
      
      const info = sourceMap.get(source);
      info.chunks++;
      if (page) info.pages.add(page);
    });

    // Stampa risultati
    console.log('📄 DOCUMENTI SORGENTE:');
    console.log('-'.repeat(60));
    
    let index = 1;
    for (const [source, info] of sourceMap.entries()) {
      console.log(`\n${index}. ${source}`);
      console.log(`   Chunks: ${info.chunks}`);
      console.log(`   Pagine: ${info.pages.size > 0 ? [...info.pages].sort((a,b) => a-b).join(', ') : 'N/A'}`);
      console.log(`   Preview: "${info.sampleText}..."`);
      index++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 RIEPILOGO:`);
    console.log(`   Documenti sorgente: ${sourceMap.size}`);
    console.log(`   Chunks totali: ${snapshot.size}`);
    console.log(`   Media chunks/doc: ${Math.round(snapshot.size / sourceMap.size)}`);

  } catch (error) {
    console.error('❌ Errore:', error.message);
    
    if (error.code === 'app/no-app') {
      console.log('\n💡 Suggerimento: Assicurati di essere autenticato con Firebase');
      console.log('   Esegui: firebase login');
    }
  }
}

// Esegui
listKBSources().then(() => {
  console.log('\n✅ Analisi completata');
  process.exit(0);
}).catch(err => {
  console.error('💥 Errore fatale:', err);
  process.exit(1);
});
