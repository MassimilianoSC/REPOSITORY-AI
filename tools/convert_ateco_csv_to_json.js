#!/usr/bin/env node
/**
 * Converte ateco_risk_mapping.csv in JSON per il backend
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'ateco_risk_mapping.csv');
const JSON_PATH = path.join(__dirname, 'ateco_risk_mapping.json');

console.log('📊 Conversione CSV → JSON...');

try {
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csv.trim().split('\n').slice(1); // Skip header
  
  const data = lines
    .filter(l => l.trim())
    .map(line => {
      // Parse CSV line (gestisce descrizioni con virgole)
      const match = line.match(/^([^,]+),([^,]+),(.*)$/);
      if (!match) {
        console.warn('⚠️  Riga malformata:', line.substring(0, 50));
        return null;
      }
      
      const [, code, risk, desc] = match;
      
      return {
        ateco_code: code.trim(),
        risk_level: risk.trim(),
        description: desc.replace(/^"|"$/g, '').trim()
      };
    })
    .filter(Boolean);
  
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  
  console.log(`✅ Convertito: ${data.length} mappings`);
  console.log(`📄 Output: ${JSON_PATH}`);
  
  // Stats
  const stats = data.reduce((acc, item) => {
    acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n📈 Distribuzione rischi:');
  Object.entries(stats).sort().forEach(([risk, count]) => {
    console.log(`   ${risk}: ${count}`);
  });
  
} catch (error) {
  console.error('❌ Errore:', error.message);
  process.exit(1);
}

