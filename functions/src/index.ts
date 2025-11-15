import { onRequest } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";
import { normalizeWithFallback, Normalized } from "./lib/llm";
import { computeVerdict } from "./lib/rules";
import { docAiExtractPdf } from "./lib/docai";
import { validateDocument } from "./lib/validateDocument";
import { redactPII } from "./lib/vertexValidator";
import { retrieveKBChunks, buildRAGQuery } from "./lib/ragRetriever";
import { classifyDocTypeHeuristic, getRulesForDocType, getRequiredPIIFields } from "./lib/rulebookLoader";
import { pdfTextProbe } from "./lib/pdfProbe";

initializeApp();

// Export RAG functions
export { kbIngestFromStorage } from "./rag/ingest";
export { kbSearch } from "./rag/query";

// Export Alert functions
export { sendExpiryAlerts, sendExpiryAlertsDryRun } from "./alerts/sendExpiryAlerts";

// Export Auth functions
export { acceptInvite } from "./auth/acceptInvite";
export { devSetClaims } from "./auth/devSetClaims"; // SOLO emulator (decommentare se necessario)

const REGION = "europe-west1";
const IS_EMULATOR = !!process.env.FUNCTIONS_EMULATOR;
const DOC_AI_PROCESSOR_ID = defineSecret("DOC_AI_PROCESSOR_ID");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// soglia usata solo se reintrodurrai il gating; ora non blocca il flusso
const CHAR_PER_PAGE_THRESHOLD = Number(process.env.PIPELINE_CHAR_PER_PAGE_THRESHOLD ?? 200);

const sha1 = (buf: Buffer) => crypto.createHash("sha1").update(buf).digest("hex");

function parsePath(name: string) {
  // Adatta al tuo path reale: docs/{tenant}/{company}/{...}/{file}.pdf
  const parts = name.split("/");
  const tid = parts[1] || "unknownTenant";
  const cid = parts[2] || "unknownCompany";
  const filename = parts[parts.length - 1] || "file.pdf";
  const docId = filename.replace(/\.pdf$/i, "");
  
  console.log("📂 Parsed path:", { name, tid, cid, docId });
  
  return { tid, cid, docId };
}

export const health = onRequest({ region: REGION }, (_req, res) => {
  // Updated: 2024-11-06 - Fixed Gemini 2.5 SDK
  res.status(200).send("ok");
});

export const processUpload = onObjectFinalized(
  {
    region: REGION,
    timeoutSeconds: 180,
    memory: "1GiB",
    concurrency: 80,
    bucket: "repository-ai-477311.firebasestorage.app",
    secrets: [DOC_AI_PROCESSOR_ID, GEMINI_API_KEY],
  },
  async (event) => {
    const { name, bucket, contentType = "", size = "0", generation } = event.data;
    
    console.log("🔔 Storage trigger fired:", { bucket, name, contentType, size });
    
    if (!name || !contentType.includes("pdf")) {
      console.log("⏭️ Skip: non-PDF or no name");
      return;
    }

    const db = getFirestore();
    const storage = getStorage().bucket(bucket);
    const file = storage.file(name);

    try {
      const [buffer] = await file.download();
      const contentHash = sha1(buffer);
      const { tid, cid, docId } = parsePath(name);

      const docRef = db.doc(`tenants/${tid}/companies/${cid}/documents/${docId}`);
      const prev = (await docRef.get()).data() as any | undefined;

      // Idempotenza
      if (prev?.lastProcessedGen === generation && prev?.contentHash === contentHash) {
        console.log("Already processed, skip:", { name, generation });
        return;
      }

      // Stato iniziale
      await docRef.set({ status: "processing", updatedAt: new Date() }, { merge: true });

      // === OCR GATING (NUOVA LOGICA) ===
      const MIN_TOTAL = Number(process.env.GATING_TOTAL_CHARS_MIN ?? 50);
      const MIN_PERPAGE = Number(process.env.GATING_MIN_CHARS_PER_PAGE ?? 30);
      const GATING_LOG_SAMPLES = process.env.GATING_LOG_SAMPLES === "1";
      const GATING_TEST_PARAMS = process.env.GATING_TEST_PARAMS === "1";

      let fullText = "";
      let ocrUsed = false;
      let ocrReason = "";

      if (IS_EMULATOR) {
        console.log("⚙️ Emulator: skip Document AI OCR");
        // opzionale: fullText = "testo emulato";
      } else {
        // Step 1: Probe PDF with pdf.js
        console.log("📄 Probing PDF with pdf.js...");
        const probe = await pdfTextProbe(buffer);

        console.log({
          event: "pdf_probe",
          pages: probe.pages,
          totalChars: probe.totalChars,
          perPage: probe.charsPerPage,
          min: probe.minCharsPerPage,
          max: probe.maxCharsPerPage,
          avg: probe.avgCharsPerPage,
          ...(GATING_LOG_SAMPLES ? { sample100: probe.sample100 } : {}),
        });

        // Step 2: Check test params (metadata or query)
        const metadata = (await file.getMetadata())[0].metadata || {};
        const forceOcr = GATING_TEST_PARAMS && metadata.forceOcr === "1";
        const skipOcr = GATING_TEST_PARAMS && metadata.skipOcr === "1";

        if (skipOcr) {
          console.log({ event: "ocr_skipped_by_flag" });
          fullText = probe.fullText;
          ocrUsed = false;
          ocrReason = "skipOcr flag";
        } else if (!forceOcr) {
          // Step 3: Heuristic check (combined logic)
          const hasEnoughText =
            probe.totalChars >= MIN_TOTAL || probe.maxCharsPerPage >= MIN_PERPAGE;

          if (hasEnoughText) {
            console.log({
              event: "ocr_bypassed",
              reason: "heuristic_pass",
              totalChars: probe.totalChars,
              maxCharsPerPage: probe.maxCharsPerPage,
            });
            fullText = probe.fullText;
            ocrUsed = false;
            ocrReason = "heuristic_pass";
          } else {
            // Step 4: Call Document AI OCR
            console.log({
              event: "ocr_invoked",
              reason: "heuristic_low_text",
              totalChars: probe.totalChars,
              maxCharsPerPage: probe.maxCharsPerPage,
            });
            const projectId = process.env.GCLOUD_PROJECT!;
            const processorId = DOC_AI_PROCESSOR_ID.value();
            const ocr = await docAiExtractPdf(buffer, {
              projectId,
              location: "eu",
              processorId,
            });
            fullText = (ocr.text || "").trim();
            ocrUsed = true;
            ocrReason = "heuristic_low_text";
            console.log("✅ OCR pages:", ocr.pages, " OCR text length:", fullText.length);
          }
        } else {
          // forceOcr === true
          console.log({ event: "ocr_invoked", reason: "forced" });
          const projectId = process.env.GCLOUD_PROJECT!;
          const processorId = DOC_AI_PROCESSOR_ID.value();
          const ocr = await docAiExtractPdf(buffer, {
            projectId,
            location: "eu",
            processorId,
          });
          fullText = (ocr.text || "").trim();
          ocrUsed = true;
          ocrReason = "forced";
          console.log("✅ OCR pages:", ocr.pages, " OCR text length:", fullText.length);
        }
      }

      // === NEW PIPELINE: RAG Upstream + Vertex Validation ===
      
      let finalDocType = "ALTRO";
      let finalDecision = "non_idoneo";
      let finalReason = "Processing incomplete";
      let finalConfidence = 0.5;
      let computedFields: any = {};
      let validationCitations: any[] = [];
      
      if (!IS_EMULATOR && process.env.USE_VERTEX === "true") {
        // === STEP 1: Classify docType (heuristic) ===
        const detectedDocType = classifyDocTypeHeuristic(fullText);
        console.log(`[Pipeline] Detected docType: ${detectedDocType || "unknown"}`);

        // === STEP 2: RAG Retrieval (UPSTREAM) ===
        const apiKey = GEMINI_API_KEY.value();
        const ragQuery = buildRAGQuery(fullText, detectedDocType || undefined);
        const contextChunks = await retrieveKBChunks(tid, ragQuery, apiKey, {
          topK: 6,
          minScore: 0.3,
        });

        // === STEP 3: Load Rulebook for docType ===
        const rulebookDoc = detectedDocType
          ? await getRulesForDocType(detectedDocType)
          : null;
        
        const rulebookRules = rulebookDoc
          ? rulebookDoc.checks.map((check) => ({
              id: check.id,
              description: check.description,
              normativeReference: check.normativeReferences.join(", "),
              evaluation: check.evaluation,
              field: check.field,
              deroghe: check.deroghe,
            }))
          : [];

        console.log(`[Pipeline] Loaded ${rulebookRules.length} rules for ${detectedDocType || "generic"}`);

        // === STEP 4: PII Redaction (if needed) ===
        const requiredPIIFields = detectedDocType ? getRequiredPIIFields(detectedDocType) : [];
        const needsPII = requiredPIIFields.length > 0;
        const processedText = redactPII(fullText, needsPII);

        // === STEP 5: Vertex Validation ===
        const validationResult = await validateDocument({
          fullText: processedText,
          docType: detectedDocType || undefined,
          contextChunks,
          rulebookRules,
          metadata: {
            filename: name,
          },
        });

        // Estraggo dati dal nuovo schema
        finalDocType = validationResult.doc.docType;
        finalDecision = validationResult.overall.isValid ? "idoneo" : "non_idoneo";
        finalReason = validationResult.overall.reasons?.[0]?.message || "Validated";
        finalConfidence = validationResult.overall.confidence;
        computedFields = {
          issuedAt: validationResult.extracted.issuedAt,
          expiresAt: validationResult.extracted.expiresAt,
          daysToExpiry: null,
        };
        validationCitations = validationResult.citations;

        // === STEP 6: Deterministic Rules Override (DURC 120 days) ===
        if (finalDocType === "DURC" && computedFields.issuedAt) {
          const issuedDate = new Date(computedFields.issuedAt);
          const today = new Date();
          const daysDiff = Math.floor((today.getTime() - issuedDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff > 120) {
            console.log(`[Pipeline] DURC OVERRIDE: ${daysDiff} days > 120, marking as non_idoneo`);
            finalDecision = "non_idoneo";
            finalReason = `DURC scaduto: ${daysDiff} giorni dalla emissione (max 120)`;
            finalConfidence = 1.0; // Deterministic
            // Update validationResult.overall for consistency
            validationResult.overall.isValid = false;
            validationResult.overall.status = "red";
          } else if (daysDiff >= 0) {
            // Valid
            computedFields.daysToExpiry = 120 - daysDiff;
            // Check for yellow (within 10 days)
            if (computedFields.daysToExpiry <= 10) {
              validationResult.overall.status = "yellow";
            }
          }
        }

        // Map citations to simple format for Firestore
        const citationRefs = validationCitations.map((c) => ({
          id: c.id,
          sourceId: c.sourceId || "",
          title: c.title || "",
          source: c.source || c.sourceId || "",
          page: c.page,
          snippet: c.snippet?.substring(0, 200) || "",
        }));

        // === STEP 7: Persistenza (schema aggiornato) ===
        await docRef.set(
          {
            // Campi base
            docType: finalDocType,
            status: validationResult.overall.status, // green/yellow/red/na
            isValid: validationResult.overall.isValid,
            nonPertinente: validationResult.overall.nonPertinente || false,
            reason: finalReason,
            confidence: finalConfidence,
            
            // Campi estratti
            issuedAt: computedFields.issuedAt || null,
            expiresAt: computedFields.expiresAt || null,
            daysToExpiry: computedFields.daysToExpiry || null,
            holder: validationResult.extracted.holder || null,
            identifiers: validationResult.extracted.identifiers || {},
            
            // Checks e citations
            checks: validationResult.checks,
            citations: citationRefs,
            
            // Metadata
            pages: null,
            ocrUsed,
            provider: "vertex-ai",
            schemaVersion: validationResult.schemaVersion,
            audit: validationResult.audit,
            lastProcessedGen: generation,
            contentHash,
            updatedAt: new Date(),
          },
          { merge: true }
        );

        console.log(`[Pipeline] Done: ${finalDocType} → ${validationResult.overall.status} (confidence: ${finalConfidence})`);
      } else {
        // === FALLBACK: Old pipeline (emulator or USE_VERTEX=false) ===
        console.log("[Pipeline] Using legacy pipeline (emulator or USE_VERTEX=false)");
        
        let normalized: Normalized = { reason: "LLM skipped in emulator", confidence: 0.5 };
        if (!IS_EMULATOR) {
          const apiKey = GEMINI_API_KEY.value();
          normalized = await normalizeWithFallback(fullText, apiKey, {
            primary: "gemini-2.5-flash-lite",
            fallback: "gemini-2.5-flash",
            minConfidence: 0.75,
          });
        }

        const verdict = computeVerdict(normalized);

        await docRef.set(
          {
            docType: normalized.docType || "ALTRO",
            issuedAt: normalized.issuedAt || null,
            expiresAt: normalized.expiresAt || null,
            companyName: normalized.companyName || null,
            vatNumber: normalized.vatNumber || null,
            fiscalCode: normalized.fiscalCode || null,
            status: verdict.status,
            reason: verdict.reason,
            confidence: verdict.confidence,
            pages: null,
            ocrUsed,
            provider: "legacy",
            lastProcessedGen: generation,
            contentHash,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      }

      console.log("Done:", { path: docRef.path, status: finalDecision });
    } catch (err: any) {
      console.error("Pipeline error:", err?.message || err);
      try {
        const { tid, cid, docId } = parsePath(name!);
        await getFirestore()
          .doc(`tenants/${tid}/companies/${cid}/documents/${docId}`)
          .set(
            {
              status: "error",
              reason: (err?.message || "processing error").toString().slice(0, 500),
              updatedAt: new Date(),
            },
            { merge: true }
          );
      } catch (e) {
        console.error("Failed to write error status:", e);
      }
    }
  }
);
