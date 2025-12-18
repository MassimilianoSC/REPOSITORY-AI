import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = process.env.RAG_EMBED_MODEL || "text-embedding-004";
const DIM = Number(process.env.RAG_EMBED_DIM || 768);

export async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });

  // Sintassi corretta per text-embedding-004
  const results: number[][] = [];
  
  for (const text of texts) {
    // @ts-ignore: embedContent è valido sui modelli embedding
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT"
    });
    
    const embedding = (result as any)?.embedding?.values;
    if (!Array.isArray(embedding)) {
      throw new Error("Invalid embedding response");
    }
    results.push(embedding);
  }

  return results;
}

