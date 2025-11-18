#!/usr/bin/env node
/**
 * Script completo per popolare la Knowledge Base RAG
 * 
 * COSA FA:
 * 1. Copia e rinomina i file dalla cartella documenti
 * 2. Carica tutti i file in Firebase Storage (kb/tenant-demo/norme/)
 * 3. Esegue l'ingest automatico per vettorializzare
 * 
 * PREREQUISITI:
 * - Node.js installato
 * - Firebase Admin SDK configurato
 * - File nella cartella "documenti utili per l'individuazione dell'idoneità di un documento"
 * 
 * USO:
 *   node scripts/setup-kb-complete.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// ============================================================================
// CONFIGURAZIONE
// ============================================================================

const TENANT_ID = 'tenant-demo';
const SOURCE_DIR = path.join(__dirname, '..', 'documenti utili per l\'individuazione dell\'idoneità di un documento');
const TEMP_DIR = path.join(__dirname, '..', 'temp-kb-upload');

// Mappa: file originale → nome standardizzato
const FILE_MAPPING = {
  // ========== FILE PDF GIÀ PRONTI ==========
  'Accordo_Stato_Regioni_21-12-2011_formazione_lavoratori_preposti_dirigenti.pdf': {
    newName: 'ASR_2011_formazione.pdf',
    category: 'formazione',
    description: 'Accordo Stato-Regioni 2011 - Formazione lavoratori, preposti, dirigenti'
  },
  'Nuovo ASR n°59 del 17042025 G.U. N°119 24052025.pdf': {
    newName: 'ASR_2025_n59_preposti.pdf',
    category: 'formazione',
    description: 'Accordo Stato-Regioni 2025 n.59 - Aggiornamento formazione preposti'
  },
  'DM_16_01_97.pdf': {
    newName: 'DM_1997_01_16_antincendio.pdf',
    category: 'antincendio',
    description: 'Decreto Ministeriale 16/01/1997 - Formazione antincendio'
  },
  'Decreto-1-settembre-2021.pdf': {
    newName: 'DM_2021_09_01_controlli_antincendio.pdf',
    category: 'antincendio',
    description: 'Decreto 1 settembre 2021 - Controlli e manutenzione antincendio'
  },
  'classificazione-ateco-rischi.pdf': {
    newName: 'ATECO_classi_rischio.pdf',
    category: 'classificazione',
    description: 'Classificazione ATECO e classi di rischio'
  },
  '06_Agg. Generale e Specifica_Borruto.pdf': {
    newName: 'POLICY_interna_Borruto.pdf',
    category: 'policy',
    description: 'Policy interna - Aggiornamento formazione (Borruto)'
  },
  
  // ========== FILE TXT DA CONVERTIRE (nuovi_documenti/) ==========
  'nuovi_documenti/DECRETO LEGISLATIVO 9 aprile 2008 , n. 81.txt': {
    newName: 'DLGS_81_2008_testo_unico_sicurezza.txt',
    category: 'sicurezza',
    description: 'D.Lgs. 81/2008 - Testo Unico sulla Sicurezza sul Lavoro'
  },
  'nuovi_documenti/Semplificazione in materia di documento unico di regolarita\' contributiva (DURC). (15A04239) (GU Serie Genera.txt': {
    newName: 'DM_2015_01_30_DURC_online.txt',
    category: 'durc',
    description: 'D.M. 30 gennaio 2015 - DURC online e validità 120 giorni'
  },
  'nuovi_documenti/MINISTERO DELL\'INTERNO_DECRETO 2 settembre 2021 .txt': {
    newName: 'DM_2021_09_02_GSA_antincendio.txt',
    category: 'antincendio',
    description: 'D.M. 2 settembre 2021 - Gestione Sicurezza Antincendio (GSA)'
  },
  'nuovi_documenti/Criteri generali di progettazione, realizzazione ed esercizio della sicurezza antincendio per luoghi di lavor.txt': {
    newName: 'DM_2021_09_03_minicodice_antincendio.txt',
    category: 'antincendio',
    description: 'D.M. 3 settembre 2021 - Minicodice prevenzione incendi'
  }
};

// ============================================================================
// INIZIALIZZAZIONE FIREBASE
// ============================================================================

if (!admin.apps.length) {
  admin.initializeApp();
}

const storage = admin.storage();
const bucket = storage.bucket();
const db = admin.firestore();

// ============================================================================
// FUNZIONI HELPER
// ============================================================================

/**
 * Crea directory temporanea per i file rinominati
 */
async function setupTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`✅ Creata cartella temporanea: ${TEMP_DIR}`);
  }
}

/**
 * Copia e rinomina un file
 */
async function copyAndRename(sourceRelPath, targetName) {
  const sourcePath = path.join(SOURCE_DIR, sourceRelPath);
  const targetPath = path.join(TEMP_DIR, targetName);
  
  if (!fs.existsSync(sourcePath)) {
    console.warn(`⚠️  File non trovato: ${sourcePath}`);
    return false;
  }
  
  const content = await readFile(sourcePath);
  await writeFile(targetPath, content);
  console.log(`✅ Copiato: ${sourceRelPath} → ${targetName}`);
  return true;
}

/**
 * Carica un file in Firebase Storage
 */
async function uploadToStorage(localFilePath, storagePath) {
  const fileBuffer = await readFile(localFilePath);
  const ext = path.extname(localFilePath).toLowerCase();
  const contentType = ext === '.pdf' ? 'application/pdf' : 'text/plain';
  
  const file = bucket.file(storagePath);
  await file.save(fileBuffer, {
    metadata: {
      contentType,
      metadata: {
        uploadedAt: new Date().toISOString(),
        source: 'kb-setup-script'
      }
    }
  });
  
  console.log(`📤 Caricato in Storage: ${storagePath}`);
  return storagePath;
}

/**
 * Esegue l'ingest di un documento (chiama la Cloud Function HTTP)
 */
async function ingestDocument(storagePath, metadata) {
  const https = require('https');
  const { getAuth } = require('firebase-admin/auth');
  
  // Ottieni il project ID
  const projectId = admin.instanceId().app.options.projectId || process.env.GCLOUD_PROJECT;
  const region = 'europe-west1';
  
  // Build query string (la function usa GET params)
  const params = new URLSearchParams({
    tid: TENANT_ID,
    storagePath: storagePath,
    source: metadata.description || storagePath
  });
  
  const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/kbIngestFromStorage?${params.toString()}`;
  
  return new Promise((resolve, reject) => {
    const req = https.get(functionUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          // Parse response to extract chunk count
          const match = data.match(/Ingested (\d+) chunks/);
          const chunks = match ? parseInt(match[1], 10) : 0;
          console.log(`✅ Ingest completato: ${chunks} chunks creati`);
          resolve({ success: true, chunks });
        } else {
          console.error(`❌ Ingest fallito (HTTP ${res.statusCode}): ${data}`);
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`❌ Errore chiamata HTTP: ${err.message}`);
      reject(err);
    });
    
    req.end();
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 AVVIO SETUP KNOWLEDGE BASE RAG\n');
  console.log(`📁 Directory sorgente: ${SOURCE_DIR}`);
  console.log(`🎯 Tenant ID: ${TENANT_ID}\n`);
  
  try {
    // STEP 1: Prepara directory temporanea
    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 1: Preparazione cartella temporanea');
    console.log('═══════════════════════════════════════════════════════');
    await setupTempDir();
    console.log('');
    
    // STEP 2: Copia e rinomina tutti i file
    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 2: Copia e rinominazione file');
    console.log('═══════════════════════════════════════════════════════');
    
    const processedFiles = [];
    
    for (const [originalPath, metadata] of Object.entries(FILE_MAPPING)) {
      const success = await copyAndRename(originalPath, metadata.newName);
      if (success) {
        processedFiles.push({
          localPath: path.join(TEMP_DIR, metadata.newName),
          storagePath: `kb/${TENANT_ID}/norme/${metadata.newName}`,
          metadata: { ...metadata, originalName: originalPath }
        });
      }
    }
    
    console.log(`\n✅ File preparati: ${processedFiles.length}/${Object.keys(FILE_MAPPING).length}\n`);
    
    // STEP 3: Upload in Storage
    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 3: Upload in Firebase Storage');
    console.log('═══════════════════════════════════════════════════════');
    
    const uploadedFiles = [];
    
    for (const file of processedFiles) {
      try {
        await uploadToStorage(file.localPath, file.storagePath);
        uploadedFiles.push(file);
      } catch (err) {
        console.error(`❌ Errore upload ${file.storagePath}:`, err.message);
      }
    }
    
    console.log(`\n✅ File caricati: ${uploadedFiles.length}/${processedFiles.length}\n`);
    
    // STEP 4: Ingest automatico
    console.log('═══════════════════════════════════════════════════════');
    console.log('STEP 4: Ingest documenti (vettorializzazione)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  NOTA: Questa fase può richiedere diversi minuti...\n');
    
    const ingestResults = [];
    
    for (const file of uploadedFiles) {
      try {
        const result = await ingestDocument(file.storagePath, file.metadata);
        ingestResults.push({ file: file.storagePath, success: true, chunks: result.chunks });
      } catch (err) {
        console.error(`❌ Errore ingest ${file.storagePath}:`, err.message);
        ingestResults.push({ file: file.storagePath, success: false, error: err.message });
      }
    }
    
    // STEP 5: Riepilogo finale
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('RIEPILOGO FINALE');
    console.log('═══════════════════════════════════════════════════════');
    
    const successful = ingestResults.filter(r => r.success).length;
    const failed = ingestResults.filter(r => !r.success).length;
    
    console.log(`✅ Ingest completati: ${successful}`);
    if (failed > 0) {
      console.log(`❌ Ingest falliti: ${failed}`);
      console.log('\nFile falliti:');
      ingestResults.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.file}`);
      });
    }
    
    // Verifica finale nel DB
    console.log('\n🔍 Verifica chunks nel database...');
    const chunksSnap = await db.collection('kb_chunks')
      .where('tenantId', '==', TENANT_ID)
      .limit(10)
      .get();
    
    console.log(`📊 Chunks totali trovati: ${chunksSnap.size}+ (primi 10 mostrati)`);
    
    console.log('\n🎉 SETUP COMPLETATO!');
    console.log('\n📋 PROSSIMI PASSI:');
    console.log('1. Verifica chunks in Firestore: kb_chunks collection');
    console.log('2. Testa il RAG: node scripts/test-rag-query.js');
    console.log('3. Carica un documento di test nell\'app e verifica che il RAG recuperi chunks\n');
    
  } catch (err) {
    console.error('\n❌ ERRORE FATALE:', err);
    process.exit(1);
  }
}

// Esegui
main().catch(console.error);

