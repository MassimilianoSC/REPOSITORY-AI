import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import { embedTexts } from "./embed";

const REGION = "europe-west1";
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const kbSearch = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    minInstances: 0,
    secrets: [GEMINI_API_KEY],
  },
  async (req, res) => {
  try {
    const { tid, q, k } = req.query as any;
    const topK = Number(k || 4);
    if (!tid || !q) {
      res.status(400).send("tid and q are required");
      return;
    }

    const [qvec] = await embedTexts(GEMINI_API_KEY.value(), [String(q)]);

    const db = getFirestore();
    const coll = db.collection(`tenants/${tid}/kb_chunks`);

    // Prefiltro tenantId + nearest neighbors (COSINE)
    const vectorQuery = (coll as any)
      .where("tenantId", "==", tid)
      .findNearest({
        vectorField: "embedding",
        queryVector: qvec,
        limit: topK,
        distanceMeasure: "COSINE",
        distanceResultField: "score",
      });

    const snap = await vectorQuery.get();
    const results = snap.docs.map((d: any) => ({
      id: d.id,
      text: d.get("text"),
      source: d.get("source"),
      page: d.get("page"),
      score: d.get("score"),
    }));

    res.status(200).json({ results });
  } catch (e: any) {
    console.error(e);
    res.status(500).send(e?.message || "error");
  }
});

