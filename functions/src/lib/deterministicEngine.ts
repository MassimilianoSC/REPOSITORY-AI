/**
 * Deterministic Rules Engine v1.0
 * 
 * Esegue regole deterministiche definite in rulebook-v1-deterministic.json
 * Supporta operatori: present, regex, eq, equals, gte, lte, age_days_lte, 
 *                     age_months_lte, gte_if_date_le, gte_by_risk, contains_any,
 *                     date_gte_today (NUOVO)
 * Supporta condizioni: extra.when per regole condizionali
 */

import deterministicRulebook from '../rulebook/rulebook-v1-deterministic.json';

// ============================================================================
// TYPES
// ============================================================================

export interface WhenCondition {
  field: string;
  op: 'equals' | 'regex' | 'present' | 'in';
  value: string | boolean | string[];
}

export interface DeterministicRule {
  ruleId: string;
  evaluation: 'det' | 'det_or_llm';
  field: string;
  op: string;
  value?: any;
  unit?: string;
  dateField?: string;
  dateCutoffParam?: string;
  valueParam?: string;
  policy?: boolean;
  source?: string;
  extra?: {
    when?: WhenCondition;
    updateHoursField?: string;
    updateHoursMin?: number;
    [key: string]: any;
  };
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  skipped: boolean;
  reason: string;
  field: string;
  actualValue?: any;
  expectedValue?: any;
}

export interface EngineResult {
  docType: string;
  allPassed: boolean;
  results: RuleResult[];
  failedRules: RuleResult[];
  skippedRules: RuleResult[];
}

// ============================================================================
// HELPERS
// ============================================================================

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function monthsBetween(a: Date, b: Date): number {
  return daysBetween(a, b) / 30;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function getParameter(paramName: string): any {
  const params = (deterministicRulebook as any).parameters || {};
  return params[paramName];
}

// ============================================================================
// CONDITION EVALUATOR (extra.when)
// ============================================================================

function evaluateCondition(condition: WhenCondition, data: Record<string, any>): boolean {
  const fieldValue = getNestedValue(data, condition.field);
  
  switch (condition.op) {
    case 'equals':
      return fieldValue === condition.value;
    
    case 'regex':
      if (typeof fieldValue !== 'string') return false;
      try {
        const regex = new RegExp(condition.value as string, 'i');
        return regex.test(fieldValue);
      } catch {
        return false;
      }
    
    case 'present':
      const isPresent = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      return condition.value === true ? isPresent : !isPresent;
    
    case 'in':
      if (!Array.isArray(condition.value)) return false;
      return condition.value.includes(fieldValue);
    
    default:
      console.warn(`[Engine] Unknown condition op: ${condition.op}`);
      return true; // Default: condition passes
  }
}

// ============================================================================
// OPERATOR IMPLEMENTATIONS
// ============================================================================

function evaluateOperator(
  rule: DeterministicRule, 
  data: Record<string, any>,
  riskClass?: string
): { passed: boolean; reason: string; actualValue?: any } {
  
  const fieldValue = getNestedValue(data, rule.field);
  const now = new Date();
  
  switch (rule.op) {
    // --- PRESENCE ---
    case 'present': {
      const isPresent = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      const expected = rule.value === true;
      return {
        passed: isPresent === expected,
        reason: isPresent 
          ? `Campo ${rule.field} presente` 
          : `Campo ${rule.field} mancante`,
        actualValue: fieldValue
      };
    }
    
    // --- EQUALITY ---
    case 'eq':
    case 'equals': {
      // Se valueParam è specificato, confronta con un parametro dinamico
      const expectedValue = rule.valueParam 
        ? getNestedValue(data, rule.valueParam) 
        : rule.value;
      const passed = fieldValue === expectedValue;
      return {
        passed,
        reason: passed 
          ? `${rule.field} = ${expectedValue}` 
          : `${rule.field} (${fieldValue}) ≠ ${expectedValue}`,
        actualValue: fieldValue
      };
    }
    
    // --- COMPARISON ---
    case 'gte': {
      const numValue = parseFloat(fieldValue);
      const threshold = parseFloat(rule.value);
      if (isNaN(numValue)) {
        return { passed: false, reason: `${rule.field} non è un numero`, actualValue: fieldValue };
      }
      return {
        passed: numValue >= threshold,
        reason: `${rule.field}: ${numValue} ${numValue >= threshold ? '≥' : '<'} ${threshold}`,
        actualValue: numValue
      };
    }
    
    case 'lte': {
      const numValue = parseFloat(fieldValue);
      const threshold = parseFloat(rule.value);
      if (isNaN(numValue)) {
        return { passed: false, reason: `${rule.field} non è un numero`, actualValue: fieldValue };
      }
      return {
        passed: numValue <= threshold,
        reason: `${rule.field}: ${numValue} ${numValue <= threshold ? '≤' : '>'} ${threshold}`,
        actualValue: numValue
      };
    }
    
    // --- REGEX ---
    case 'regex': {
      if (typeof fieldValue !== 'string') {
        return { passed: false, reason: `${rule.field} non è una stringa`, actualValue: fieldValue };
      }
      try {
        const regex = new RegExp(rule.value as string, 'i');
        const passed = regex.test(fieldValue);
        return {
          passed,
          reason: passed 
            ? `${rule.field} corrisponde al pattern` 
            : `${rule.field} non corrisponde al pattern`,
          actualValue: fieldValue
        };
      } catch (e) {
        return { passed: false, reason: `Regex invalida: ${rule.value}`, actualValue: fieldValue };
      }
    }
    
    // --- DATE: Age in days ---
    case 'age_days_lte': {
      if (!fieldValue) {
        return { passed: false, reason: `${rule.field} mancante`, actualValue: null };
      }
      const date = new Date(fieldValue);
      if (isNaN(date.getTime())) {
        return { passed: false, reason: `${rule.field} non è una data valida`, actualValue: fieldValue };
      }
      const age = daysBetween(date, now);
      const maxAge = parseInt(rule.value);
      return {
        passed: age <= maxAge,
        reason: `${rule.field}: ${age} giorni ${age <= maxAge ? '≤' : '>'} ${maxAge}`,
        actualValue: age
      };
    }
    
    // --- DATE: Age in months ---
    case 'age_months_lte': {
      if (!fieldValue) {
        return { passed: false, reason: `${rule.field} mancante`, actualValue: null };
      }
      const date = new Date(fieldValue);
      if (isNaN(date.getTime())) {
        return { passed: false, reason: `${rule.field} non è una data valida`, actualValue: fieldValue };
      }
      const ageMonths = monthsBetween(date, now);
      const maxMonths = parseInt(rule.value);
      return {
        passed: ageMonths <= maxMonths,
        reason: `${rule.field}: ${ageMonths.toFixed(1)} mesi ${ageMonths <= maxMonths ? '≤' : '>'} ${maxMonths}`,
        actualValue: ageMonths
      };
    }
    
    // --- DATE: Greater than or equal to today (NEW!) ---
    case 'date_gte_today': {
      if (!fieldValue) {
        return { passed: false, reason: `${rule.field} mancante`, actualValue: null };
      }
      const date = new Date(fieldValue);
      if (isNaN(date.getTime())) {
        return { passed: false, reason: `${rule.field} non è una data valida`, actualValue: fieldValue };
      }
      // Confronta solo le date (ignora l'ora)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);
      const passed = date >= today;
      const daysRemaining = daysBetween(today, date);
      return {
        passed,
        reason: passed 
          ? `${rule.field}: valido (scade tra ${daysRemaining} giorni)` 
          : `${rule.field}: SCADUTO da ${Math.abs(daysRemaining)} giorni`,
        actualValue: fieldValue
      };
    }
    
    // --- DATE: Conditional based on date cutoff ---
    case 'gte_if_date_le': {
      // Se la data nel dateField è <= cutoff, applica threshold ridotto
      const dateFieldValue = rule.dateField ? getNestedValue(data, rule.dateField) : null;
      const cutoffParam = rule.dateCutoffParam ? getParameter(rule.dateCutoffParam) : null;
      
      if (!dateFieldValue || !cutoffParam) {
        // Fallback: usa il valore normale
        const numValue = parseFloat(fieldValue);
        const threshold = parseFloat(rule.value);
        return {
          passed: numValue >= threshold,
          reason: `${rule.field}: ${numValue} >= ${threshold}`,
          actualValue: numValue
        };
      }
      
      const docDate = new Date(dateFieldValue);
      const cutoffDate = new Date(cutoffParam);
      
      if (docDate <= cutoffDate) {
        // Documento emesso prima del cutoff: applica regola transitoria
        const numValue = parseFloat(fieldValue);
        const threshold = parseFloat(rule.value);
        return {
          passed: numValue >= threshold,
          reason: `${rule.field}: ${numValue} >= ${threshold} (regime transitorio)`,
          actualValue: numValue
        };
      } else {
        // Documento dopo cutoff: skip questa regola (la regola principale si applicherà)
        return {
          passed: true,
          reason: `Regola transitoria non applicabile (documento post ${cutoffParam})`,
          actualValue: fieldValue
        };
      }
    }
    
    // --- RISK-BASED ---
    case 'gte_by_risk': {
      if (!riskClass) {
        return { passed: false, reason: 'Classe di rischio non specificata', actualValue: fieldValue };
      }
      const thresholds = rule.value as Record<string, number>;
      const riskKey = riskClass.toLowerCase() as 'low' | 'medium' | 'high';
      const threshold = thresholds[riskKey] || thresholds['medium'] || 0;
      const numValue = parseFloat(fieldValue);
      return {
        passed: numValue >= threshold,
        reason: `${rule.field}: ${numValue} >= ${threshold} (rischio ${riskClass})`,
        actualValue: numValue
      };
    }
    
    // --- CONTAINS ---
    case 'contains_any': {
      if (typeof fieldValue !== 'string') {
        return { passed: false, reason: `${rule.field} non è una stringa`, actualValue: fieldValue };
      }
      const keywords = rule.value as string[];
      const lowerValue = fieldValue.toLowerCase();
      const found = keywords.some(kw => lowerValue.includes(kw.toLowerCase()));
      return {
        passed: found,
        reason: found 
          ? `${rule.field} contiene keyword richiesta` 
          : `${rule.field} non contiene nessuna keyword`,
        actualValue: fieldValue
      };
    }
    
    default:
      console.warn(`[Engine] Operatore sconosciuto: ${rule.op}`);
      return { passed: true, reason: `Operatore ${rule.op} non implementato (skip)`, actualValue: fieldValue };
  }
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Esegue tutte le regole deterministiche per un tipo documento
 */
export function runDeterministicRules(
  docType: string, 
  data: Record<string, any>,
  riskClass?: string
): EngineResult {
  
  const rules = (deterministicRulebook as any).deterministicRules?.[docType] as DeterministicRule[] | undefined;
  
  if (!rules || rules.length === 0) {
    console.log(`[Engine] Nessuna regola deterministica per ${docType}`);
    return {
      docType,
      allPassed: true,
      results: [],
      failedRules: [],
      skippedRules: []
    };
  }
  
  console.log(`[Engine] Eseguo ${rules.length} regole per ${docType}`);
  
  const results: RuleResult[] = [];
  const failedRules: RuleResult[] = [];
  const skippedRules: RuleResult[] = [];
  
  for (const rule of rules) {
    // Check condizione when (se presente)
    if (rule.extra?.when) {
      const conditionMet = evaluateCondition(rule.extra.when, data);
      if (!conditionMet) {
        const skipped: RuleResult = {
          ruleId: rule.ruleId,
          passed: true,
          skipped: true,
          reason: `Condizione non soddisfatta: ${rule.extra.when.field} ${rule.extra.when.op} ${rule.extra.when.value}`,
          field: rule.field
        };
        results.push(skipped);
        skippedRules.push(skipped);
        console.log(`[Engine] ${rule.ruleId}: SKIPPED (condizione when non soddisfatta)`);
        continue;
      }
    }
    
    // Esegui l'operatore
    const evalResult = evaluateOperator(rule, data, riskClass);
    
    const result: RuleResult = {
      ruleId: rule.ruleId,
      passed: evalResult.passed,
      skipped: false,
      reason: evalResult.reason,
      field: rule.field,
      actualValue: evalResult.actualValue,
      expectedValue: rule.value
    };
    
    results.push(result);
    
    if (!evalResult.passed) {
      failedRules.push(result);
      console.log(`[Engine] ${rule.ruleId}: FAILED - ${evalResult.reason}`);
    } else {
      console.log(`[Engine] ${rule.ruleId}: PASSED - ${evalResult.reason}`);
    }
  }
  
  return {
    docType,
    allPassed: failedRules.length === 0,
    results,
    failedRules,
    skippedRules
  };
}

/**
 * Verifica se esistono regole deterministiche per un docType
 */
export function hasDeterministicRules(docType: string): boolean {
  const rules = (deterministicRulebook as any).deterministicRules?.[docType];
  return Array.isArray(rules) && rules.length > 0;
}

/**
 * Ottiene i parametri globali del rulebook
 */
export function getParameters(): Record<string, any> {
  return (deterministicRulebook as any).parameters || {};
}
