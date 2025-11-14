import { GoogleGenAI } from "@google/genai";

export type Normalized = {
  docType?: string;
  issuedAt?: string;   // ISO yyyy-mm-dd
  expiresAt?: string;  // ISO yyyy-mm-dd
  companyName?: string;
  vatNumber?: string;
  fiscalCode?: string;
  reason?: string;     // spiegazione breve
  confidence?: number; // 0..1
};

const BASE_SYSTEM_PROMPT = `
Sei un normalizzatore. Dal testo OCR o nativo estrai SOLO i seguenti campi in JSON valido:
- docType: "DURC" | "VISURA" | "POS" | "ALTRO" (usa "ALTRO" se incerto)
- issuedAt: data ISO (yyyy-mm-dd) se presente altrimenti null
- expiresAt: data ISO (yyyy-mm-dd) se presente altrimenti null
- companyName, vatNumber, fiscalCode se presenti altrimenti null
- reason: frase breve che spiega cosa hai riconosciuto
- confidence: numero tra 0 e 1 sulla tua sicurezza

Regole:
- Se il documento è un DURC, prova a dedurre issuedAt/expiresAt; se manca una delle due, valorizza la disponibile e spiega in reason.
- Non inventare valori. Se non sei sicuro, usa null o "ALTRO".
- Output: SOLO JSON valido, niente testo extra. NON wrappare in markdown.

RISPONDI SOLO CON IL JSON, ESEMPIO:
{"docType":"DURC","issuedAt":"2024-08-15","expiresAt":"2025-02-15","companyName":"ACME SRL","vatNumber":"IT12345678901","fiscalCode":null,"reason":"DURC riconosciuto con date valide","confidence":0.92}
`;

function buildPrompt(text: string) {
  const snippet = text.slice(0, 15000); // taglio di sicurezza
  return `${BASE_SYSTEM_PROMPT}\n\nTESTO:\n${snippet}`;
}

export async function normalizeWithGemini(
  text: string,
  apiKey: string,
  model = "gemini-2.5-flash-lite"  // FIX 2024-11-07: Gemini 2.5 (1.5 ritirato)
): Promise<Normalized> {
  console.log("[LLM] Using model:", model);  // Debug log
  const ai = new GoogleGenAI({ 
    apiKey,
    apiVersion: "v1"  // API stabili (non beta)
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(text)
    });

    const raw = response.text || "{}";
    
    // Pulisci markdown wrapping se presente
    let jsonText = raw.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }
    
    try {
      return JSON.parse(jsonText) as Normalized;
    } catch (parseError) {
      console.warn("JSON parse fallito, raw:", jsonText.substring(0, 200));
      return { reason: "LLM JSON parse error", confidence: 0.3 };
    }
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    return { reason: `LLM error: ${error?.message || "unknown"}`, confidence: 0.2 };
  }
}

export async function normalizeWithFallback(
  text: string,
  apiKey: string,
  opts: { primary?: string; fallback?: string; minConfidence?: number } = {}
): Promise<Normalized> {
  const {
    primary = "gemini-2.5-flash-lite",  // Veloce ed economico
    fallback = "gemini-2.5-flash",      // Più robusto se serve
    minConfidence = 0.75,
  } = opts;

  const first = await normalizeWithGemini(text, apiKey, primary);
  const c1 = typeof first.confidence === "number" ? first.confidence : 0;
  const hasDates = !!(first.issuedAt || first.expiresAt);
  const ok = c1 >= minConfidence && first.docType && first.docType !== "ALTRO" && hasDates;
  
  if (ok) return first;

  // Fallback a modello più potente se primo tentativo insufficiente
  if (fallback !== primary) {
    console.log(`Confidence bassa (${c1}), retry con ${fallback}`);
    const second = await normalizeWithGemini(text, apiKey, fallback);
    const c2 = typeof second.confidence === "number" ? second.confidence : 0;
    return c2 > c1 ? second : first;
  }

  return first;
}
