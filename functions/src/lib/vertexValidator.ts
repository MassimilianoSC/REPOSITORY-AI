/**
 * Vertex AI Document Validator with Structured Output
 * Uses Gemini 2.0 Flash in europe-west1 for EU compliance
 */

import { VertexAI } from "@google-cloud/vertexai";

// Response Schema for Structured Output
const DOCUMENT_VALIDATION_SCHEMA = {
  type: "object",
  required: ["docType", "isRelevant", "finalDecision", "checks", "citations", "confidence"],
  properties: {
    docType: {
      type: "string",
      description: "One of the known document types from rulebook",
    },
    isRelevant: {
      type: "boolean",
      description: "If the document is relevant to the case. If false -> document considered valid for 'not relevant' as per client request",
    },
    finalDecision: {
      type: "string",
      enum: ["idoneo", "non_idoneo", "necessita_verifica_umana"],
      description: "AI outcome. NB: backend may override with deterministic rules (e.g. DURC)",
    },
    decisionReason: {
      type: "string",
      description: "Explanation of the decision",
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: {
            type: "string",
            description: "Rule ID from rulebook (e.g. durc_validity_120d)",
          },
          status: {
            type: "string",
            enum: ["pass", "fail", "not_applicable"],
          },
          detail: {
            type: "string",
          },
          citationIds: {
            type: "array",
            items: { type: "string" },
            description: "List of IDs from citations[]",
          },
        },
      },
    },
    computed: {
      type: "object",
      properties: {
        issuedAt: {
          type: "string",
          description: "Date in YYYY-MM-DD format. If not present in document, use empty string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$|^$",
        },
        expiresAt: {
          type: "string",
          description: "Date in YYYY-MM-DD format. If not present in document, use empty string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$|^$",
        },
        daysToExpiry: {
          type: "integer",
          description: "Days until expiry (negative if expired). If no expiry date, use 9999",
        },
      },
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "source"],
        properties: {
          id: {
            type: "string",
            description: "ID assigned by retrieval (e.g. kb:DM_16_01_97:p12)",
          },
          source: {
            type: "string",
            description: "Filename or document reference",
          },
          page: {
            type: "integer",
          },
          snippet: {
            type: "string",
          },
        },
      },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
};

export interface Citation {
  id: string;
  source: string;
  page?: number;
  snippet: string;
}

export interface RulebookRule {
  id: string;
  description: string;
  normativeReference: string;
}

export interface ValidationInput {
  fullText: string;
  docType?: string;
  contextChunks: Citation[];
  rulebookRules: RulebookRule[];
  metadata?: {
    filename?: string;
    uploadedBy?: string;
    companyName?: string;
  };
}

export interface ValidationOutput {
  docType: string;
  isRelevant: boolean;
  finalDecision: "idoneo" | "non_idoneo" | "necessita_verifica_umana";
  decisionReason: string;
  checks: Array<{
    id: string;
    status: "pass" | "fail" | "not_applicable";
    detail?: string;
    citationIds?: string[];
  }>;
  computed?: {
    issuedAt?: string;
    expiresAt?: string;
    daysToExpiry?: number;
  };
  citations: Citation[];
  confidence: number;
}

/**
 * Validate document using Vertex AI with RAG context
 */
export async function validateWithVertex(
  input: ValidationInput
): Promise<ValidationOutput> {
  const projectId = process.env.VERTEX_PROJECT_ID || process.env.GCLOUD_PROJECT!;
  const location = process.env.VERTEX_LOCATION || "europe-west1";
  const modelId = process.env.VERTEX_MODEL_ID || "gemini-2.0-flash-001";

  const startTime = Date.now();

  try {
    // Initialize Vertex AI client
    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    const generativeModel = vertexAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: DOCUMENT_VALIDATION_SCHEMA,
      },
    });

    // Build context from RAG chunks
    const contextText = buildContextText(input.contextChunks, input.rulebookRules);

    // Build prompt
    const prompt = buildValidationPrompt(input, contextText);

    // Call Vertex AI
    console.log(`[Vertex] Calling ${modelId} in ${location} for docType=${input.docType || "unknown"}`);
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;

    const latencyMs = Date.now() - startTime;
    console.log(`[Vertex] Response received in ${latencyMs}ms`);

    // Parse structured output
    const jsonText = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const validationOutput: ValidationOutput = JSON.parse(jsonText);

    // Log structured event
    console.log(JSON.stringify({
      event: "validate_doc_done",
      docType: validationOutput.docType,
      model: modelId,
      region: location,
      latencyMs,
      decision: validationOutput.finalDecision,
      confidence: validationOutput.confidence,
      ragHits: input.contextChunks.length,
      useVertex: true,
      fallbackUsed: false,
    }));

    return validationOutput;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    // Log error
    console.error(JSON.stringify({
      event: "validate_doc_error",
      docType: input.docType || "unknown",
      model: modelId,
      region: location,
      latencyMs,
      error: error.message,
      useVertex: true,
    }));

    throw new Error(`Vertex AI validation failed: ${error.message}`);
  }
}

/**
 * Build context text from RAG chunks and rulebook
 */
function buildContextText(chunks: Citation[], rules: RulebookRule[]): string {
  let context = "# CONTESTO NORMATIVO E REGOLE\n\n";

  // Add RAG chunks with citation IDs
  if (chunks.length > 0) {
    context += "## Passaggi normativi rilevanti:\n\n";
    chunks.forEach((chunk) => {
      context += `[[CIT:${chunk.id}]]\n`;
      context += `Fonte: ${chunk.source}`;
      if (chunk.page) context += ` (pag. ${chunk.page})`;
      context += `\n${chunk.snippet}\n\n`;
    });
  }

  // Add rulebook rules
  if (rules.length > 0) {
    context += "## Regole di validazione specifiche:\n\n";
    rules.forEach((rule) => {
      context += `- [${rule.id}] ${rule.description}`;
      if (rule.normativeReference) {
        context += ` (Rif: ${rule.normativeReference})`;
      }
      context += "\n";
    });
    context += "\n";
  }

  return context;
}

/**
 * Build validation prompt
 */
function buildValidationPrompt(input: ValidationInput, contextText: string): string {
  const systemInstructions = `Sei un validatore documentale esperto in normative di sicurezza sul lavoro e appalti pubblici italiani.

REGOLE FONDAMENTALI:
1. Usa SOLO le informazioni presenti nel contesto normativo fornito
2. Cita SOLO gli ID presenti nel contesto (es. [[CIT:kb:...]])
3. NON inventare regole o riferimenti normativi
4. Se mancano informazioni sufficienti, usa finalDecision="necessita_verifica_umana"
5. Per "non pertinente": isRelevant=false + finalDecision="idoneo"
6. Gerarchia fonti: specificità > temporalità > interpretazione conforme
7. Non sovrascrivere regole deterministiche (es. DURC 120gg è calcolato dal backend)

OUTPUT:
Restituisci ESATTAMENTE il JSON secondo lo schema fornito. Niente testo extra.`;

  let prompt = systemInstructions + "\n\n";
  prompt += "---\n\n";
  prompt += contextText;
  prompt += "\n---\n\n";
  prompt += "# DOCUMENTO DA VALIDARE\n\n";

  if (input.docType) {
    prompt += `Tipo documento candidato: ${input.docType}\n\n`;
  }

  if (input.metadata) {
    prompt += "Metadati:\n";
    if (input.metadata.filename) prompt += `- File: ${input.metadata.filename}\n`;
    if (input.metadata.companyName) prompt += `- Azienda: ${input.metadata.companyName}\n`;
    prompt += "\n";
  }

  prompt += "## Testo estratto:\n\n";
  prompt += input.fullText;
  prompt += "\n\n---\n\n";
  prompt += "Valida questo documento secondo le regole fornite e restituisci il JSON strutturato.";

  return prompt;
}

/**
 * PII Redaction for documents that don't need PII
 */
export function redactPII(text: string, needsPII: boolean): string {
  if (needsPII) {
    // Don't redact if PII is needed
    return text;
  }

  // Italian Codice Fiscale: RSSMRA85M01H501Z
  const CF_REGEX = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
  // Italian P.IVA: 11 digits
  const PIVA_REGEX = /\b\d{11}\b/g;

  let redacted = text;
  redacted = redacted.replace(CF_REGEX, "[CF_REDACTED]");
  redacted = redacted.replace(PIVA_REGEX, "[PIVA_REDACTED]");

  return redacted;
}

