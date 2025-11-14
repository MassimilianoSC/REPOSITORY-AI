import { Normalized } from "./llm";

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

  if (type.includes("DURC")) {
    if (!n.issuedAt) {
      return {
        status: "yellow",
        reason: "DURC senza data di emissione",
        confidence: Math.min(baseConf, 0.6),
        expiresAt: n.expiresAt || null,
      };
    }

    const issued = new Date(n.issuedAt);
    const age = daysBetween(issued, now);

    if (age <= 90) {
      return { status: "green", reason: `DURC valido: ${age} giorni`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    if (age <= 120) {
      return { status: "yellow", reason: `DURC in scadenza: ${age} giorni`, confidence: baseConf, expiresAt: n.expiresAt || null };
    }

    return { status: "red", reason: `DURC scaduto: ${age} giorni`, confidence: Math.min(baseConf, 0.6), expiresAt: n.expiresAt || null };
  }

  // Default prudente per altri documenti
  return {
    status: "yellow",
    reason: n.reason || "Documento non riconosciuto come DURC",
    confidence: Math.min(baseConf, 0.6),
    expiresAt: n.expiresAt || null,
  };
}

