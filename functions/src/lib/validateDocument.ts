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

  try {
    // Use existing normalizeWithFallback for basic extraction
    const apiKey = process.env.GEMINI_API_KEY || "";
    const normalized = await normalizeWithFallback(input.fullText, apiKey);
    
    // Map to ValidationOutput format
    const output: ValidationOutput = {
      docType: normalized.docType || "ALTRO",
      isRelevant: true,
      finalDecision: "necessita_verifica_umana", // Legacy doesn't have full validation logic
      decisionReason: normalized.reason || "Extracted using legacy API",
      checks: [], // No detailed checks in legacy
      computed: {
        issuedAt: normalized.issuedAt || "",
        expiresAt: normalized.expiresAt || "",
        daysToExpiry: 9999,
      },
      citations: input.contextChunks.map((c) => ({
        id: c.id,
        source: c.source,
        page: c.page,
        snippet: c.snippet,
      })),
      confidence: normalized.confidence || 0.5,
    };

    return output;
  } catch (error: any) {
    throw new Error(`Legacy validation failed: ${error.message}`);
  }
}

