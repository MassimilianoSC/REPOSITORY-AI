/**
 * Script per popolare la KB con documenti normativi
 * Carica i file locali in Storage e poi li ingerisce
 * 
 * Uso: node scripts/ingest-kb-new.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Inizializza Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'repository-ai-477311',
    storageBucket: 'repository-ai-477311.firebasestorage.app'
  });
}

const bucket = admin.storage().bucket();
const TENANT_ID = 'tenant-demo';
const PROJECT_ID = 'repository-ai-477311';
const REGION = 'europe-west1';

// Documenti da ingerire con metadata
const DOCUMENTS = [
  // === Documenti TXT (già pronti) ===
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/nuovi_documenti/DECRETO LEGISLATIVO 9 aprile 2008 , n. 81.txt',
    storageName: 'DLgs_81_2008_TUS.txt',
    source: 'D.Lgs. 81/2008 - Testo Unico Sicurezza',
    description: 'Testo Unico sulla Sicurezza sul Lavoro'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/nuovi_documenti/MINISTERO DELL\'INTERNO_DECRETO 2 settembre 2021 .txt',
    storageName: 'DM_02_09_2021_Antincendio.txt',
    source: 'DM 02/09/2021 - Criteri Antincendio',
    description: 'Decreto Ministero Interno - Antincendio'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/nuovi_documenti/Criteri generali di progettazione, realizzazione ed esercizio della sicurezza antincendio per luoghi di lavor.txt',
    storageName: 'Criteri_Antincendio_Luoghi_Lavoro.txt',
    source: 'Criteri Generali Antincendio - Luoghi di Lavoro',
    description: 'Criteri progettazione sicurezza antincendio'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/nuovi_documenti/Semplificazione in materia di documento unico di regolarita\' contributiva (DURC). (15A04239) (GU Serie Genera.txt',
    storageName: 'Semplificazione_DURC_2015.txt',
    source: 'GU 2015 - Semplificazione DURC',
    description: 'Normativa semplificazione DURC'
  },
  
  // === Documenti PDF ===
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/Accordo_Stato_Regioni_21-12-2011_formazione_lavoratori_preposti_dirigenti.pdf',
    storageName: 'ASR_2011_Formazione.pdf',
    source: 'Accordo Stato-Regioni 21/12/2011 - Formazione',
    description: 'Formazione lavoratori, preposti, dirigenti'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/Decreto-1-settembre-2021.pdf',
    storageName: 'DM_01_09_2021_Antincendio.pdf',
    source: 'DM 01/09/2021 - Antincendio',
    description: 'Decreto antincendio settembre 2021'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/DM_16_01_97.pdf',
    storageName: 'DM_16_01_1997.pdf',
    source: 'DM 16/01/1997 - Contenuti Minimi Formazione',
    description: 'Contenuti minimi corsi formazione'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/classificazione-ateco-rischi.pdf',
    storageName: 'Classificazione_ATECO_Rischi.pdf',
    source: 'Classificazione ATECO - Classi di Rischio',
    description: 'Tabella ATECO e classi di rischio'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/Nuovo ASR n°59 del 17042025 G.U. N°119 24052025.pdf',
    storageName: 'ASR_2025_n59_Nuovo.pdf',
    source: 'Accordo Stato-Regioni 2025 N.59',
    description: 'Nuovo ASR 2025 - Preposti 12 ore'
  },
  {
    localPath: '../documenti utili per l\'individuazione dell\'idoneità di un documento/nuovi_documenti/2015_19_Circ_MLPS.pdf',
    storageName: 'Circolare_MLPS_2015_19.pdf',
    source: 'Circolare MLPS 2015/19',
    description: 'Circolare Ministero Lavoro'
  }
];

/**
 * Carica file in Firebase Storage
 */
async function uploadToStorage(localPath, storagePath) {
  const absolutePath = path.resolve(__dirname, localPath);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File non trovato: ${absolutePath}`);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const file = bucket.file(storagePath);
  
  await file.save(fileBuffer, {
    metadata: {
      contentType: localPath.endsWith('.pdf') ? 'application/pdf' : 'text/plain'
    }
  });

  return storagePath;
}

/**
 * Chiama la Cloud Function per ingestire il documento
 */
async function ingestDocument(storagePath, source) {
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/kbIngestFromStorage?tid=${TENANT_ID}&storagePath=${encodeURIComponent(storagePath)}&source=${encodeURIComponent(source)}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Processa tutti i documenti
 */
async function main() {
  console.log('📚 INGESTION KNOWLEDGE BASE');
  console.log('='.repeat(70));
  console.log(`📍 Tenant: ${TENANT_ID}`);
  console.log(`📍 Storage: kb/${TENANT_ID}/norme/`);
  console.log(`📍 Documenti: ${DOCUMENTS.length}\n`);

  const results = { success: [], failed: [] };

  for (const doc of DOCUMENTS) {
    console.log(`\n📄 ${doc.storageName}`);
    console.log(`   Source: ${doc.source}`);
    
    try {
      // 1. Upload in Storage
      const storagePath = `kb/${TENANT_ID}/norme/${doc.storageName}`;
      console.log(`   📤 Upload in Storage...`);
      await uploadToStorage(doc.localPath, storagePath);
      console.log(`   ✅ Caricato: ${storagePath}`);

      // 2. Ingest via Cloud Function
      console.log(`   🔄 Ingestion...`);
      const result = await ingestDocument(storagePath, doc.source);
      console.log(`   ✅ ${result}`);
      
      results.success.push(doc.storageName);
      
      // Pausa tra le chiamate
      await new Promise(r => setTimeout(r, 3000));
      
    } catch (error) {
      console.log(`   ❌ Errore: ${error.message}`);
      results.failed.push({ name: doc.storageName, error: error.message });
    }
  }

  // Riepilogo
  console.log('\n' + '='.repeat(70));
  console.log('📊 RIEPILOGO:');
  console.log(`   ✅ Successi: ${results.success.length}`);
  console.log(`   ❌ Falliti: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Documenti falliti:');
    results.failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
  }

  console.log('\n📋 PROSSIMI PASSI:');
  console.log('1. Verifica Firestore: tenants/tenant-demo/kb_chunks');
  console.log('2. Test: node scripts/list-kb-sources.js');
}

// Esegui
main().then(() => {
  console.log('\n✅ Completato!');
  process.exit(0);
}).catch(err => {
  console.error('💥 Errore fatale:', err);
  process.exit(1);
});
