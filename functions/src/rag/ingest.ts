import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { makeChunks } from "./chunk";
import { embedTexts } from "./embed";
import { ocrWithDocAI, ocrBatchWithDocAI } from "./ocr";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const REGION = "europe-west1";
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DOC_AI_PROCESSOR_ID = defineSecret("DOC_AI_PROCESSOR_ID");

// Config parameters (use process.env to avoid deploy timeout)
const KB_OCR_ENABLED = process.env.KB_OCR_ENABLED || "false";
const DOC_AI_LOCATION = process.env.DOC_AI_LOCATION || "eu";
const DOC_AI_BATCH_MIN_PAGES = Number(process.env.DOC_AI_BATCH_MIN_PAGES || "31");
const DOC_AI_BATCH_OUTPUT_PREFIX = process.env.DOC_AI_BATCH_OUTPUT_PREFIX || "docai_batch/kb/";
const MIN_TEXT_LEN = 200;

export const kbIngestFromStorage = onRequest(
  {
    region: REGION,
    timeoutSeconds: 540,    // HOTFIX 2: max per HTTP v2
    memory: "2GiB",         // HOTFIX 2: da 1GiB -> 2GiB
    secrets: [GEMINI_API_KEY, DOC_AI_PROCESSOR_ID],
  },
  async (req, res) => {
    try {
      const { tid, storagePath, source, forceOcr } = req.query as any;
      if (!tid || !storagePath) {
        res.status(400).send("tid and storagePath are required");
        return;
      }

      console.log("[KB] Start", { storagePath, tid, source });

      const bucket = getStorage().bucket();
      const file = bucket.file(String(storagePath));
      const [buf] = await file.download();
      
      console.log("[KB] File downloaded", { size: buf.length, path: storagePath });

      // === 1) Detect file type and extract text
      let totalPages = 0;
      let chunksPerPage: { text: string; page: number }[] = [];
      const fileExt = String(storagePath).toLowerCase().split('.').pop();
      const isTxtFile = fileExt === 'txt';

      if (isTxtFile) {
        // === TXT file: parse directly as UTF-8 text
        console.log("[KB] Processing TXT file...");
        const fullText = buf.toString('utf-8').trim();
        
        if (fullText) {
          // Split into chunks (treat whole file as single "page")
          const pcs = makeChunks(fullText, 1000, 150).map(t => ({ text: t, page: 1 }));
          chunksPerPage.push(...pcs);
          totalPages = 1; // logical page
          console.log(`[KB] TXT parsed: ${chunksPerPage.length} chunks, ${fullText.length} chars`);
        } else {
          console.warn("[KB] TXT file is empty");
        }
      } else {
        // === PDF file: parse with pdf.js
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = false;
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          totalPages = pdf.numPages || 0;

          for (let p = 1; p <= totalPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const text = content.items.map((it: any) => it.str || "").join(" ").trim();
            if (!text) continue;

            const pcs = makeChunks(text, 1000, 150).map(t => ({ text: t, page: p }));
            chunksPerPage.push(...pcs);
          }
        } catch (e) {
          console.warn("[KB] pdf.js parse error:", (e as Error).message);
        }
      }

      const totalChars = chunksPerPage.reduce((acc, c) => acc + c.text.length, 0);
      const avgCharsPerChunk = chunksPerPage.length > 0 ? Math.round(totalChars / chunksPerPage.length) : 0;
      
      console.log("[KB] PDF probe", { 
        pages: totalPages, 
        totalChars, 
        initialChunks: chunksPerPage.length,
        avgCharsPerChunk,
        isTxt: isTxtFile
      });
      
      const batchMin = DOC_AI_BATCH_MIN_PAGES;
      const ocrEnabled = String(KB_OCR_ENABLED).toLowerCase() === "true" || String(forceOcr) === "1";
      const needsBatch = totalPages >= batchMin;                // soglia pagine
      const needsSyncOcr = !needsBatch && totalChars < MIN_TEXT_LEN; // poco testo → OCR sync
      
      console.log("[KB] OCR check", { ocrEnabled, needsBatch, needsSyncOcr, isTxtFile });

      // === 2) OCR se necessario (skip per file TXT)
      if (!isTxtFile && ocrEnabled && (needsBatch || needsSyncOcr)) {
        const projectId = process.env.GCLOUD_PROJECT!;
        const processorId = DOC_AI_PROCESSOR_ID.value();
        const location = DOC_AI_LOCATION;

        if (needsBatch) {
          // Usa batch/async su GCS: input = gs://<bucket>/<storagePath>
          const gcsInputUri = `gs://${bucket.name}/${storagePath}`;
          const outPrefix = `${DOC_AI_BATCH_OUTPUT_PREFIX}${Date.now()}_${Math.floor(Math.random()*1e6)}/`;

          console.log(`[KB] Running Document AI BATCH OCR (${totalPages} pages) -> ${outPrefix}`);
          const pages = await ocrBatchWithDocAI({
            projectId, processorId, location,
            gcsInputUri,
            gcsOutputPrefix: outPrefix,
          });

          // rigenera chunks
          chunksPerPage = [];
          pages.forEach((text, idx) => {
            if (!text?.trim()) return;
            const pcs = makeChunks(text, 1000, 150).map(t => ({ text: t, page: idx + 1 }));
            chunksPerPage.push(...pcs);
          });
        } else if (needsSyncOcr) {
          console.log("[KB] Running Document AI SYNC OCR (low native text)...");
          const pages = await ocrWithDocAI({
            projectId, processorId, location,
            fileBytes: buf,
          });

          chunksPerPage = [];
          pages.forEach((text, idx) => {
            if (!text?.trim()) return;
            const pcs = makeChunks(text, 1000, 150).map(t => ({ text: t, page: idx + 1 }));
            chunksPerPage.push(...pcs);
          });
        }
      }

      if (chunksPerPage.length === 0) {
        console.error("[KB] No chunks extracted", { totalChars, pages: totalPages, isTxt: isTxtFile });
        res.status(200).send("No text extracted");
        return;
      }

      console.log("[KB] Chunking done", { 
        chunks: chunksPerPage.length, 
        totalChars: chunksPerPage.reduce((acc, c) => acc + c.text.length, 0),
        avgLen: Math.round(chunksPerPage.reduce((acc, c) => acc + c.text.length, 0) / chunksPerPage.length)
      });

      // === 3) Embedding + write (FieldValue.vector)
      console.log("[KB] Starting embedding", { batchSize: chunksPerPage.length });
      const vectors = await embedTexts(GEMINI_API_KEY.value(), chunksPerPage.map(c => c.text));
      console.log("[KB] Embedding done", { vectors: vectors.length });

      const db = getFirestore();
      const col = db.collection(`tenants/${tid}/kb_chunks`);
      const now = new Date();

      await Promise.all(chunksPerPage.map((c, i) =>
        col.add({
          tenantId: tid,
          text: c.text,
          source: source || storagePath,
          page: c.page,
          embedding: FieldValue.vector(vectors[i]),
          createdAt: now,
        })
      ));

      console.log("[KB] Saved", { kbChunks: chunksPerPage.length, collection: `tenants/${tid}/kb_chunks` });

      const mode = (totalPages >= DOC_AI_BATCH_MIN_PAGES) ? " (with OCR BATCH)" :
                   (totalChars < MIN_TEXT_LEN && ocrEnabled) ? " (with OCR SYNC)" :
                   "";

      res.status(200).send(`Ingested ${chunksPerPage.length} chunks from ${storagePath}${mode}`);
    } catch (e: any) {
      console.error(e);
      res.status(500).send(e?.message || "error");
    }
  }
);
