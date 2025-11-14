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

function buildRagQuery(normalized: Normalized): string {
  // usa docType se disponibile; fallback generico DURC 120 gg
  if (normalized?.docType && normalized.docType !== "ALTRO") {
    return `Normativa ${normalized.docType} validità 120 giorni`;
  }
  return "Normativa cantiere DURC validità 120 giorni";
}

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
    // Rimuoviamo bucket filter per compatibilità emulator
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

      // === OCR ===
      // In emulator: non chiamiamo Document AI
      let fullText = "";
      let ocrUsed = false;

      if (IS_EMULATOR) {
        console.log("Emulator: skip Document AI OCR");
        // opzionale: fullText = "testo emulato";
      } else {
        const projectId = process.env.GCLOUD_PROJECT!;
        const processorId = DOC_AI_PROCESSOR_ID.value();
        console.log("Calling Document AI OCR (EU)...");
        const ocr = await docAiExtractPdf(buffer, { projectId, location: "eu", processorId });
        fullText = (ocr.text || "").trim();
        ocrUsed = true;
        console.log("OCR pages:", ocr.pages, " OCR text length:", fullText.length);
      }

      // === LLM normalizzazione ===
      let normalized: Normalized = { reason: "LLM skipped in emulator", confidence: 0.5 };
      if (!IS_EMULATOR) {
        const apiKey = GEMINI_API_KEY.value();
        normalized = await normalizeWithFallback(fullText, apiKey, {
          primary: "gemini-2.5-flash-lite",
          fallback: "gemini-2.5-flash",
          minConfidence: 0.75,
        });
      }

      // === Regole deterministiche ===
      const verdict = computeVerdict(normalized);

      // === Persistenza ===
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
          pages: null,            // se reintrodurrai il gating/ocr, valorizza
          ocrUsed,
          lastProcessedGen: generation,
          contentHash,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // === RAG References (citazioni da knowledge base) ===
      if (!IS_EMULATOR) {
        try {
          const topK = 4;
          const query = buildRagQuery(normalized);
          
          const projectId = process.env.GCLOUD_PROJECT!;
          const regionRAG = "europe-west1";
          const url = `https://${regionRAG}-${projectId}.cloudfunctions.net/kbSearch?tid=${encodeURIComponent(tid)}&q=${encodeURIComponent(query)}&k=${topK}`;

          const ragResp = await fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`kbSearch ${r.status}`))) as { results?: any[] };

          const ragRefs = (ragResp?.results || []).map(r => ({
            source: r.source,
            page: r.page,
            score: r.score
          })).slice(0, topK);

          await docRef.set({ ragRefs }, { merge: true });
          console.log(`[RAG] attached ${ragRefs.length} refs for query: ${query}`);
        } catch (e) {
          console.warn("[RAG] skip (kbSearch error):", (e as Error).message);
        }
      }

      console.log("Done:", { path: docRef.path, status: verdict.status });
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
