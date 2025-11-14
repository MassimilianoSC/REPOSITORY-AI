/**
 * Rulebook loader - loads validation rules from Firestore or fallback file
 */

import { getFirestore } from "firebase-admin/firestore";
import rulebookV1 from "../rulebook/rulebook-v1.json";

export interface RulebookDocument {
  docType: string;
  needsPII: boolean;
  checksRequired: Array<{
    id: string;
    description: string;
    normativeReference: string;
    deroga?: string;
  }>;
  deroghe: string[];
  notes: string;
}

export interface Rulebook {
  version: string;
  lastUpdated: string;
  documents: RulebookDocument[];
}

// In-memory cache (5 min TTL)
let cachedRulebook: Rulebook | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load rulebook from Firestore (with fallback to local file)
 */
export async function loadRulebook(): Promise<Rulebook> {
  const now = Date.now();

  // Check cache
  if (cachedRulebook && now - cacheTime < CACHE_TTL_MS) {
    return cachedRulebook;
  }

  try {
    // Try loading from Firestore
    const db = getFirestore();
    const doc = await db.doc("rulebooks/v1").get();

    if (doc.exists) {
      const data = doc.data();
      const rulebook: Rulebook = {
        version: data?.version || "1.0",
        lastUpdated: data?.lastUpdated || new Date().toISOString(),
        documents: data?.documents || [],
      };

      console.log(`[Rulebook] Loaded from Firestore: version ${rulebook.version}, ${rulebook.documents.length} docTypes`);

      cachedRulebook = rulebook;
      cacheTime = now;
      return rulebook;
    }
  } catch (error: any) {
    console.warn(`[Rulebook] Firestore load failed: ${error.message}, using fallback`);
  }

  // Fallback to local file
  console.log("[Rulebook] Using fallback file");
  const rulebook = rulebookV1 as Rulebook;
  cachedRulebook = rulebook;
  cacheTime = now;
  return rulebook;
}

/**
 * Get rules for specific docType
 */
export async function getRulesForDocType(docType: string): Promise<RulebookDocument | null> {
  const rulebook = await loadRulebook();
  
  // Exact match
  const doc = rulebook.documents.find((d) => d.docType === docType);
  if (doc) return doc;

  // Fuzzy match (case-insensitive, underscore/space normalization)
  const normalized = docType.toLowerCase().replace(/[_\s-]/g, "");
  const fuzzyMatch = rulebook.documents.find((d) =>
    d.docType.toLowerCase().replace(/[_\s-]/g, "") === normalized
  );

  return fuzzyMatch || null;
}

/**
 * Classify docType from text using heuristics (fast, no LLM)
 */
export function classifyDocTypeHeuristic(text: string): string | null {
  const textLower = text.toLowerCase();

  // DURC
  if (textLower.includes("durc") || textLower.includes("regolarità contributiva")) {
    return "DURC";
  }

  // Visura Camerale
  if (textLower.includes("camera di commercio") || textLower.includes("visura")) {
    return "Visura_Camerale";
  }

  // Formazione Preposti
  if (
    (textLower.includes("preposto") || textLower.includes("preposti")) &&
    (textLower.includes("formazione") || textLower.includes("attestato") || textLower.includes("corso"))
  ) {
    return "Formazione_Preposti";
  }

  // Formazione Lavoratori
  if (
    (textLower.includes("lavorator") || textLower.includes("dipendent")) &&
    (textLower.includes("formazione") || textLower.includes("attestato") || textLower.includes("sicurezza"))
  ) {
    return "Formazione_Lavoratori";
  }

  // Registro Antincendio
  if (
    (textLower.includes("registro") || textLower.includes("verbale")) &&
    (textLower.includes("antincendio") || textLower.includes("estintori") || textLower.includes("controlli"))
  ) {
    return "Registro_Controlli_Antincendio";
  }

  // POS
  if (textLower.includes("pos") || textLower.includes("piano operativo")) {
    return "POS";
  }

  // DVR
  if (
    textLower.includes("dvr") ||
    textLower.includes("documento di valutazione") ||
    (textLower.includes("valutazione") && textLower.includes("rischi"))
  ) {
    return "DVR";
  }

  return null;
}

