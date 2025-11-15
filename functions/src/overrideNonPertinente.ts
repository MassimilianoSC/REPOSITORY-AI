/**
 * Cloud Function callable: overrideNonPertinente
 * Permette a verifier/manager di marcare un documento come "non pertinente (quindi idoneo)"
 * con motivazione obbligatoria e audit completo
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

interface OverrideRequest {
  docPath: string; // "tenants/{tid}/companies/{cid}/documents/{docId}"
  nonPertinente: boolean;
  reason: string;
}

export const overrideNonPertinente = onCall<OverrideRequest>(
  { region: "europe-west1" },
  async (request) => {
    const { data, auth } = request;

    // 1. Auth check
    if (!auth) {
      throw new HttpsError("unauthenticated", "Autenticazione richiesta");
    }

    const userEmail = auth.token.email || "";
    const userRole = auth.token.role as string | undefined;

    // 2. RBAC check
    if (userRole !== "verifier" && userRole !== "manager") {
      throw new HttpsError(
        "permission-denied",
        "Solo verificatori e manager possono applicare override"
      );
    }

    // 3. Input validation
    if (!data.docPath || typeof data.nonPertinente !== "boolean") {
      throw new HttpsError("invalid-argument", "docPath e nonPertinente obbligatori");
    }

    if (data.nonPertinente && !data.reason?.trim()) {
      throw new HttpsError("invalid-argument", "Motivazione obbligatoria per override");
    }

    const db = getFirestore();
    const docRef = db.doc(data.docPath);

    try {
      // 4. Check document exists
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Documento non trovato");
      }

      // 5. Apply override (schema piano dev con audit arrayUnion)
      await docRef.update({
        "overall.status": data.nonPertinente ? "green" : docSnap.data()?.overall?.status || "gray",
        "overall.nonPertinente": data.nonPertinente,
        "overall.nonPertinenteReason": data.nonPertinente ? data.reason : null,
        "overall.decidedBy": data.nonPertinente ? auth.uid : null,
        "overall.decidedByEmail": data.nonPertinente ? userEmail : null,
        "overall.decidedAt": data.nonPertinente ? FieldValue.serverTimestamp() : null,
        needsReview: !data.nonPertinente, // Esce dalla coda se marcato non pertinente
        audit: FieldValue.arrayUnion({
          event: "override_non_pertinente",
          by: auth.uid,
          byEmail: userEmail,
          reason: data.reason,
          at: FieldValue.serverTimestamp(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(JSON.stringify({
        type: "override_non_pertinente",
        docPath: data.docPath,
        byEmail: userEmail,
        byRole: userRole,
        nonPertinente: data.nonPertinente,
        reason: data.reason,
        timestamp: new Date().toISOString(),
      }));

      return {
        success: true,
        message: "Override applicato con successo",
      };
    } catch (error: any) {
      console.error("Error in overrideNonPertinente:", error);
      throw new HttpsError("internal", error.message || "Errore interno");
    }
  }
);
