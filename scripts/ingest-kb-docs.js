/**
 * Script per popolare la Knowledge Base con documenti normativi
 * 
 * Uso:
 * 1. Carica i PDF in Storage: kb/tenant-demo/norme/
 * 2. Esegui: node scripts/ingest-kb-docs.js
 */

const https = require('https');

const PROJECT_ID = 'repository-ai-477311';
const REGION = 'europe-west1';
const TENANT_ID = 'tenant-demo';

// Lista documenti da processare
const documents = [
  {
    filename: 'DURC_DLGS50_2016.pdf',
    docType: 'DURC',
    source: 'D.Lgs. 50/2016 - DURC'
  },
  {
    filename: 'ASR_2025_n59_preposti.pdf',
    docType: 'ATTESTATO_PREPOSTO',
    source: 'Accordo Stato-Regioni 2025 N.59 - Preposti'
  },
  {
    filename: 'ASR_2011_preposti.pdf',
    docType: 'ATTESTATO_PREPOSTO',
    source: 'Accordo Stato-Regioni 2011 - Preposti'
  },
  {
    filename: 'DM_1997_01_16_antincendio.pdf',
    docType: 'REGISTRO_ANTINCENDIO',
    source: 'DM 16/01/1997 - Antincendio'
  },
  {
    filename: 'DM_2021_09_01_antincendio.pdf',
    docType: 'REGISTRO_ANTINCENDIO',
    source: 'DM 01/09/2021 - Antincendio'
  },
  {
    filename: 'DLGS81_2008_sicurezza.pdf',
    docType: 'DVR',
    source: 'D.Lgs. 81/2008 - Sicurezza sul lavoro'
  },
  {
    filename: 'ATECO_classi_rischio.pdf',
    docType: 'VISURA',
    source: 'Classificazione ATECO - Classi di rischio'
  }
];

/**
 * Chiama la funzione kbIngestFromStorage per un documento
 */
async function ingestDocument(doc) {
  const storagePath = `kb/${TENANT_ID}/norme/${doc.filename}`;
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/kbIngestFromStorage?tid=${TENANT_ID}&storagePath=${encodeURIComponent(storagePath)}&source=${encodeURIComponent(doc.source)}&docType=${doc.docType}`;

  console.log(`\n📄 Processing: ${doc.filename} (${doc.docType})`);
  console.log(`   Storage path: ${storagePath}`);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`   ✅ Success: ${data}`);
          resolve({ filename: doc.filename, success: true, message: data });
        } else {
          console.error(`   ❌ Error ${res.statusCode}: ${data}`);
          resolve({ filename: doc.filename, success: false, error: data });
        }
      });
    }).on('error', (err) => {
      console.error(`   ❌ Network error: ${err.message}`);
      resolve({ filename: doc.filename, success: false, error: err.message });
    });
  });
}

/**
 * Processa tutti i documenti sequenzialmente
 */
async function ingestAll() {
  console.log('🚀 Starting KB ingestion...');
  console.log(`📍 Project: ${PROJECT_ID}`);
  console.log(`📍 Region: ${REGION}`);
  console.log(`📍 Tenant: ${TENANT_ID}`);
  console.log(`📍 Documents to process: ${documents.length}\n`);

  const results = [];

  for (const doc of documents) {
    const result = await ingestDocument(doc);
    results.push(result);
    
    // Pausa di 2 secondi tra le chiamate per evitare rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Riepilogo finale
  console.log('\n\n📊 RIEPILOGO INGESTION:');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Successi: ${successful}`);
  console.log(`❌ Falliti: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Documenti falliti:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.filename}: ${r.error}`);
    });
  }

  console.log('\n✅ Ingestion completata!');
  console.log('\n📋 PROSSIMI PASSI:');
  console.log('1. Verifica Firestore: tenants/tenant-demo/kb_chunks (deve avere documenti)');
  console.log('2. Verifica Vector Index: deve essere "Ready"');
  console.log('3. Test RAG: carica un DURC e verifica che RAG recuperi chunks');
}

// Esegui
ingestAll().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

