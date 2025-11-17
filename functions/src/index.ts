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
import { classifyDocTypeHeuristic, getRulesForDocType, getRequiredPIIFields, getRequiredDocTypes } from "./lib/rulebookLoader";
import { pdfTextProbe } from "./lib/pdfProbe";
import { createVersionedDocument } from "./versioning/documentVersioning";
import { getRiskClassByAteco } from "./lib/ateco";
import { recomputeCompanyAggregate } from "./aggregates/companyStatus";
import { queueEmail, getVerifierEmailsForCompany, getUploaderEmail } from "./lib/email";

initializeApp();

// Export RAG functions
export { kbIngestFromStorage } from "./rag/ingest";

// Export callable functions
export { overrideNonPertinente } from "./overrideNonPertinente";
export { kbSearch } from "./rag/query";
export { deleteDocument } from "./documents/deleteDocument";
export { purgeTrash } from "./documents/purgeTrash";

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
    const { name, bucket, contentType = "", size = "0", generation, metageneration } = event.data;
    
    console.log("🔔 Storage trigger fired:", { bucket, name, contentType, size, generation, metageneration });
    
    // ⚠️ FIX BUG #2: Idempotenza metageneration (evita doppie scritture su retry)
    // NOTA: metageneration è una stringa, non un numero!
    if (metageneration && String(metageneration) !== '1') {
      console.log(`[processUpload] ⏭️ Skip: metageneration != 1 (${metageneration})`);
      return;
    }
    
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

      // ⚠️ FIX: Permettiamo re-upload di documenti eliminati
      if (prev?.isDeleted || prev?.deletedAt) {
        console.log(`[processUpload] Re-uploading previously deleted document: ${docId}`);
        // NON facciamo skip, procediamo con il processing per "resuscitare" il documento
      } else if (prev?.lastProcessedGen === generation && prev?.contentHash === contentHash) {
        // Idempotenza: già processato con stesso generation e contentHash
        console.log("Already processed, skip:", { name, generation });
        return;
      }

      // ⚠️ FIX BUG #2 & #3: Stub iniziale NON current, con isDeleted=false
      await docRef.set({
        isDeleted: false,
        isCurrent: false,               // Solo a fine pipeline diventa true
        status: 'na',
        blobName: name,                 // FIX BUG #1: salva subito per UI timeline
        pipelineStage: 'gating',        // FIX BUG #1: tracking step-by-step
        tenantId: tid,
        companyId: cid,
        updatedAt: new Date(),
      }, { merge: true });

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

        // === MONITORING LOG: OCR Decision (Step 8F) ===
        console.log(JSON.stringify({
          type: "ocr_decision",
          docId: name,
          totalChars: probe.totalChars,
          charsPerPage: probe.charsPerPage,
          minCharsPerPage: probe.minCharsPerPage,
          maxCharsPerPage: probe.maxCharsPerPage,
          avgCharsPerPage: probe.avgCharsPerPage,
          timestamp: new Date().toISOString(),
        }));

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

      // ⚠️ FIX BUG #1: Aggiorna pipeline dopo OCR
      if (ocrUsed) {
        await docRef.set({ pipelineStage: 'ocr', ocrDone: true, updatedAt: new Date() }, { merge: true });
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

        // === STEP 1.5: Get company ATECO and risk class ===
        const companyRef = getFirestore().doc(`tenants/${tid}/companies/${cid}`);
        const companySnap = await companyRef.get();
        const companyData = companySnap.exists ? companySnap.data() : null;
        const companyAteco: string | null = companyData?.ateco ?? null;
        const companyRiskClass = companyData?.riskClass ?? getRiskClassByAteco(companyAteco) ?? null;
        
        console.log(`[Pipeline] Company ATECO: ${companyAteco ?? "none"}, Risk Class: ${companyRiskClass ?? "none"}`);

        // === STEP 2: RAG Retrieval (UPSTREAM) ===
        await docRef.set({ pipelineStage: 'rag', updatedAt: new Date() }, { merge: true }); // FIX BUG #1
        const apiKey = GEMINI_API_KEY.value();
        const ragQuery = buildRAGQuery(fullText, detectedDocType || undefined);
        const contextChunks = await retrieveKBChunks(tid, ragQuery, apiKey, {
          topK: 6,
          minScore: 0.3,
        });
        await docRef.set({ ragHits: contextChunks.length, updatedAt: new Date() }, { merge: true }); // FIX BUG #1

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

        // === STEP 6.5: Calcola needsReview (8A Logic - Piano Dev) ===
        // needsReview = true se:
        // - status red/yellow
        // - confidence < 0.7
        // - docType mancante
        const needsReview = 
          validationResult.overall.status !== 'green' ||
          (validationResult.overall.confidence ?? 1) < 0.7 ||
          !validationResult.doc?.docType;

        // Motivo sintetico per coda verificatore
        const needsReviewReason = (() => {
          if (validationResult.overall.status !== 'green') return `status=${validationResult.overall.status}`;
          if ((validationResult.overall.confidence ?? 1) < 0.7) return 'low_confidence';
          if (!validationResult.doc?.docType) return 'docType_missing';
          return 'manual';
        })();

        // ⚠️ FIX BUG #1: Aggiorna pipeline prima di salvare risultati finali
        await docRef.set({ pipelineStage: 'vertex', validation: validationResult, updatedAt: new Date() }, { merge: true });

        // === STEP 7: Persistenza (schema aggiornato) ===
        // Calcola priority: red=3, yellow=2, green=1, gray=0
        const priority = 
          validationResult.overall.status === 'red' ? 3 :
          validationResult.overall.status === 'yellow' ? 2 :
          validationResult.overall.status === 'green' ? 1 : 0;

        const payload = {
          // ⚠️ FIX BUG #2 & #3: Flags finali
          isDeleted: false,                         // FIX BUG #3: documento attivo
          isCurrent: true,                          // FIX BUG #2: SOLO ora diventa current
          pipelineStage: 'done',                    // FIX BUG #1: pipeline completata
          
          // Campi base
          docType: finalDocType,
          status: validationResult.overall.status, // green/yellow/red/na
          isValid: validationResult.overall.isValid,
          nonPertinente: validationResult.overall.nonPertinente || false,
          needsReview, // Campo per coda verificatore
          needsReviewReason, // Motivo sintetico (status, low_confidence, docType_missing, etc.)
          priority, // Per ordinamento coda (red > yellow > green > gray)
          tenantId: tid, // Per query collectionGroup
          companyId: cid, // Per filtrare per azienda
          companyAteco: companyAteco ?? null, // ATECO azienda
          companyRiskClass: companyRiskClass ?? null, // Classe rischio (basso/medio/alto)
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
          blobName: name, // Path completo in Storage per tracking UI
          updatedAt: new Date(),
        };

        // Feature flag: versioning con idempotenza
        const ENABLE_VERSIONING = (process.env.ENABLE_VERSIONING ?? 'false') === 'true';

        if (ENABLE_VERSIONING) {
          const versioningResult = await createVersionedDocument({
            db: getFirestore(),
            tenantId: tid,
            companyId: cid,
            docType: finalDocType,
            storagePath: name,
            contentHash,
            data: payload,
            enableIdempotency: true,
          });

          console.log(`[Versioning] ${versioningResult.didCreateNewVersion ? 'New version' : 'Idempotent'}: v${versioningResult.version} (id: ${versioningResult.newId})`);
        } else {
          // Fallback: comportamento attuale senza versioning
          await docRef.set(payload, { merge: true });
        }

        // === STEP 7.5: Aggregazione stato azienda ===
        try {
          const requiredDocTypes = getRequiredDocTypes();
          await recomputeCompanyAggregate(tid, cid, requiredDocTypes);
          console.log(`[Aggregate] Company ${cid} status updated`);
        } catch (aggErr: any) {
          console.error(`[Aggregate] Failed to update company status:`, aggErr);
          // Non blocchiamo il flusso se l'aggregazione fallisce
        }

        // === STEP 7.6: Email notifications ===
        try {
          const documentId = docId; // ID del documento per riferimento

          // A) Documento in coda verifica
          if (needsReview) {
            const verifierEmails = getVerifierEmailsForCompany(tid, cid);
            if (verifierEmails.length > 0) {
              const companyName = companyData?.name || cid;
              await queueEmail(
                verifierEmails,
                `🔔 Nuovo documento da verificare – ${companyName} / ${finalDocType}`,
                `<p>È stato caricato un nuovo documento <b>${finalDocType}</b> per <b>${companyName}</b> (ID: ${documentId}).</p>
                 <p>Motivo revisione: ${needsReviewReason}</p>`,
                `Nuovo documento da verificare: ${finalDocType} per ${companyName}`
              );
            }
          }

          // B) Documento NON idoneo
          if (finalDecision === 'non_idoneo') {
            const uploaderEmail = companyData?.uploadedByEmail || null;
            if (uploaderEmail) {
              const companyName = companyData?.name || cid;
              await queueEmail(
                [uploaderEmail],
                `⚠️ Documento non idoneo – ${companyName} / ${finalDocType}`,
                `<p>Il documento <b>${finalDocType}</b> caricato per <b>${companyName}</b> non è risultato idoneo.</p>
                 <p><b>Motivo:</b> ${finalReason || 'Non specificato'}</p>
                 <p>Si prega di caricare un documento conforme.</p>`,
                `Documento non idoneo: ${finalDocType} per ${companyName}. Motivo: ${finalReason}`
              );
            }
          }
        } catch (emailErr: any) {
          console.error(`[Email] Failed to queue notifications:`, emailErr);
          // Non blocchiamo il flusso se le email falliscono
        }

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
