/**
 * Vertex AI Document Validator with Structured Output
 * Uses Gemini 2.0 Flash in europe-west1 for EU compliance
 */

import { VertexAI } from "@google-cloud/vertexai";

// Response Schema for Structured Output (Allineato al piano developer + Ottavio)
// Note: Vertex AI uses uppercase type names (STRING, NUMBER, etc.)
const DOCUMENT_VALIDATION_SCHEMA = {
  type: "OBJECT" as const,
  required: ["schemaVersion", "doc", "extracted", "checks", "overall", "citations"],
  properties: {
    schemaVersion: {
      type: "STRING" as const,
      description: "Schema version for compatibility tracking",
    },
    doc: {
      type: "OBJECT" as const,
      required: ["docType"],
      properties: {
        docType: {
          type: "STRING" as const,
          description: "DURC | VISURA | POS | ATTESTATO_PREPOSTO | DVR | REGISTRO_ANTINCENDIO | etc.",
        },
        companyId: {
          type: "STRING" as const,
          description: "Company identifier if available",
        },
      },
    },
    extracted: {
      type: "OBJECT" as const,
      properties: {
        issuedAt: {
          type: "STRING" as const,
          description: "Date in YYYY-MM-DD format or empty string",
        },
        expiresAt: {
          type: "STRING" as const,
          description: "Date in YYYY-MM-DD format or empty string",
        },
        holder: {
          type: "STRING" as const,
          description: "Document holder name",
        },
        identifiers: {
          type: "OBJECT" as const,
          properties: {
            cf: {
              type: "STRING" as const,
              description: "Codice Fiscale if present",
            },
            piva: {
              type: "STRING" as const,
              description: "Partita IVA if present",
            },
          },
        },
      },
    },
    checks: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        required: ["id", "passed"],
        properties: {
          id: {
            type: "STRING" as const,
            description: "Rule ID from rulebook (e.g. durc_validity_120d)",
          },
          description: {
            type: "STRING" as const,
            description: "Human-readable description of the check",
          },
          passed: {
            type: "BOOLEAN" as const,
            description: "Whether the check passed",
          },
          value: {
            type: "STRING" as const,
            description: "Extracted value (e.g. '97 giorni', '12 ore')",
          },
          confidence: {
            type: "NUMBER" as const,
            minimum: 0,
            maximum: 1,
          },
          citationIds: {
            type: "ARRAY" as const,
            items: { type: "STRING" as const },
            description: "List of IDs from citations[]",
          },
          normativeRefs: {
            type: "ARRAY" as const,
            items: { type: "STRING" as const },
            description: "Normative reference codes",
          },
          notes: {
            type: "STRING" as const,
            description: "Additional notes (e.g. 'deterministic rule')",
          },
        },
      },
    },
    overall: {
      type: "OBJECT" as const,
      required: ["status", "isValid"],
      properties: {
        status: {
          type: "STRING" as const,
          enum: ["green", "yellow", "red", "na"],
          description: "Traffic light status",
        },
        isValid: {
          type: "BOOLEAN" as const,
          description: "Overall validity",
        },
        nonPertinente: {
          type: "BOOLEAN" as const,
          description: "If true, document is not required (client request - Ottavio)",
        },
        reasons: {
          type: "ARRAY" as const,
          items: {
            type: "OBJECT" as const,
            properties: {
              code: {
                type: "STRING" as const,
              },
              message: {
                type: "STRING" as const,
              },
            },
          },
        },
        confidence: {
          type: "NUMBER" as const,
          minimum: 0,
          maximum: 1,
        },
      },
    },
    citations: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        required: ["id"],
        properties: {
          id: {
            type: "STRING" as const,
            description: "ID assigned by retrieval (e.g. chunk-123)",
          },
          sourceId: {
            type: "STRING" as const,
            description: "Source ID (e.g. ASR_2025)",
          },
          title: {
            type: "STRING" as const,
            description: "Document title",
          },
          page: {
            type: "INTEGER" as const,
          },
          snippet: {
            type: "STRING" as const,
            description: "Text snippet from source",
          },
        },
      },
    },
    audit: {
      type: "OBJECT" as const,
      properties: {
        rag: {
          type: "OBJECT" as const,
          properties: {
            topK: {
              type: "INTEGER" as const,
            },
            hits: {
              type: "INTEGER" as const,
            },
          },
        },
        latencyMs: {
          type: "INTEGER" as const,
        },
        model: {
          type: "STRING" as const,
        },
        fallbackUsed: {
          type: "BOOLEAN" as const,
        },
      },
    },
  },
};

export interface Citation {
  id: string;
  sourceId?: string;
  title?: string;
  source?: string; // For backward compatibility
  page?: number;
  snippet: string;
}

export interface RulebookRule {
  id: string;
  description: string;
  normativeReference: string;
  evaluation?: 'deterministic' | 'llm';
  field?: string;
  deroghe?: Array<{
    condition: string;
    validUntil: string | null;
    notes: string;
  }>;
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
    companyId?: string;
  };
}

export interface ValidationOutput {
  schemaVersion: string;
  doc: {
    docType: string;
    companyId?: string;
  };
  extracted: {
    issuedAt?: string;
    expiresAt?: string;
    holder?: string;
    identifiers?: {
      cf?: string;
      piva?: string;
    };
  };
  checks: Array<{
    id: string;
    description?: string;
    passed: boolean;
    value?: string;
    confidence?: number;
    citationIds?: string[];
    normativeRefs?: string[];
    notes?: string;
  }>;
  overall: {
    status: "green" | "yellow" | "red" | "na";
    isValid: boolean;
    nonPertinente?: boolean;
    reasons?: Array<{
      code: string;
      message: string;
    }>;
    confidence: number;
  };
  citations: Citation[];
  audit?: {
    rag?: {
      topK: number;
      hits: number;
    };
    latencyMs: number;
    model: string;
    fallbackUsed: boolean;
  };
}

/**
 * Validate document using Vertex AI with RAG context
 */
export async function validateWithVertex(
  input: ValidationInput
): Promise<ValidationOutput> {
  const projectId = process.env.VERTEX_PROJECT_ID || process.env.GCLOUD_PROJECT!;
  const location = process.env.VERTEX_LOCATION || "europe-west1";
  const modelId = process.env.VALIDATION_MODEL || "gemini-2.5-flash";

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
        responseSchema: DOCUMENT_VALIDATION_SCHEMA as any, // Schema is valid, TS type mismatch
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

    // Enrich with audit information
    if (!validationOutput.audit) {
      validationOutput.audit = {
        rag: {
          topK: input.contextChunks.length,
          hits: input.contextChunks.length,
        },
        latencyMs,
        model: `${modelId}@${location}`,
        fallbackUsed: false,
      };
    }

    // Log structured event (formato piano developer)
    console.log(JSON.stringify({
      event: "validation_result",
      docId: input.metadata?.filename || "unknown",
      docType: validationOutput.doc?.docType,
      status: validationOutput.overall?.status,
      failedChecks: validationOutput.checks.filter(c => !c.passed).length,
      confidenceDist: validationOutput.overall?.confidence,
    }));

    console.log(JSON.stringify({
      event: "validation_request",
      docId: input.metadata?.filename || "unknown",
      docType: validationOutput.doc?.docType,
      model: modelId,
      latencyMs,
      ragTopK: input.contextChunks.length,
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
      
      // Aggiungi deroghe se presenti
      if (rule.deroghe && rule.deroghe.length > 0) {
        context += "\n  **Deroghe/Transitori**:\n";
        rule.deroghe.forEach((deroga) => {
          context += `  - ${deroga.condition}`;
          if (deroga.validUntil) {
            context += ` (valida fino al ${deroga.validUntil})`;
          }
          if (deroga.notes) {
            context += ` - ${deroga.notes}`;
          }
          context += "\n";
        });
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

⚠️ IMPORTANTE: RISPONDI SEMPRE E SOLO IN ITALIANO. Tutti i messaggi, motivazioni e descrizioni devono essere in italiano.

REGOLE FONDAMENTALI:
1. Usa SOLO le informazioni presenti nel contesto normativo fornito
2. Cita SOLO gli ID presenti nel contesto (es. [[CIT:kb:...]])
3. NON inventare regole o riferimenti normativi
4. Se mancano informazioni sufficienti, scrivi in italiano: "Informazioni insufficienti per la validazione"
5. Per "non pertinente": isRelevant=false + finalDecision="idoneo" con motivazione in italiano
6. Gerarchia fonti: specificità > temporalità > interpretazione conforme
7. Non sovrascrivere regole deterministiche (es. DURC 120gg è calcolato dal backend)

OUTPUT:
Restituisci ESATTAMENTE il JSON secondo lo schema fornito. Niente testo extra.
TUTTI i campi testuali (message, description, reason, notes) DEVONO essere in italiano.`;

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
 * (Piano developer + Ottavio: CF, PIVA, Email, Tel)
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
  // Email
  const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  // Tel (grezzo): numeri con +, spazi, trattini (7-15 cifre)
  const TEL_REGEX = /\b(?:\+?\d[\s-]?){7,15}\b/g;

  let redacted = text;
  redacted = redacted.replace(CF_REGEX, "[CF_REDACTED]");
  redacted = redacted.replace(PIVA_REGEX, "[PIVA_REDACTED]");
  redacted = redacted.replace(EMAIL_REGEX, "[EMAIL_REDACTED]");
  redacted = redacted.replace(TEL_REGEX, "[TEL_REDACTED]");

  return redacted;
}

