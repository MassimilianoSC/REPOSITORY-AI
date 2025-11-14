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
          decision: result.overall.isValid ? "idoneo" : "non_idoneo",
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
    
    // Map to new ValidationOutput format (schema aggiornato)
    const output: ValidationOutput = {
      schemaVersion: "1.0",
      doc: {
        docType: normalized.docType || "ALTRO",
        companyId: input.metadata?.companyId,
      },
      extracted: {
        issuedAt: normalized.issuedAt || "",
        expiresAt: normalized.expiresAt || "",
        holder: normalized.companyName,
        identifiers: {
          cf: normalized.fiscalCode,
          piva: normalized.vatNumber,
        },
      },
      checks: [], // No detailed checks in legacy
      overall: {
        status: "na",
        isValid: false,
        nonPertinente: false,
        reasons: [{
          code: "LEGACY_FALLBACK",
          message: normalized.reason || "Extracted using legacy API",
        }],
        confidence: normalized.confidence || 0.5,
      },
      citations: input.contextChunks.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        title: c.title,
        source: c.source,
        page: c.page,
        snippet: c.snippet,
      })),
      audit: {
        latencyMs: 0,
        model: "legacy-gemini-api",
        fallbackUsed: true,
        rag: {
          topK: input.contextChunks.length,
          hits: input.contextChunks.length,
        },
      },
    };

    return output;
  } catch (error: any) {
    throw new Error(`Legacy validation failed: ${error.message}`);
  }
}

