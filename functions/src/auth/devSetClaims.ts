import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";

const REGION = "europe-west1";

// NON deployare in produzione. Usala solo con Emulator o accesso limitato.
export const devSetClaims = onRequest({ region: REGION }, async (req, res) => {
  try {
    const { uid, tenant_id, role, company_id } = req.query as any;
    if (!uid || !tenant_id || !role) {
      res.status(400).send("uid, tenant_id, role required");
      return;
    }

    await getAuth().setCustomUserClaims(uid, {
      tenant_id,
      role,
      ...(company_id ? { company_id } : {})
    });

    res.status(200).send("ok");
  } catch (e: any) {
    res.status(500).send(e?.message || "error");
  }
});

