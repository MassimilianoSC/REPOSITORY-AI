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
  const minScore = options.minScore || 0.1; // FIX: abbassato da 0.3 a 0.1 per COSINE similarity

  const startTime = Date.now();

  try {
    // Generate query embedding
    console.log(`[RAG] Generating embedding for query: "${queryText.substring(0, 100)}..."`);
    const [queryVector] = await embedTexts(apiKey, [queryText]);
    console.log(`[RAG] Embedding generated, vector length: ${queryVector.length}`);

    const db = getFirestore();
    const coll = db.collection(`tenants/${tid}/kb_chunks`);
    console.log(`[RAG] Querying collection: tenants/${tid}/kb_chunks`);

    // Vector search with tenant filter
    const vectorQuery = (coll as any)
      .where("tenantId", "==", tid)
      .findNearest({
        vectorField: "vector",  // FIXED: era "embedding", ora "vector" come nello script
        queryVector: queryVector,
        limit: topK,
        distanceMeasure: "COSINE",
        distanceResultField: "score",
      });

    console.log(`[RAG] Executing vector query (topK=${topK}, minScore=${minScore})`);
    const snap = await vectorQuery.get();
    console.log(`[RAG] Query returned ${snap.docs.length} raw results`);

    const chunks: RetrievedChunk[] = snap.docs
      .map((doc: any) => {
        const score = doc.get("score");
        const source = doc.get("sourceId") || doc.get("source"); // FIX: campo corretto
        const page = doc.get("page");
        console.log(`[RAG] Raw result: source=${source}, page=${page}, score=${score}`);
        return {
          id: `kb:${source}:p${page || 0}`,
          source,
          page,
          snippet: doc.get("text") || "",
          score,
        };
      })
      .filter((chunk: RetrievedChunk) => {
        // Filter by min score
        if (chunk.score && chunk.score < minScore) {
          console.log(`[RAG] Filtered out chunk ${chunk.id} (score ${chunk.score} < minScore ${minScore})`);
          return false;
        }
        if (!chunk.score) {
          console.log(`[RAG] Filtered out chunk ${chunk.id} (no score)`);
          return false;
        }
        
        // Optional: filter by docType in source metadata (if available)
        // if (options.docTypeFilter && !chunk.source.includes(options.docTypeFilter)) return false;
        
        console.log(`[RAG] Kept chunk ${chunk.id} (score ${chunk.score})`);
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

