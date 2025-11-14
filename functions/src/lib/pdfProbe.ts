// functions/src/lib/pdfProbe.ts

// Gating testo con PDF.js v3.x (build legacy CommonJS, stabile in Functions v2)
import type { PDFDocumentProxy } from "pdfjs-dist";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

export type ProbeResult = { text: string; pages: number; charsPerPage: number };

export async function probePdf(buffer: Buffer): Promise<ProbeResult> {
  // Disattiva il worker (non serve su Node)
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  }

  // Carica documento da buffer (PDF.js richiede Uint8Array, non Buffer)
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf: PDFDocumentProxy = await loadingTask.promise;

  const pages = pdf.numPages || 0;
  let fullText = "";

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content: any = await page.getTextContent();

    // Concatena le stringhe dei glifi
    const pageText = content.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .trim();

    fullText += (i > 1 ? "\n\n" : "") + pageText;
  }

  const text = fullText.trim();
  const charsPerPage = pages ? Math.round(text.length / pages) : text.length;

  return { text, pages, charsPerPage };
}
