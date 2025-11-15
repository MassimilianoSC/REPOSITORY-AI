/**
 * RAG Retriever - Vector search on Firestore kb_chunks
 */

import { getFirestore } from "firebase-admin/firestore";
import { embedTexts } from "../rag/embed";

export interface RetrievedChunk {
  id: string;
  source: string;
  page?: number;
  snippet: string;
  score?: number;
}

/**
 * Retrieve relevant chunks from KB using vector search
 */
export async function retrieveKBChunks(
  tid: string,
  queryText: string,
  apiKey: string,
  options: {
    topK?: number;
    minScore?: number;
    docTypeFilter?: string;
  } = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK || 6;
  const minScore = options.minScore || 0.3;

  const startTime = Date.now();

  try {
    // Generate query embedding
    const [queryVector] = await embedTexts(apiKey, [queryText]);

    const db = getFirestore();
    const coll = db.collection(`tenants/${tid}/kb_chunks`);

    // Vector search with tenant filter
    const vectorQuery = (coll as any)
      .where("tenantId", "==", tid)
      .findNearest({
        vectorField: "embedding",
        queryVector: queryVector,
        limit: topK,
        distanceMeasure: "COSINE",
        distanceResultField: "score",
      });

    const snap = await vectorQuery.get();

    const chunks: RetrievedChunk[] = snap.docs
      .map((doc: any) => ({
        id: `kb:${doc.get("source")}:p${doc.get("page")}`,
        source: doc.get("source"),
        page: doc.get("page"),
        snippet: doc.get("text") || "",
        score: doc.get("score"),
      }))
      .filter((chunk: RetrievedChunk) => {
        // Filter by min score
        if (chunk.score && chunk.score < minScore) return false;
        
        // Optional: filter by docType in source metadata (if available)
        // if (options.docTypeFilter && !chunk.source.includes(options.docTypeFilter)) return false;
        
        return true;
      });

    const latencyMs = Date.now() - startTime;
    console.log(`[RAG] Retrieved ${chunks.length}/${topK} chunks in ${latencyMs}ms (minScore=${minScore})`);

    return chunks;
  } catch (error: any) {
    console.error(`[RAG] Retrieval failed: ${error.message}`);
    return [];
  }
}

/**
 * Build query text from document and docType
 */
export function buildRAGQuery(fullText: string, docType?: string): string {
  if (docType) {
    // Specific query for docType
    return `Regole validazione ${docType} normativa sicurezza lavoro`;
  }

  // Generic query (fallback)
  return "Regole validazione documenti cantiere sicurezza lavoro normativa";
}

