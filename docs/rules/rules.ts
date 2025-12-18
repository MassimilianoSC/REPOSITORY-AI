import { Normalized } from "./llm";
import { runDeterministicRules, hasDeterministicRules, getParameters } from "./deterministicEngine";

export type Verdict = {
  status: "green" | "yellow" | "red";
  reason: string;
  confidence: number;
  expiresAt?: string | null;
};

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

export function computeVerdict(n: Normalized, riskClass?: string): Verdict {
  const now = new Date();
  const baseConf = typeof n.confidence === "number" ? n.confidence : 0.7;
  const type = (n.docType || "ALTRO").toUpperCase();
  
  // Cerca riskClass: parametro esplicito > campo in Normalized > default
  const effectiveRiskClass = riskClass || (n as any).riskClass || (n as any).risk_class || undefined;

  console.log(`[Rules] Input from Gemini: docType=${type}, confidence=${baseConf}, issuedAt=${n.issuedAt}, riskClass=${effectiveRiskClass}`);
  
  // ========================================================================
  // NUOVO: Prova prima l'engine deterministico per docType con regole JSON
  // ========================================================================
  if (hasDeterministicRules(type)) {
    console.log(`[Rules] ${type} ha regole JSON → uso deterministicEngine`);
    
    const engineResult = runDeterministicRules(type, n as Record<string, any>, effectiveRiskClass);
    const expiresAt = (n as any).expiresAt || (n as any).contractEndDate || null;
    
    // 1) Regole "hard" fallite → RED
    if (engineResult.failedRules.length > 0) {
      const failedReasons = engineResult.failedRules.map(r => r.reason).join('; ');
      console.log(`[Rules] ENGINE VERDICT: RED - ${failedReasons}`);
      return {
        status: "red",
        reason: failedReasons,
        confidence: Math.min(baseConf, 0.6),
        expiresAt,
      };
    }
    
    // 2) Regole "non verificabili" (campo mancante per controlli cross-doc) → YELLOW
    if (engineResult.unverifiableRules.length > 0) {
      const unverifiableReasons = engineResult.unverifiableRules.map(r => r.reason).join('; ');
      console.log(`[Rules] ENGINE VERDICT: YELLOW (non verificabile) - ${unverifiableReasons}`);
      return {
        status: "yellow",
        reason: `Non verificabile: ${unverifiableReasons}`,
        confidence: baseConf,
        expiresAt,
      };
    }
    
    // 3) Solo regole "policy" fallite → YELLOW
    if (engineResult.policyFailedRules.length > 0) {
      const policyReasons = engineResult.policyFailedRules.map(r => r.reason).join('; ');
      console.log(`[Rules] ENGINE VERDICT: YELLOW (policy) - ${policyReasons}`);
      return {
        status: "yellow",
        reason: `Attenzione: ${policyReasons}`,
        confidence: baseConf,
        expiresAt,
      };
    }
    
    // 4) Controllo prossimità scadenza → YELLOW se vicino a scadenza
    if (expiresAt) {
      const expDate = new Date(expiresAt);
      const daysToExpiry = daysBetween(now, expDate);
      // FIX: Usa parametro da rulebook invece di hardcoded
      const params = getParameters();
      const YELLOW_THRESHOLD = params.ORANGE_THRESHOLD_DAYS ?? 10;

      if (daysToExpiry >= 0 && daysToExpiry <= YELLOW_THRESHOLD) {
        console.log(`[Rules] ENGINE VERDICT: YELLOW (in scadenza tra ${daysToExpiry} giorni)`);
        return {
          status: "yellow",
          reason: `Documento in scadenza tra ${daysToExpiry} giorni`,
          confidence: baseConf,
          expiresAt,
        };
      }
    }
    
    // 5) Tutte le regole passate → GREEN
    const passedReasons = engineResult.results
      .filter(r => !r.skipped && r.passed)
      .map(r => r.reason)
      .join('; ');
    console.log(`[Rules] ENGINE VERDICT: GREEN - ${passedReasons}`);
    return {
      status: "green",
      reason: `Documento conforme: ${passedReasons}`,
      confidence: baseConf,
      expiresAt,
    };
  }

  // ========================================================================
  // FALLBACK: Per docType senza regole deterministiche JSON
  // ========================================================================
  // Per altri documenti (FORMAZIONE, ATTESTATI, POS, ecc.), ritorna green
  // La validazione Gemini+RAG ha già controllato i contenuti
  console.log(`[Rules] Other document type → returning GREEN (Vertex validation already applied) → GEMINI+RAG DECIDED`);
  return {
    status: "green",
    reason: n.reason || "Documento conforme (validato da Gemini + RAG)",
    confidence: baseConf,
    expiresAt: n.expiresAt || null,
  };
}

