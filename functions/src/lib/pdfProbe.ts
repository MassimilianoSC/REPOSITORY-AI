/**
 * PDF Text Probe using pdf.js
 * Extracts text from PDF to determine if OCR is needed
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

// Disable worker in Node.js environment
const pdfjs = pdfjsLib as any;
pdfjs.GlobalWorkerOptions.workerSrc = "";

export interface PdfProbeResult {
  pages: number;
  totalChars: number;
  charsPerPage: number[];
  minCharsPerPage: number;
  maxCharsPerPage: number;
  avgCharsPerPage: number;
  sample100: string; // First 100 chars for logging
  fullText: string;
}

/**
 * Probe PDF text content without OCR
 */
export async function pdfTextProbe(buffer: Buffer): Promise<PdfProbeResult> {
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdfDoc = await loadingTask.promise;

  const numPages = pdfDoc.numPages;
  const charsPerPage: number[] = [];
  let fullText = "";

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    charsPerPage.push(pageText.length);
    fullText += pageText + "\n";
  }

  const totalChars = fullText.length;
  const minCharsPerPage = charsPerPage.length > 0 ? Math.min(...charsPerPage) : 0;
  const maxCharsPerPage = charsPerPage.length > 0 ? Math.max(...charsPerPage) : 0;
  const avgCharsPerPage = numPages > 0 ? totalChars / numPages : 0;
  const sample100 = fullText.substring(0, 100).replace(/\s+/g, " ").trim();

  return {
    pages: numPages,
    totalChars,
    charsPerPage,
    minCharsPerPage,
    maxCharsPerPage,
    avgCharsPerPage,
    sample100,
    fullText,
  };
}
