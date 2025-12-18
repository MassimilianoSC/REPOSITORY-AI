/**
 * Script per analizzare il CONTENUTO della Knowledge Base
 * Mostra campioni di testo per capire quali documenti sono stati vettorializzati
 * 
 * Uso: node scripts/analyze-kb-content.js
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'repository-ai-477311'
  });
}

const db = admin.firestore();
const TENANT_ID = 'tenant-demo';

async function analyzeKBContent() {
  console.log('🔍 Analisi Contenuto Knowledge Base');
  console.log('='.repeat(70));
  console.log(`📍 Collection: tenants/${TENANT_ID}/kb_chunks\n`);

  try {
    const chunksRef = db.collection(`tenants/${TENANT_ID}/kb_chunks`);
    const snapshot = await chunksRef.orderBy('page').limit(100).get();

    if (snapshot.empty) {
      console.log('❌ Nessun chunk trovato');
      return;
    }

    // Raggruppa chunks per pagina e mostra campioni
    const pageMap = new Map();
    const allTexts = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const page = data.page || 0;
      const text = data.text || '';
      
      allTexts.push(text);
      
      if (!pageMap.has(page)) {
        pageMap.set(page, []);
      }
      pageMap.get(page).push({
        id: doc.id,
        text: text,
        source: data.source,
        createdAt: data.createdAt
      });
    });

    // Mostra campioni per le prime 5 pagine
    console.log('📄 CAMPIONI PER PAGINA (prime 5 pagine):');
    console.log('-'.repeat(70));
    
    const sortedPages = [...pageMap.keys()].sort((a, b) => a - b).slice(0, 5);
    
    for (const page of sortedPages) {
      const chunks = pageMap.get(page);
      console.log(`\n📖 PAGINA ${page} (${chunks.length} chunks):`);
      
      // Mostra primo chunk della pagina (più lungo)
      const sample = chunks[0].text.substring(0, 500);
      console.log(`   "${sample}..."\n`);
    }

    // Analisi keywords per identificare il documento
    console.log('\n' + '='.repeat(70));
    console.log('🔎 ANALISI KEYWORDS (per identificare il documento):');
    console.log('-'.repeat(70));
    
    const fullText = allTexts.join(' ').toLowerCase();
    
    const keywords = {
      'D.Lgs. 81/2008 (TUS)': ['81/2008', 'testo unico', 'sicurezza sul lavoro', 'datore di lavoro', 'rspp', 'rls'],
      'Accordo Stato-Regioni': ['stato-regioni', 'accordo', 'formazione lavoratori', 'preposto', 'dirigente'],
      'DURC': ['durc', 'regolarità contributiva', 'inps', 'inail'],
      'Antincendio DM 2021': ['antincendio', 'dm 2021', 'estintori', 'evacuazione'],
      'Codice Appalti': ['50/2016', 'appalti', 'stazione appaltante'],
      'ATECO / Rischio': ['ateco', 'classe di rischio', 'basso rischio', 'medio rischio', 'alto rischio'],
      'DVR': ['valutazione dei rischi', 'dvr', 'documento di valutazione'],
      'POS': ['piano operativo', 'pos', 'cantiere'],
      'Formazione': ['formazione', 'attestato', 'ore di formazione', 'aggiornamento']
    };

    console.log('\nKeywords trovate:\n');
    
    for (const [docType, words] of Object.entries(keywords)) {
      const found = words.filter(w => fullText.includes(w.toLowerCase()));
      if (found.length > 0) {
        console.log(`✅ ${docType}`);
        console.log(`   Keywords: ${found.join(', ')}`);
      }
    }

    // Statistiche finali
    console.log('\n' + '='.repeat(70));
    console.log('📊 STATISTICHE:');
    console.log(`   Chunks analizzati: ${snapshot.size}`);
    console.log(`   Pagine uniche: ${pageMap.size}`);
    console.log(`   Caratteri totali: ${fullText.length.toLocaleString()}`);

    // Cerca riferimenti normativi specifici
    console.log('\n📜 RIFERIMENTI NORMATIVI TROVATI:');
    
    const normativePatterns = [
      /d\.?lgs\.?\s*\d+\/\d{4}/gi,
      /d\.?m\.?\s*\d+[\/\-]\d+[\/\-]\d{4}/gi,
      /art\.?\s*\d+/gi,
      /accordo stato.?regioni/gi,
      /legge\s*\d+\/\d{4}/gi
    ];

    const foundRefs = new Set();
    for (const pattern of normativePatterns) {
      const matches = fullText.match(pattern) || [];
      matches.forEach(m => foundRefs.add(m.toLowerCase()));
    }

    if (foundRefs.size > 0) {
      [...foundRefs].slice(0, 20).forEach(ref => console.log(`   - ${ref}`));
      if (foundRefs.size > 20) {
        console.log(`   ... e altri ${foundRefs.size - 20} riferimenti`);
      }
    }

  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
}

// Esegui
analyzeKBContent().then(() => {
  console.log('\n✅ Analisi completata');
  process.exit(0);
}).catch(err => {
  console.error('💥 Errore:', err);
  process.exit(1);
});
