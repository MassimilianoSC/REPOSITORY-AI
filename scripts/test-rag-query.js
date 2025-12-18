/**
 * Script per testare la query RAG dopo aver popolato la KB
 * 
 * Uso:
 * node scripts/test-rag-query.js
 */

const https = require('https');

const PROJECT_ID = 'repository-ai-477311';
const REGION = 'europe-west1';
const TENANT_ID = 'tenant-demo';

// Query di test per verificare il RAG
const testQueries = [
  {
    docType: 'DURC',
    query: 'Qual è la validità del DURC? Quanti giorni?',
    expectedKeywords: ['120', 'giorni', 'D.Lgs', '50/2016']
  },
  {
    docType: 'ATTESTATO_PREPOSTO',
    query: 'Quante ore di formazione servono per il preposto?',
    expectedKeywords: ['12', 'ore', 'Accordo', 'Stato-Regioni']
  },
  {
    docType: 'REGISTRO_ANTINCENDIO',
    query: 'Quali controlli vanno registrati nel registro antincendio?',
    expectedKeywords: ['estintori', 'idranti', 'DM']
  }
];

/**
 * Testa una query RAG chiamando kbSearch
 */
async function testQuery(test) {
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/kbSearch?tid=${TENANT_ID}&docType=${test.docType}&query=${encodeURIComponent(test.query)}&topK=6&minScore=0.25`;

  console.log(`\n🔍 Query: "${test.query}"`);
  console.log(`   DocType: ${test.docType}`);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            const chunks = result.chunks || result.matches || [];
            
            console.log(`   ✅ Chunks trovati: ${chunks.length}`);
            
            if (chunks.length > 0) {
              console.log(`   📄 Top 3 risultati:`);
              chunks.slice(0, 3).forEach((chunk, i) => {
                console.log(`      ${i + 1}. ${chunk.source || 'N/A'} (pagina ${chunk.page || '?'}) - Score: ${(chunk.score || 0).toFixed(3)}`);
                console.log(`         "${(chunk.snippet || chunk.text || '').substring(0, 100)}..."`);
              });

              // Verifica keywords attese
              const allText = chunks.map(c => c.snippet || c.text || '').join(' ').toLowerCase();
              const foundKeywords = test.expectedKeywords.filter(k => allText.includes(k.toLowerCase()));
              
              if (foundKeywords.length > 0) {
                console.log(`   ✅ Keywords trovate: ${foundKeywords.join(', ')}`);
              } else {
                console.log(`   ⚠️  Nessuna keyword attesa trovata (cerca: ${test.expectedKeywords.join(', ')})`);
              }
            } else {
              console.log(`   ⚠️  Nessun chunk trovato! KB potrebbe essere vuota o minScore troppo alto.`);
            }

            resolve({ docType: test.docType, chunksFound: chunks.length, success: true });
          } catch (err) {
            console.error(`   ❌ Parse error: ${err.message}`);
            resolve({ docType: test.docType, success: false, error: err.message });
          }
        } else {
          console.error(`   ❌ Error ${res.statusCode}: ${data}`);
          resolve({ docType: test.docType, success: false, error: data });
        }
      });
    }).on('error', (err) => {
      console.error(`   ❌ Network error: ${err.message}`);
      resolve({ docType: test.docType, success: false, error: err.message });
    });
  });
}

/**
 * Esegui tutti i test
 */
async function runTests() {
  console.log('🧪 Testing RAG queries...');
  console.log(`📍 Project: ${PROJECT_ID}`);
  console.log(`📍 Region: ${REGION}`);
  console.log(`📍 Tenant: ${TENANT_ID}`);
  console.log(`📍 Test queries: ${testQueries.length}\n`);

  const results = [];

  for (const test of testQueries) {
    const result = await testQuery(test);
    results.push(result);
    
    // Pausa tra le query
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Riepilogo
  console.log('\n\n📊 RIEPILOGO TEST RAG:');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success && r.chunksFound > 0).length;
  const noChunks = results.filter(r => r.success && r.chunksFound === 0).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Query con risultati: ${successful}`);
  console.log(`⚠️  Query senza risultati: ${noChunks}`);
  console.log(`❌ Query fallite: ${failed}`);

  if (successful === testQueries.length) {
    console.log('\n🎉 RAG FUNZIONA PERFETTAMENTE!');
  } else if (noChunks > 0) {
    console.log('\n⚠️  RAG configurato ma KB potrebbe essere incompleta o minScore troppo alto.');
    console.log('   Suggerimento: prova a ridurre minScore a 0.20 o popola meglio la KB.');
  } else {
    console.log('\n❌ RAG non funziona correttamente. Verifica:');
    console.log('   1. KB popolata? (Firestore kb_chunks)');
    console.log('   2. Vector index Ready?');
    console.log('   3. Funzione kbSearch deployata?');
  }
}

// Esegui
runTests().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

