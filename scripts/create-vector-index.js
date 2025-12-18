/**
 * Script per creare indice vettoriale su Firestore
 * Usa Firebase Admin SDK
 */

const admin = require('firebase-admin');

// Inizializza con Application Default Credentials
admin.initializeApp({
  projectId: 'repository-ai-477311'
});

const db = admin.firestore();

async function createVectorIndex() {
  console.log('🔨 Creazione indice vettoriale per kb_chunks.vector...');
  
  // Firestore crea automaticamente l'indice vector quando fai la prima query
  // Eseguiamo una query di test per triggerare la creazione
  
  try {
    const testVector = Array(768).fill(0); // Vector dummy
    
    const query = db.collection('tenants/tenant-demo/kb_chunks')
      .where('tenantId', '==', 'tenant-demo')
      .findNearest({
        vectorField: 'vector',
        queryVector: testVector,
        limit: 1,
        distanceMeasure: 'COSINE'
      });
    
    console.log('📊 Esecuzione query di test per creare indice...');
    await query.get();
    
    console.log('✅ Indice vettoriale creato/verificato con successo!');
    console.log('⏳ Potrebbe richiedere 5-10 minuti per completare la costruzione su tutti i documenti.');
    console.log('📍 Controlla lo stato su: https://console.firebase.google.com/project/repository-ai-477311/firestore/indexes');
    
  } catch (error) {
    if (error.message.includes('index') || error.message.includes('requires an index')) {
      console.log('📝 L\'errore conferma che l\'indice è necessario.');
      console.log('🔗 Firestore dovrebbe fornirti un link per crearlo automaticamente.');
      console.log('⚠️  OPPURE usa questo comando manuale:');
      console.log('');
      console.log('gcloud firestore indexes composite create \\');
      console.log('  --project=repository-ai-477311 \\');
      console.log('  --collection-group=kb_chunks \\');
      console.log('  --query-scope=COLLECTION \\');
      console.log('  --field-config field-path=tenantId,order=ascending \\');
      console.log('  --field-config field-path=vector,vector-config=\'{"dimension":768,"flat":{}}\'');
    } else {
      console.error('❌ Errore:', error.message);
    }
  }
  
  process.exit(0);
}

createVectorIndex();

