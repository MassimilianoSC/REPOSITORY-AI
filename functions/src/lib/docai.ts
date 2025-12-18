import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export type DocAiConfig = {
  projectId: string;
  location: "eu" | "us";
  processorId: string;
};

export async function docAiExtractPdf(
  pdfBuffer: Buffer,
  cfg: DocAiConfig
): Promise<{ text: string; pages: number }> {
  // Endpoint EU coerente con il processor
  const client = new DocumentProcessorServiceClient({
    apiEndpoint: `${cfg.location}-documentai.googleapis.com`,
  });

  const name = `projects/${cfg.projectId}/locations/${cfg.location}/processors/${cfg.processorId}`;

  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: pdfBuffer.toString("base64"),
      mimeType: "application/pdf",
    },
  });

  const doc = result.document;
  return {
    text: doc?.text ?? "",
    pages: (doc?.pages?.length as number) || 0,
  };
}

