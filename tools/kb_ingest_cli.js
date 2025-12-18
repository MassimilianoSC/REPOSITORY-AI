/* tools/kb_ingest_cli.js */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Firestore, FieldValue } = require("@google-cloud/firestore");

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-004";
const VECTOR_DIM = Number(process.env.VECTOR_DIM || 768);
const TID = process.env.TID || "tenant-demo";

if (!PROJECT) {
  console.error("Imposta GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT.");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("Imposta GEMINI_API_KEY.");
  process.exit(1);
}

const db = new Firestore({ projectId: PROJECT });

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const k = a.replace(/^--/, "");
      const v = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      out[k] = v;
    } else {
      (out._ = out._ || []).push(a);
    }
  }
  return out;
}

function toArrayCsv(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

function chunkBySentences(text, maxChars = 1200, overlap = 200) {
  const sentences = text.replace(/\r/g, "").split(/(?<=[\.\?!])\s+(?=[A-ZÀ-ÖØ-Ý])/u);
  const chunks = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > maxChars) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = (buf.slice(-overlap) || "") + (buf ? " " : "") + s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function sha1(s) { return crypto.createHash("sha1").update(s).digest("hex"); }

let _genAI;
async function getGenAI() {
  if (!_genAI) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    _genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return _genAI;
}

async function embedText(text) {
  const genAI = await getGenAI();
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  
  // API corretta per text-embedding-004 (uguale al backend)
  const result = await model.embedContent({
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT"
  });
  
  const v = result?.embedding?.values;
  if (!Array.isArray(v) || !v.length) {
    throw new Error("Embedding vuoto");
  }
  
  if (VECTOR_DIM && v.length !== VECTOR_DIM) {
    console.warn(`Embedding ${v.length} ≠ VECTOR_DIM ${VECTOR_DIM} (verifica indice Firestore).`);
  }
  
  return v;
}

function buildEmbedPayload({ chunk, sourceId, docTypeTargets, ruleIds, page }) {
  const header = [
    sourceId ? `Fonte: ${sourceId}` : "",
    docTypeTargets?.length ? `DocType: ${docTypeTargets.join("|")}` : "",
    ruleIds?.length ? `Regole: ${ruleIds.join("|")}` : "",
    Number.isFinite(page) ? `Pagina: ${page}` : ""
  ].filter(Boolean).join(" · ");
  return header ? `${header}\n\n${chunk}` : chunk;
}

async function ingestTxtFile(filePath, opt) {
  const raw = await fs.readFile(filePath, "utf8");
  const cleaned = raw
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const chunks = chunkBySentences(cleaned, Number(opt.maxChars || 1200), Number(opt.overlap || 200));
  console.log(`→ TXT ${path.basename(filePath)}: ${chunks.length} chunk`);
  let saved = 0;
  for (let i = 0; i < chunks.length; i++) {
    const payload = buildEmbedPayload({
      chunk: chunks[i],
      sourceId: opt.sourceId || path.basename(filePath, path.extname(filePath)),
      docTypeTargets: opt.docTypeTargets,
      ruleIds: opt.ruleIds,
    });
    const vector = await embedText(payload);
    const contentHash = sha1(payload);
    const ref = db.doc(`tenants/${opt.tid}/kb_chunks/${contentHash}`);
    await ref.set({
      tenantId: opt.tid,
      sourceType: "txt",
      sourceId: opt.sourceId || path.basename(filePath, path.extname(filePath)),
      sourceFile: path.basename(filePath),
      text: chunks[i],
      docTypeTargets: opt.docTypeTargets || [],
      ruleIds: opt.ruleIds || [],
      vector: FieldValue.vector(vector),
      contentHash,
      lang: "it",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (i % 5 === 0) process.stdout.write(".");
    saved++;
  }
  console.log(`\n✓ Salvati ${saved} chunk (TXT)`);
}

async function extractPdfPages(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = await fs.readFile(filePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map((it) => it.str).join(" ").replace(/[ \u00A0]{2,}/g, " ").trim();
    if (text.length >= 30) pages.push({ page: p, text });
  }
  return pages;
}

async function ingestPdfFile(filePath, opt) {
  const pages = await extractPdfPages(filePath);
  console.log(`→ PDF ${path.basename(filePath)}: ${pages.length} pagine utili`);
  let saved = 0;
  for (const pg of pages) {
    const chunks = chunkBySentences(pg.text, Number(opt.maxChars || 1200), Number(opt.overlap || 200));
    for (let i = 0; i < chunks.length; i++) {
      const payload = buildEmbedPayload({
        chunk: chunks[i],
        sourceId: opt.sourceId || path.basename(filePath, path.extname(filePath)),
        docTypeTargets: opt.docTypeTargets,
        ruleIds: opt.ruleIds,
        page: pg.page
      });
      const vector = await embedText(payload);
      const contentHash = sha1(payload);
      const ref = db.doc(`tenants/${opt.tid}/kb_chunks/${contentHash}`);
      await ref.set({
        tenantId: opt.tid,
        sourceType: "pdf",
        sourceId: opt.sourceId || path.basename(filePath, path.extname(filePath)),
        sourceFile: path.basename(filePath),
        page: pg.page,
        text: chunks[i],
        docTypeTargets: opt.docTypeTargets || [],
        ruleIds: opt.ruleIds || [],
        vector: FieldValue.vector(vector),
        contentHash,
        lang: "it",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (i % 5 === 0) process.stdout.write(".");
      saved++;
    }
  }
  console.log(`\n✓ Salvati ${saved} chunk (PDF)`);
}

async function run() {
  const args = parseArgs();
  const tid = args.tid || TID;
  const docTypeTargets = toArrayCsv(args.docTypeTargets);
  const ruleIds = toArrayCsv(args.ruleIds);

  async function ingestOne(fp, opt) {
    const ext = path.extname(fp).toLowerCase();
    if (ext === ".txt") return ingestTxtFile(fp, opt);
    if (ext === ".pdf") return ingestPdfFile(fp, opt);
    throw new Error(`Estensione non supportata: ${ext}`);
  }

  if (args.manifest) {
    const manifest = JSON.parse(await fs.readFile(path.resolve(String(args.manifest)), "utf8"));
    for (const m of manifest) {
      if (!m.file) continue;
      await ingestOne(path.resolve(m.file), {
        tid,
        sourceId: m.sourceId || path.basename(m.file, path.extname(m.file)),
        docTypeTargets: m.docTypeTargets || [],
        ruleIds: m.ruleIds || [],
        maxChars: m.maxChars || args.maxChars,
        overlap: m.overlap || args.overlap,
      });
    }
    return;
  }

  if (!args.file) {
    console.error("Uso:");
    console.error("  node tools/kb_ingest_cli.js --file ./kb_txt/DM_2015_01_30_DURC_online.txt --sourceId DURC_online --docTypeTargets DURC --ruleIds durc_validita_120d");
    console.error("  node tools/kb_ingest_cli.js --file ./kb_pdf/ASR_2025_n59_preposti.pdf --sourceId ASR_2025 --docTypeTargets FORMAZIONE --ruleIds preposti_12h");
    console.error("  node tools/kb_ingest_cli.js --manifest ./tools/kb_manifest_all.json");
    process.exit(2);
  }

  await ingestOne(path.resolve(String(args.file)), {
    tid,
    sourceId: args.sourceId,
    docTypeTargets,
    ruleIds,
    maxChars: args.maxChars,
    overlap: args.overlap,
  });
}

run().catch((e) => {
  console.error("\n✗ ERRORE KB INGEST:", e);
  process.exit(1);
});

