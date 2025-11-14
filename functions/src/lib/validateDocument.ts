/**
 * Document validation with Vertex AI (primary) and legacy fallback
 */

import { validateWithVertex, ValidationInput, ValidationOutput } from "./vertexValidator";
import { normalizeWithFallback } from "./llm";

const USE_VERTEX = process.env.USE_VERTEX === "true";
const ALLOW_LEGACY_FALLBACK = process.env.ALLOW_LEGACY_FALLBACK === "true";

/**
 * Main validation entry point with feature flag and fallback
 */
export async function validateDocument(
  input: ValidationInput
): Promise<ValidationOutput> {
  const startTime = Date.now();

  console.log(JSON.stringify({
    event: "validate_doc_start",
    docType: input.docType || "unknown",
    useVertex: USE_VERTEX,
    ragHits: input.contextChunks.length,
  }));

  try {
    if (USE_VERTEX) {
      // Primary path: Vertex AI with RAG upstream
      return await validateWithVertex(input);
    } else {
      // Legacy path: old Gemini Developer API
      return await validateWithLegacyGemini(input);
    }
  } catch (error: any) {
    console.error(`[Validate] Error: ${error.message}`);

    // Attempt fallback only in staging if explicitly allowed
    if (USE_VERTEX && ALLOW_LEGACY_FALLBACK) {
      console.warn("[Validate] Falling back to legacy Gemini API");
      
      try {
        const result = await validateWithLegacyGemini(input);
        
        console.log(JSON.stringify({
          event: "validate_doc_done",
          docType: input.docType || "unknown",
          latencyMs: Date.now() - startTime,
          fallbackUsed: true,
          decision: result.finalDecision,
        }));

        return result;
      } catch (fallbackError: any) {
        console.error(`[Validate] Fallback also failed: ${fallbackError.message}`);
        throw fallbackError;
      }
    }

    throw error;
  }
}

/**
 * Legacy validation using Gemini Developer API
 * (Kept for rollback capability in staging)
 */
async function validateWithLegacyGemini(
  input: ValidationInput
): Promise<ValidationOutput> {
  console.log("[Validate] Using LEGACY Gemini Developer API");

  // Build context
  const contextText = input.contextChunks
    .map((c) => `${c.source} (pag. ${c.page || "?"}): ${c.snippet}`)
    .join("\n\n");

  const rulesText = input.rulebookRules
    .map((r) => `- [${r.id}] ${r.description} (${r.normativeReference})`)
    .join("\n");

  const prompt = `
Sei un validatore documentale. Valida il seguente documento secondo le regole fornite.

CONTESTO NORMATIVO:
${contextText}

REGOLE:
${rulesText}

DOCUMENTO:
${input.fullText}

Restituisci un JSON con:
{
  "docType": "tipo documento",
  "isRelevant": true/false,
  "finalDecision": "idoneo" | "non_idoneo" | "necessita_verifica_umana",
  "decisionReason": "spiegazione",
  "checks": [{"id": "rule_id", "status": "pass|fail|not_applicable", "detail": "..."}],
  "computed": {"issuedAt": "YYYY-MM-DD", "expiresAt": "YYYY-MM-DD", "daysToExpiry": 999},
  "citations": [],
  "confidence": 0.8
}
`;

  try {
    // Use existing normalizeWithFallback function
    const apiKey = process.env.GEMINI_API_KEY || "";
    const rawResponse = await normalizeWithFallback(prompt, apiKey);
    
    // Parse JSON from response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON in legacy response");
    }

    const parsed: ValidationOutput = JSON.parse(jsonMatch[0]);
    
    // Map citations from context chunks
    parsed.citations = input.contextChunks.map((c) => ({
      id: c.id,
      source: c.source,
      page: c.page,
      snippet: c.snippet,
    }));

    return parsed;
  } catch (error: any) {
    throw new Error(`Legacy validation failed: ${error.message}`);
  }
}

