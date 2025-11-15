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
    timeoutSeconds: 180,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY, DOC_AI_PROCESSOR_ID],
  },
  async (req, res) => {
    try {
      const { tid, storagePath, source, forceOcr } = req.query as any;
      if (!tid || !storagePath) {
        res.status(400).send("tid and storagePath are required");
        return;
      }

      const bucket = getStorage().bucket();
      const file = bucket.file(String(storagePath));
      const [buf] = await file.download();

      // === 1) Leggiamo con pdf.js per capire pagine + testo nativo
      let totalPages = 0;
      let chunksPerPage: { text: string; page: number }[] = [];

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

      const totalChars = chunksPerPage.reduce((acc, c) => acc + c.text.length, 0);
      const batchMin = DOC_AI_BATCH_MIN_PAGES;
      const ocrEnabled = String(KB_OCR_ENABLED).toLowerCase() === "true" || String(forceOcr) === "1";
      const needsBatch = totalPages >= batchMin;                // soglia pagine
      const needsSyncOcr = !needsBatch && totalChars < MIN_TEXT_LEN; // poco testo → OCR sync

      // === 2) OCR se necessario
      if (ocrEnabled && (needsBatch || needsSyncOcr)) {
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
        res.status(200).send("No text extracted");
        return;
      }

      // === 3) Embedding + write (FieldValue.vector)
      const vectors = await embedTexts(GEMINI_API_KEY.value(), chunksPerPage.map(c => c.text));

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
