/**
 * Rulebook Loader v1
 * Carica e gestisce il rulebook (regole di validazione per ogni tipo documento)
 * Fonte: rulebook-v1.json (generato da Excel committente)
 */

import rulebookV1 from '../rulebook/rulebook-v1.json';

export interface Deroga {
  condition: string;
  validUntil: string | null;
  notes: string;
}

export interface Check {
  id: string;
  description: string;
  evaluation: 'deterministic' | 'llm';
  field: string;
  normativeReferences: string[];
  requiresPII?: string[];
  deroghe: Deroga[];
  notes: string;
}

export interface DocumentRule {
  docType: string;
  displayName: string;
  requiredForAll: boolean;
  riskClass: string[];
  checks: Check[];
  notes: string;
}

export interface Rulebook {
  schemaVersion: string;
  lastUpdated: string;
  metadata?: {
    source?: string;
    description?: string;
    [key: string]: any;
  };
  documents: DocumentRule[];
}

// Singleton instance
let cachedRulebook: Rulebook | null = null;

/**
 * Carica il Rulebook (da JSON statico o Firestore se disponibile)
 */
export function loadRulebook(): Rulebook {
  if (cachedRulebook) {
    return cachedRulebook;
  }

  // Per ora carichiamo da JSON statico (futuro: Firestore con cache)
  cachedRulebook = rulebookV1 as Rulebook;
  
  console.log(`[Rulebook] Caricato v${cachedRulebook.schemaVersion} - ${cachedRulebook.documents.length} tipi documento`);
  
  return cachedRulebook;
}

/**
 * Ottiene le regole per un tipo documento specifico
 */
export function getRulesForDocType(docType: string): DocumentRule | null {
  const rulebook = loadRulebook();
  const rule = rulebook.documents.find(d => d.docType === docType);
  
  if (!rule) {
    console.warn(`[Rulebook] Nessuna regola trovata per docType: ${docType}`);
    return null;
  }
  
  return rule;
}

/**
 * Classificazione euristica del tipo documento (fallback se non specificato)
 */
export function classifyDocTypeHeuristic(fullText: string): string | null {
  const lowerText = fullText.toLowerCase();
  
  // Euristiche semplici
  if (lowerText.includes('durc') || lowerText.includes('regolarità contributiva')) {
    return 'DURC';
  }
  
  if (lowerText.includes('visura') && lowerText.includes('camera')) {
    return 'VISURA';
  }
  
  if (lowerText.includes('preposto') && lowerText.includes('attestato')) {
    return 'ATTESTATO_PREPOSTO';
  }
  
  if (lowerText.includes('lavorator') && lowerText.includes('attestato')) {
    return 'ATTESTATO_LAVORATORE';
  }
  
  if (lowerText.includes('valutazione') && lowerText.includes('rischi')) {
    return 'DVR';
  }
  
  if (lowerText.includes('piano operativo') && lowerText.includes('sicurezza')) {
    return 'POS';
  }
  
  if (lowerText.includes('antincendio') && lowerText.includes('registro')) {
    return 'REGISTRO_ANTINCENDIO';
  }
  
  return null;
}

/**
 * Ottiene tutti i tipi documento disponibili nel rulebook
 */
export function getAllDocTypes(): string[] {
  const rulebook = loadRulebook();
  return rulebook.documents.map(d => d.docType);
}

/**
 * Ottiene il display name per un docType
 */
export function getDisplayName(docType: string): string {
  const rule = getRulesForDocType(docType);
  return rule?.displayName || docType;
}

/**
 * Verifica se un documento è richiesto per tutti i tipi di azienda
 */
export function isRequiredForAll(docType: string): boolean {
  const rule = getRulesForDocType(docType);
  return rule?.requiredForAll ?? false;
}

/**
 * Ottiene i checks che richiedono PII (per non redigere nei prompt)
 */
export function getRequiredPIIFields(docType: string): string[] {
  const rule = getRulesForDocType(docType);
  if (!rule) return [];
  
  const piiFields = new Set<string>();
  
  for (const check of rule.checks) {
    if (check.requiresPII) {
      check.requiresPII.forEach(field => piiFields.add(field));
    }
  }
  
  return Array.from(piiFields);
}
