// OCR fallback con Document AI (EU)
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { getStorage } from "firebase-admin/storage";

const DEFAULT_LOCATION = process.env.DOC_AI_LOCATION || "eu";

// OCR sincrono per PDF brevi
export async function ocrWithDocAI(params: {
  projectId: string;
  processorId: string;
  location?: string;
  fileBytes: Buffer;
}): Promise<string[]> {
  const { projectId, processorId, fileBytes, location = DEFAULT_LOCATION } = params;
  if (!projectId || !processorId) throw new Error("Missing projectId/processorId for Document AI");

  const client = new DocumentProcessorServiceClient({ apiEndpoint: `${location}-documentai.googleapis.com` });
  const name = client.processorPath(projectId, location, processorId);

  const [result] = await client.processDocument({
    name,
    rawDocument: { content: fileBytes.toString("base64"), mimeType: "application/pdf" },
  } as any);

  const doc = result.document;
  if (!doc?.pages?.length) return [];

  const fullText = doc.text || "";
  return doc.pages.map((p: any) => {
    const segs = p.layout?.textAnchor?.textSegments || [];
    return segs.map((s: any) =>
      fullText.substring(Number(s.startIndex || 0), Number(s.endIndex || 0))
    ).join("");
  });
}

// NEW: OCR batch/async su GCS per PDF lunghi
export async function ocrBatchWithDocAI(params: {
  projectId: string;
  processorId: string;
  location?: string;
  gcsInputUri: string;             // es: gs://<bucket>/<path/to/file.pdf>
  gcsOutputPrefix: string;         // es: docai_batch/kb/xyz123/
}): Promise<string[]> {
  const { projectId, processorId, gcsInputUri, gcsOutputPrefix, location = DEFAULT_LOCATION } = params;
  if (!projectId || !processorId) throw new Error("Missing projectId/processorId for Document AI");
  if (!gcsInputUri.startsWith("gs://")) throw new Error("gcsInputUri must be a gs:// URI");

  const client = new DocumentProcessorServiceClient({ apiEndpoint: `${location}-documentai.googleapis.com` });
  const name = client.processorPath(projectId, location, processorId);

  // Estrai bucket dal gcsInputUri
  const m = /^gs:\/\/([^/]+)\/(.*)$/.exec(gcsInputUri);
  if (!m) throw new Error("Invalid gcsInputUri");
  const inputBucket = m[1];

  // LRO: batchProcessDocuments (GCS → GCS)
  const request: any = {
    name,
    inputDocuments: {
      gcsDocuments: {
        documents: [{ gcsUri: gcsInputUri, mimeType: "application/pdf" }],
      },
    },
    documentOutputConfig: {
      gcsOutputConfig: {
        gcsUri: `gs://${inputBucket}/${gcsOutputPrefix}`,
      },
    },
  };

  const [operation] = await client.batchProcessDocuments(request);
  await operation.promise(); // attende completamento

  // Leggi output JSON da gcsOutputPrefix
  const storage = getStorage();
  const bucket = storage.bucket(inputBucket);
  const [files] = await bucket.getFiles({ prefix: gcsOutputPrefix });
  const jsonFiles = files.filter(f => f.name.endsWith(".json"));

  const pages: string[] = [];

  for (const f of jsonFiles) {
    const [buf] = await f.download();
    const payload = JSON.parse(buf.toString("utf8"));
    const doc = payload.document;
    if (!doc?.pages?.length) continue;

    const fullText = doc.text || "";
    for (const p of doc.pages) {
      const segs = p.layout?.textAnchor?.textSegments || [];
      const txt = segs.map((s: any) =>
        fullText.substring(Number(s.startIndex || 0), Number(s.endIndex || 0))
      ).join("");
      pages.push(txt);
    }
  }

  return pages;
}

