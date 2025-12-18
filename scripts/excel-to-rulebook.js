/**
 * Script per convertire Excel "Cosa controllare e riferimenti normativi.xlsx"
 * in Rulebook JSON v1 secondo schema del developer
 * 
 * Usage: node scripts/excel-to-rulebook.js
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Percorso Excel (modifica se necessario)
const EXCEL_PATH = path.join(__dirname, '..', 'Cosa controllare e riferimenti normativi.xlsx');
const OUTPUT_JSON = path.join(__dirname, '..', 'functions', 'src', 'rulebook', 'rulebook-v1.json');

// Mapping tipi documento da Excel a codice tecnico
const DOC_TYPE_MAPPING = {
  'DURC': { code: 'DURC', name: 'Documento Unico di Regolarità Contributiva', requiredForAll: true },
  'POS': { code: 'POS', name: 'Piano Operativo di Sicurezza', requiredForAll: false },
  'Attestato Preposto': { code: 'ATTESTATO_PREPOSTO', name: 'Attestato Formazione Preposto', requiredForAll: true },
  'Attestato Lavoratore': { code: 'ATTESTATO_LAVORATORE', name: 'Attestato Formazione Lavoratore', requiredForAll: true },
  'Attestato Datore di Lavoro': { code: 'ATTESTATO_DATORE_LAVORO', name: 'Attestato Formazione Datore di Lavoro', requiredForAll: true },
  'DVR': { code: 'DVR', name: 'Documento Valutazione Rischi', requiredForAll: true },
  'Registro Antincendio': { code: 'REGISTRO_ANTINCENDIO', name: 'Registro Controlli Antincendio', requiredForAll: false },
  'Visura Camerale': { code: 'VISURA', name: 'Visura Camerale', requiredForAll: true },
};

function sanitizeString(str) {
  if (!str) return '';
  return String(str).trim().replace(/\s+/g, ' ');
}

function parseDeroghe(derogheTxt) {
  if (!derogheTxt || derogheTxt === '-' || derogheTxt === 'N/A') return [];
  
  const deroghe = [];
  // Se contiene "8h" e "transitorio" → deroga preposti
  if (derogheTxt.toLowerCase().includes('8h') || derogheTxt.toLowerCase().includes('transitorio')) {
    deroghe.push({
      condition: sanitizeString(derogheTxt),
      validUntil: '2025-12-31',
      notes: 'Regime transitorio'
    });
  } else {
    deroghe.push({
      condition: sanitizeString(derogheTxt),
      validUntil: null,
      notes: ''
    });
  }
  
  return deroghe;
}

function parseNormativeReferences(refTxt) {
  if (!refTxt || refTxt === '-' || refTxt === 'N/A') return [];
  
  // Split per virgola o punto e virgola
  const refs = refTxt.split(/[;,]/).map(r => sanitizeString(r)).filter(r => r);
  return refs;
}

function generateCheckId(docType, index) {
  const base = docType.toLowerCase();
  return `${base}_check_${index + 1}`;
}

function determineEvaluation(description, docType) {
  const lowerDesc = description.toLowerCase();
  
  // Regole deterministiche note
  if (docType === 'DURC' && lowerDesc.includes('120')) return 'deterministic';
  if (lowerDesc.includes('scadenza') && lowerDesc.includes('giorni')) return 'deterministic';
  
  // Altrimenti LLM
  return 'llm';
}

function determineField(description) {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes('data') || lowerDesc.includes('emissione')) return 'issuedAt';
  if (lowerDesc.includes('scadenza') || lowerDesc.includes('validità')) return 'expiresAt';
  if (lowerDesc.includes('ore') || lowerDesc.includes('durata')) return 'hours';
  if (lowerDesc.includes('intestat') || lowerDesc.includes('nominativo')) return 'holder';
  if (lowerDesc.includes('firma')) return 'signature';
  if (lowerDesc.includes('protocollo') || lowerDesc.includes('numero')) return 'protocolNumber';
  
  return 'generic';
}

function parseExcel() {
  console.log('📖 Leggo Excel:', EXCEL_PATH);
  
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('❌ File Excel non trovato:', EXCEL_PATH);
    console.log('💡 Assicurati che il file "Cosa controllare e riferimenti normativi.xlsx" sia nella root del progetto');
    process.exit(1);
  }
  
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converti in JSON (assumo header row)
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  console.log(`✅ Letto ${rows.length} righe dall'Excel`);
  
  // Header row (assumo sia la prima)
  // Colonne attese: Tipo Documento | Cosa controllare | Riferimenti | Deroghe | Note
  const header = rows[0];
  console.log('📋 Header:', header);
  
  const documents = {};
  
  // Processa ogni riga (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue; // Skip righe vuote
    
    const tipoDocRaw = sanitizeString(row[0]);
    const cosaControllare = sanitizeString(row[1]);
    const riferimenti = sanitizeString(row[2]);
    const deroghe = sanitizeString(row[3]);
    const note = sanitizeString(row[4]);
    
    if (!tipoDocRaw || !cosaControllare) continue; // Skip se mancano dati essenziali
    
    // Trova mapping
    let docMapping = null;
    for (const [key, val] of Object.entries(DOC_TYPE_MAPPING)) {
      if (tipoDocRaw.toLowerCase().includes(key.toLowerCase())) {
        docMapping = val;
        break;
      }
    }
    
    if (!docMapping) {
      console.warn(`⚠️  Tipo documento non riconosciuto: "${tipoDocRaw}" (riga ${i + 1})`);
      continue;
    }
    
    const docType = docMapping.code;
    
    // Inizializza documento se non esiste
    if (!documents[docType]) {
      documents[docType] = {
        docType,
        displayName: docMapping.name,
        requiredForAll: docMapping.requiredForAll,
        riskClass: ['basso', 'medio', 'alto'], // Default: tutti
        checks: [],
        notes: ''
      };
    }
    
    // Aggiungi check
    const checkIndex = documents[docType].checks.length;
    const check = {
      id: generateCheckId(docType, checkIndex),
      description: cosaControllare,
      evaluation: determineEvaluation(cosaControllare, docType),
      field: determineField(cosaControllare),
      normativeReferences: parseNormativeReferences(riferimenti),
      deroghe: parseDeroghe(deroghe),
      notes: note || ''
    };
    
    documents[docType].checks.push(check);
    
    // Aggiungi note generali se presenti
    if (note && !documents[docType].notes) {
      documents[docType].notes = note;
    }
  }
  
  // Converti in array
  const documentsArray = Object.values(documents);
  
  console.log(`✅ Generati ${documentsArray.length} tipi di documento con ${documentsArray.reduce((sum, d) => sum + d.checks.length, 0)} checks totali`);
  
  return documentsArray;
}

function buildRulebook(documents) {
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  return {
    schemaVersion: '1.0',
    lastUpdated: now,
    metadata: {
      source: 'Cosa controllare e riferimenti normativi.xlsx',
      parsedAt: new Date().toISOString(),
      generatedBy: 'excel-to-rulebook.js',
      description: 'Rulebook v1 generato automaticamente dall\'Excel del committente. Definisce per ogni tipo documento: controlli richiesti, riferimenti normativi, deroghe.'
    },
    documents
  };
}

function saveRulebook(rulebook) {
  // Crea directory se non esiste
  const dir = path.dirname(OUTPUT_JSON);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Salva JSON (pretty print)
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(rulebook, null, 2), 'utf8');
  
  console.log('✅ Rulebook salvato in:', OUTPUT_JSON);
  console.log('📊 Statistiche:');
  console.log(`   - Documenti: ${rulebook.documents.length}`);
  console.log(`   - Checks totali: ${rulebook.documents.reduce((sum, d) => sum + d.checks.length, 0)}`);
  console.log(`   - Ultima modifica: ${rulebook.lastUpdated}`);
}

// Main
try {
  console.log('🚀 Avvio conversione Excel → Rulebook JSON v1\n');
  
  const documents = parseExcel();
  const rulebook = buildRulebook(documents);
  saveRulebook(rulebook);
  
  console.log('\n✅ CONVERSIONE COMPLETATA!');
  console.log('📝 Prossimi step:');
  console.log('   1. Verifica manualmente il JSON generato');
  console.log('   2. Carica in Firestore: rulebooks/v1');
  console.log('   3. Commit nel repo per versioning Git');
  
} catch (error) {
  console.error('❌ Errore durante la conversione:', error);
  process.exit(1);
}

