#!/usr/bin/env node
/**
 * Converte ateco_risk_mapping.csv in formato JSON per Cloud Storage
 * Output: { [ateco_code]: { risk_level, description } }
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'ateco_risk_mapping.csv');
const JSON_PATH = path.join(__dirname, '../functions/src/configs/ateco/v1.json');

console.log('📊 Conversione CSV → JSON (formato Storage)...');

try {
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csv.trim().split('\n').slice(1); // Skip header
  
  const mapping = {};
  let processed = 0;
  let skipped = 0;
  
  for (const line of lines) {
    if (!line.trim()) {
      skipped++;
      continue;
    }
    
    // Parse: ateco_code,risk_level,description
    // Split only on first 2 commas (description can contain commas)
    const parts = line.split(',');
    if (parts.length < 3) {
      console.warn(`⚠️  Riga malformata (< 3 parti): ${line.substring(0, 50)}...`);
      skipped++;
      continue;
    }
    
    const cleanCode = parts[0].trim();
    const cleanRisk = parts[1].trim();
    // Description is everything after the 2nd comma
    const cleanDesc = parts.slice(2).join(',').replace(/^"|"$/g, '').replace(/ RISCHIO$/, '').trim();
    
    // Validate risk level
    if (!['basso', 'medio', 'alto'].includes(cleanRisk)) {
      console.warn(`⚠️  Livello rischio invalido per ${cleanCode}: "${cleanRisk}"`);
      skipped++;
      continue;
    }
    
    mapping[cleanCode] = {
      risk_level: cleanRisk,
      description: cleanDesc
    };
    processed++;
  }
  
  // Write JSON
  fs.writeFileSync(JSON_PATH, JSON.stringify(mapping, null, 2));
  
  console.log(`✅ Convertiti: ${processed} mappings`);
  console.log(`⚠️  Skippati: ${skipped} righe`);
  console.log(`📄 Output: ${JSON_PATH}`);
  
  // Stats
  const stats = {};
  for (const [code, entry] of Object.entries(mapping)) {
    stats[entry.risk_level] = (stats[entry.risk_level] || 0) + 1;
  }
  
  console.log('\n📈 Distribuzione rischi:');
  Object.entries(stats).sort().forEach(([risk, count]) => {
    console.log(`   ${risk}: ${count}`);
  });
  
  // Sample entries
  console.log('\n📋 Esempio entries:');
  const samples = Object.entries(mapping).slice(0, 3);
  samples.forEach(([code, entry]) => {
    console.log(`   ${code}: ${entry.risk_level} - ${entry.description.substring(0, 50)}...`);
  });
  
} catch (error) {
  console.error('❌ Errore:', error.message);
  process.exit(1);
}

