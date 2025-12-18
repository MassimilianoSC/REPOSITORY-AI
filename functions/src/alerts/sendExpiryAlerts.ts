import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { parseBuckets, windowForBucket, todayYMD, makeSubject, makePlainText } from "./common";

const REGION = "europe-west1";

// Parametri configurabili via environment variables
const ALERT_BUCKETS_DAYS = process.env.ALERT_BUCKETS_DAYS || "30,15,7,1";
const ALERT_CRON         = process.env.ALERT_CRON || "every day 08:00";
const ALERT_TZ           = process.env.ALERT_TZ || "Europe/Rome";
const ALERT_MAX_PER_RUN  = process.env.ALERT_MAX_PER_RUN || "500";
const MAIL_COLLECTION    = process.env.MAIL_COLLECTION || "mail";
const MAIL_FROM          = process.env.MAIL_FROM || "noreply@example.com";
const MAIL_TO_OVERRIDE   = process.env.MAIL_TO_OVERRIDE || ""; // per test

// CORE: trova doc da notificare per un bucket e (se send=true) emette mail+aggiorna idempotenza
async function processBucket(days: number, send: boolean) {
  const db = getFirestore();
  const { gte, lt, dateLabel } = windowForBucket(days, new Date());
  const max = Number(ALERT_MAX_PER_RUN);

  // collectionGroup sui documenti della pipeline: tenants/{tid}/companies/{cid}/documents/{docId}
  let q = db.collectionGroup("documents")
    .where("expiresAt", ">=", gte)
    .where("expiresAt", "<", lt)
    .where("status", "in", ["green","yellow"]) // escludi error/archived
    .limit(max);

  const snap = await q.get();

  const toNotify = snap.docs.filter(d => {
    const data = d.data();
    // Idempotenza: evita doppioni nello stesso giorno/bucket
    return !(data?.lastAlertDate === todayYMD() && data?.lastAlertBucket === days);
  });

  const results: any[] = [];

  for (const doc of toNotify) {
    const data = doc.data();
    const tenantId = data?.tenantId || data?.tid || "UNKNOWN";
    const title = data?.name || data?.title || data?.docType || doc.id;
    const to = (MAIL_TO_OVERRIDE || data?.notifyTo || data?.ownerEmail || "").toString();

    // Costruisci payload email (Extension Trigger Email)
    const mailDoc = {
      to,
      message: {
        subject: makeSubject(title, days),
        text: makePlainText(data, days),
      },
    };

    if (send) {
      const promises: Promise<any>[] = [];

      // Email (se configurata)
      if (to) {
        promises.push(db.collection(MAIL_COLLECTION).add(mailDoc));
        
        // Log strutturato per metrica Counter (uno per email)
        console.log(JSON.stringify({
          type: "expiryAlerts",
          event: "email_sent",
          bucket: days,
          recipient: to,
          documentId: doc.id,
          tenantId,
          severity: days <= 7 ? "warn" : "info",
        }));
      }

      // In-app notification (sempre)
      const notifRef = db.collection(`tenants/${tenantId}/notifications`).doc();
      promises.push(
        notifRef.set({
          type: "expiry",
          title: makeSubject(title, days),
          message: makePlainText(data, days),
          docPath: doc.ref.path,
          docId: doc.id,
          companyId: data?.companyId || data?.cid || null,
          expiresAt: data?.expiresAt || null,
          severity: days <= 7 ? "warn" : "info",
          createdAt: new Date(),
        })
      );

      // Idempotenza
      promises.push(
        doc.ref.set({ lastAlertDate: todayYMD(), lastAlertBucket: days }, { merge: true })
      );

      await Promise.all(promises);
    }

    results.push({
      id: doc.id,
      path: doc.ref.path,
      tenantId,
      expiresAt: data?.expiresAt,
      to: to || "(none)",
    });
  }

  // Log strutturato riepilogo run (per monitoring generale)
  console.log(JSON.stringify({
    type: "expiryAlerts",
    event: "run_completed",
    bucketDays: days,
    windowDate: dateLabel,
    found: snap.size,
    toNotify: results.length,
    sent: send ? results.filter(r => r.to !== "(none)").length : 0,
  }));

  return results;
}

// Funzione schedulata (produzione)
export const sendExpiryAlerts = onSchedule(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    schedule: ALERT_CRON,    // ✅ Stringa statica da env var
    timeZone: ALERT_TZ,       // ✅ Stringa statica da env var
  },
  async () => {
    const buckets = parseBuckets(ALERT_BUCKETS_DAYS);
    for (const b of buckets) {
      await processBucket(b, true);
    }
  }
);

// Dry-run HTTP (emulatore/test): non invia email, restituisce JSON
export const sendExpiryAlertsDryRun = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (req, res) => {
  try {
    const send = String(req.query.send || "0") === "1";         // opzionale: ?send=1 per inviare davvero
    const override = (req.query.buckets as string) || ALERT_BUCKETS_DAYS;
    const buckets = parseBuckets(override);

    const out: Record<string, any[]> = {};

    for (const b of buckets) {
      out[String(b)] = await processBucket(b, send);
    }

    res.status(200).json({ buckets, send, results: out });
  } catch (e: any) {
    console.error(e);
    res.status(500).send(e?.message || "error");
  }
});

