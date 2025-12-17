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

export function computeVerdict(n: Normalized): Verdict {
  const now = new Date();
  const baseConf = typeof n.confidence === "number" ? n.confidence : 0.7;
  const type = (n.docType || "ALTRO").toUpperCase();

  console.log(`[Rules] Input from Gemini: docType=${type}, confidence=${baseConf}, issuedAt=${n.issuedAt}`);
  
  // ========================================================================
  // NUOVO: Prova prima l'engine deterministico per docType con regole JSON
  // ========================================================================
  if (hasDeterministicRules(type)) {
    console.log(`[Rules] ${type} ha regole JSON → uso deterministicEngine`);
    
    const engineResult = runDeterministicRules(type, n as Record<string, any>);
    
    if (engineResult.failedRules.length > 0) {
      // Almeno una regola fallita → RED
      const failedReasons = engineResult.failedRules.map(r => r.reason).join('; ');
      console.log(`[Rules] ENGINE VERDICT: RED - ${failedReasons}`);
      return {
        status: "red",
        reason: failedReasons,
        confidence: Math.min(baseConf, 0.6),
        expiresAt: (n as any).expiresAt || (n as any).contractEndDate || null,
      };
    }
    
    // Tutte le regole passate → GREEN
    const passedReasons = engineResult.results
      .filter(r => !r.skipped)
      .map(r => r.reason)
      .join('; ');
    console.log(`[Rules] ENGINE VERDICT: GREEN - ${passedReasons}`);
    return {
      status: "green",
      reason: `Documento conforme: ${passedReasons}`,
      confidence: baseConf,
      expiresAt: (n as any).expiresAt || (n as any).contractEndDate || null,
    };
  }

  // === DURC: Validità 120 giorni (deterministico) ===
  if (type.includes("DURC")) {
    console.log("[Rules] DURC detected → applying DETERMINISTIC rules (Gemini result ignored for verdict)");
    
    if (!n.issuedAt) {
      console.log("[Rules] OVERRIDE: No issuedAt → forcing YELLOW");
      return {
        status: "yellow",
        reason: "DURC senza data di emissione",
        confidence: Math.min(baseConf, 0.6),
        expiresAt: n.expiresAt || null,
      };
    }

    const issued = new Date(n.issuedAt);
    const age = daysBetween(issued, now);
    console.log(`[Rules] DURC age: ${age} days`);

    if (age <= 90) {
      console.log(`[Rules] VERDICT: GREEN (age ${age} <= 90 days) → RULES DECIDED`);
      return { status: "green", reason: `DURC valido: ${age} giorni`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    if (age <= 120) {
      console.log(`[Rules] VERDICT: YELLOW (age ${age} <= 120 days) → RULES DECIDED`);
      return { status: "yellow", reason: `DURC in scadenza: ${age} giorni`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    console.log(`[Rules] VERDICT: RED (age ${age} > 120 days) → RULES DECIDED`);
    return { status: "red", reason: `DURC scaduto: ${age} giorni`, confidence: Math.min(baseConf, 0.6), expiresAt: n.expiresAt || null };
  }

  // === VISURA CAMERALE: Validità 6 mesi / 180 giorni (deterministico) ===
  if (type.includes("VISURA")) {
    console.log("[Rules] VISURA detected → applying DETERMINISTIC rules (6 months validity)");
    
    if (!n.issuedAt) {
      console.log("[Rules] OVERRIDE: No issuedAt → forcing YELLOW");
      return {
        status: "yellow",
        reason: "Visura senza data di emissione",
        confidence: Math.min(baseConf, 0.6),
        expiresAt: null,
      };
    }

    const issued = new Date(n.issuedAt);
    const age = daysBetween(issued, now);
    
    // Calcola scadenza: data emissione + 180 giorni (6 mesi)
    const expiryDate = new Date(issued);
    expiryDate.setDate(expiryDate.getDate() + 180);
    const expiresAt = expiryDate.toISOString().split('T')[0];
    
    console.log(`[Rules] VISURA age: ${age} days, calculated expiresAt: ${expiresAt}`);

    if (age <= 150) {
      console.log(`[Rules] VERDICT: GREEN (age ${age} <= 150 days) → RULES DECIDED`);
      return { 
        status: "green", 
        reason: `Visura valida: ${age} giorni`, 
        confidence: baseConf, 
        expiresAt 
      };
    }

    if (age <= 180) {
      console.log(`[Rules] VERDICT: YELLOW (age ${age} <= 180 days) → RULES DECIDED`);
      return { 
        status: "yellow", 
        reason: `Visura in scadenza: ${age} giorni`, 
        confidence: baseConf, 
        expiresAt 
      };
    }

    console.log(`[Rules] VERDICT: RED (age ${age} > 180 days) → RULES DECIDED`);
    return { 
      status: "red", 
      reason: `Visura scaduta: ${age} giorni`, 
      confidence: Math.min(baseConf, 0.6), 
      expiresAt 
    };
  }

  // === REGISTRO ANTINCENDIO: Max 6 mesi (deterministico) ===
  if (type.includes("REGISTRO") && type.includes("ANTINCENDIO")) {
    console.log("[Rules] REGISTRO ANTINCENDIO detected → applying DETERMINISTIC rules (max 6 months)");
    
    // lastEntry è l'ultima registrazione nel registro
    const lastEntryField = (n as any).lastEntry || n.issuedAt;
    
    if (!lastEntryField) {
      console.log("[Rules] OVERRIDE: No lastEntry → forcing YELLOW");
      return {
        status: "yellow",
        reason: "Registro senza data ultima registrazione",
        confidence: Math.min(baseConf, 0.6),
        expiresAt: null,
      };
    }

    const lastEntry = new Date(lastEntryField);
    const monthsSinceLastEntry = daysBetween(lastEntry, now) / 30;
    
    console.log(`[Rules] REGISTRO ANTINCENDIO: ${monthsSinceLastEntry.toFixed(1)} months since last entry`);

    if (monthsSinceLastEntry <= 5) {
      console.log(`[Rules] VERDICT: GREEN (${monthsSinceLastEntry.toFixed(1)} <= 5 months) → RULES DECIDED`);
      return { status: "green", reason: `Registro aggiornato: ultima registrazione ${Math.floor(monthsSinceLastEntry * 30)} giorni fa`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    if (monthsSinceLastEntry <= 6) {
      console.log(`[Rules] VERDICT: YELLOW (${monthsSinceLastEntry.toFixed(1)} <= 6 months) → RULES DECIDED`);
      return { status: "yellow", reason: `Registro in scadenza: ultima registrazione ${Math.floor(monthsSinceLastEntry * 30)} giorni fa`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    console.log(`[Rules] VERDICT: RED (${monthsSinceLastEntry.toFixed(1)} > 6 months) → RULES DECIDED`);
    return { status: "red", reason: `Registro scaduto: ultima registrazione ${Math.floor(monthsSinceLastEntry * 30)} giorni fa (max 6 mesi)`, confidence: Math.min(baseConf, 0.6), expiresAt: n.expiresAt || null };
  }

  // === DVR: Max 12 mesi (deterministico) ===
  if (type.includes("DVR") || type.includes("VALUTAZIONE") && type.includes("RISCHI")) {
    console.log("[Rules] DVR detected → applying DETERMINISTIC rules (max 12 months)");
    
    if (!n.issuedAt) {
      console.log("[Rules] OVERRIDE: No issuedAt → forcing YELLOW");
      return {
        status: "yellow",
        reason: "DVR senza data di emissione",
        confidence: Math.min(baseConf, 0.6),
        expiresAt: null,
      };
    }

    const issued = new Date(n.issuedAt);
    const monthsSinceIssued = daysBetween(issued, now) / 30;
    
    console.log(`[Rules] DVR: ${monthsSinceIssued.toFixed(1)} months since issued`);

    if (monthsSinceIssued <= 10) {
      console.log(`[Rules] VERDICT: GREEN (${monthsSinceIssued.toFixed(1)} <= 10 months) → RULES DECIDED`);
      return { status: "green", reason: `DVR aggiornato: ${Math.floor(monthsSinceIssued)} mesi fa`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    if (monthsSinceIssued <= 12) {
      console.log(`[Rules] VERDICT: YELLOW (${monthsSinceIssued.toFixed(1)} <= 12 months) → RULES DECIDED`);
      return { status: "yellow", reason: `DVR in scadenza: ${Math.floor(monthsSinceIssued)} mesi fa`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    console.log(`[Rules] VERDICT: RED (${monthsSinceIssued.toFixed(1)} > 12 months) → RULES DECIDED`);
    return { status: "red", reason: `DVR scaduto: ${Math.floor(monthsSinceIssued)} mesi fa (max 12 mesi)`, confidence: Math.min(baseConf, 0.6), expiresAt: n.expiresAt || null };
  }

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

