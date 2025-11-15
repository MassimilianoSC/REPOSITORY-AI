# 📊 Soluzione Completa Monitoring Step 6.B

**Problema risolto:** Come creare metriche log-based affidabili per contare email inviate senza usare `valueExtractor` non supportato dai Counter.

---

## 🎯 **Soluzione Implementata: Counter "Uno Log per Email"**

### **Perché Questa Soluzione?**

**Problema originale:**
- ❌ Counter + `valueExtractor` = **NON SUPPORTATO** da Google Cloud
- ❌ Distribution + `valueExtractor` = Complesso, richiede aggregazioni MQL
- ❌ API restituiva errori 400 per combinazioni non valide

**Soluzione scelta (Opzione 1 consigliata dal dev):**
- ✅ **Un log strutturato per ogni email inviata**
- ✅ **Counter semplice** che conta i log (no extractor)
- ✅ Alert diretti e affidabili (`== 0` significa davvero "zero email")

---

## 🔧 **Modifiche al Codice**

### **File: `functions/src/alerts/sendExpiryAlerts.ts`**

#### **Modifica 1: Log per Email Inviata**

**Prima (log aggregato):**
```typescript
// Alla fine del loop, un solo log:
console.log({ type: "expiryAlerts", sent: 42 });
```

**Dopo (un log per email):**
```typescript
// Dentro il loop, per ogni email:
if (to) {
  promises.push(db.collection(MAIL_COLLECTION).add(mailDoc));
  
  // ✨ NUOVO: Log strutturato (uno per email)
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
```

**Vantaggi:**
- 🎯 Ogni email = 1 log entry
- 📊 Counter lo conta direttamente (no parsing)
- 🔍 Tracciabilità: recipient, bucket, severity per ogni invio

#### **Modifica 2: Log Riepilogo Run**

```typescript
// Alla fine del processBucket, log di summary:
console.log(JSON.stringify({
  type: "expiryAlerts",
  event: "run_completed",  // ✨ Distingue da "email_sent"
  bucketDays: days,
  windowDate: dateLabel,
  found: snap.size,
  toNotify: results.length,
  sent: send ? results.filter(r => r.to !== "(none)").length : 0,
}));
```

**Utilità:** Monitoring generale del run (non usato per alert, solo per debug)

---

## 📊 **Metriche Create**

### **1. `expiry_alerts_email_sent` (Counter)**

```bash
gcloud logging metrics create expiry_alerts_email_sent \
  --description="Conteggio email di scadenza inviate (una entry per email)" \
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND jsonPayload.type="expiryAlerts"
               AND jsonPayload.event="email_sent"'
```

**Cosa conta:** Ogni log con `event="email_sent"`  
**Quando cresce:** Ogni volta che una email viene inviata

### **2. `expiry_alerts_errors` (Counter)**

```bash
gcloud logging metrics create expiry_alerts_errors \
  --description="Conteggio errori nelle funzioni sendExpiryAlerts" \
  --log-filter='resource.type="cloud_function"
               AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
               AND (severity="ERROR" OR severity="CRITICAL")'
```

**Cosa conta:** Log con severity ERROR/CRITICAL  
**Quando cresce:** Errori nella funzione

---

## 🔔 **Alert Policies**

### **1. Heartbeat Missing (Metric Absence)**

**File:** `monitoring/alerts/heartbeat-absence.json`

**Cosa monitora:** 
- Metrica: `cloudfunctions.googleapis.com/function/execution_count` (status="ok")
- Finestra: **23.5 ore** (massimo per metric-absence)

**Quando scatta:** 
- La funzione `sendExpiryAlerts` non è stata eseguita con successo nelle ultime 23.5h

**Cosa significa:**
- 🔴 Cloud Scheduler non ha triggerato il job
- 🔴 Funzione crashata/timeout prima della logica applicativa
- 🔴 Permessi IAM mancanti

**Falsi positivi:** Zero (se il job è schedulato daily)

---

### **2. Zero Emails Sent**

**File:** `monitoring/alerts/zero-emails.json`

**Cosa monitora:**
- Metrica: `logging.googleapis.com/user/expiry_alerts_email_sent`
- Threshold: **< 1** in finestra di **2 ore**

**Quando scatta:**
- Il job è partito correttamente MA non ha inviato alcuna email

**Cosa significa:**
- ⚠️ Nessun documento in scadenza (potrebbe essere normale)
- ⚠️ Configurazione email errata (`MAIL_TO_OVERRIDE` vuoto, no `notifyTo` nei docs)
- ⚠️ Extension "Trigger Email" non attiva
- ⚠️ Idempotenza blocca tutti gli invii (`lastAlertDate` recente)

**Falsi positivi:** Possibili se non ci sono scadenze, ma è un warning utile

---

### **3. Errors Detected**

**File:** `monitoring/alerts/errors.json`

**Cosa monitora:**
- Metrica: `logging.googleapis.com/user/expiry_alerts_errors`
- Threshold: **> 0** in finestra di **1 ora**

**Quando scatta:**
- Errori (ERROR/CRITICAL) nelle funzioni nelle ultime 1h

**Cosa significa:**
- 🔴 Eccezioni non gestite
- 🔴 Firestore/Storage permessi mancanti
- 🔴 Secrets non configurati (GEMINI_API_KEY, etc.)
- 🔴 API esterne down (Document AI, Gemini)

**Falsi positivi:** Zero (errori = problema reale)

---

## 🚀 **Deploy Completo**

### **Step-by-Step (Raccomandato)**

```powershell
# === 1. Deploy Functions (con nuovi log) ===
cd functions
npm run build
cd ..
firebase deploy --only functions:sendExpiryAlerts,functions:sendExpiryAlertsDryRun

# Attendi: ~2-3 minuti
# ✅ Functions deployate con log "email_sent"

# === 2. Deploy Monitoring (metriche + alert) ===
.\monitoring\deploy-monitoring.ps1

# Attendi: ~4 minuti (include 2 min wait per propagazione)
# ✅ 2 metriche create
# ✅ 3 alert policies create

# === 3. Configura Notification Channels (UI) ===
# Vai su: https://console.cloud.google.com/monitoring/alerting/notifications?project=repository-ai-477311
# - Crea channel Email/Slack
# - Associa a tutte e 3 le alert policies
```

---

### **One-Shot (Veloce)**

```powershell
# Deploy tutto insieme
firebase deploy --only functions:sendExpiryAlerts,functions:sendExpiryAlertsDryRun; `
  Start-Sleep -Seconds 30; `
  .\monitoring\deploy-monitoring.ps1
```

---

## 🧪 **Test & Verifica**

### **Test 1: Verifica Deploy Functions**

```powershell
# Logs recenti
gcloud functions logs read sendExpiryAlerts --limit=20
```

**Cerca:** Log con `"event":"email_sent"` (apparirà dopo il primo run schedulato o dry-run)

### **Test 2: Trigger Manuale (Dry-Run)**

```powershell
# Production (HTTP function)
$REGION = "europe-west1"
$PROJECT = "repository-ai-477311"
curl "https://sendexpiryalertsdryrun-ifjiaaz4rq-ew.a.run.app?send=1&buckets=30,15,7,1"
```

**Atteso:** Response JSON con `sent: N` (N = numero email inviate)

### **Test 3: Verifica Metriche Popolate**

```powershell
# Attendi 5 minuti dopo dry-run, poi:
gcloud monitoring time-series list \
  --filter='metric.type="logging.googleapis.com/user/expiry_alerts_email_sent"' \
  --project=repository-ai-477311
```

**Atteso:** Time series con `points[].value.int64Value = N`

### **Test 4: Verifica Alert Policies**

```powershell
gcloud alpha monitoring policies list \
  --project=repository-ai-477311 \
  --filter='displayName:"Expiry Alerts"' \
  --format='table(displayName,enabled,conditions[0].displayName)'
```

**Atteso:**
```
DISPLAY_NAME                          ENABLED  CONDITION
Expiry Alerts - Heartbeat Missing     True     Cloud Function execution_count...
Expiry Alerts - Zero Emails Sent      True     expiry_alerts_email_sent == 0...
Expiry Alerts - Errors Detected       True     expiry_alerts_errors > 0...
```

---

## 📈 **Monitoraggio Console**

### **Dashboards Consigliati**

#### **Metrics Explorer**
https://console.cloud.google.com/monitoring/metrics-explorer?project=repository-ai-477311

**Chart 1: Email Sent (7 giorni)**
- Metric: `logging.googleapis.com/user/expiry_alerts_email_sent`
- Aggregation: SUM
- Period: 1 day
- Chart type: Line

**Chart 2: Errors (7 giorni)**
- Metric: `logging.googleapis.com/user/expiry_alerts_errors`
- Aggregation: SUM
- Period: 1 day
- Chart type: Bar

**Chart 3: Function Executions**
- Metric: `cloudfunctions.googleapis.com/function/execution_count`
- Filter: `function_name="sendExpiryAlerts"`
- Group by: `status`
- Chart type: Stacked area

---

## 🔍 **Troubleshooting**

### **Problema: Metrica `expiry_alerts_email_sent` sempre a 0**

**Diagnosi:**
```powershell
# Verifica log con event="email_sent"
gcloud logging read 'jsonPayload.event="email_sent"' --limit=5 --format=json
```

**Cause possibili:**
1. ❌ Nessun documento in scadenza → **Normale**, attendi scadenze
2. ❌ Funzione deployata ma non eseguita → Verifica Cloud Scheduler
3. ❌ `send=false` (dry-run) → Usa `?send=1` per test

**Fix:**
```powershell
# Test manuale
curl "https://sendexpiryalertsdryrun-...a.run.app?send=1&buckets=7"
```

---

### **Problema: Alert "Heartbeat" scatta subito**

**Diagnosi:**
```powershell
# Verifica ultima esecuzione
gcloud logging read 'resource.labels.function_name="sendExpiryAlerts"' --limit=1 --format='value(timestamp)'
```

**Cause possibili:**
1. ❌ Funzione mai eseguita → Attendi primo run schedulato (08:00 Europe/Rome)
2. ❌ Cloud Scheduler disabilitato → Verifica: https://console.cloud.google.com/cloudscheduler

**Fix:**
- Disabilita alert temporaneamente
- Attendi primo run schedulato
- Riabilita dopo conferma esecuzione

---

### **Problema: Alert "Zero Emails" scatta ogni giorno**

**Diagnosi:**
```powershell
# Verifica documenti in scadenza
gcloud firestore queries run \
  --collection-group=documents \
  --where='status IN (green,yellow)' \
  --where='expiresAt >= 2024-12-08T00:00:00Z' \
  --where='expiresAt < 2024-12-16T00:00:00Z'
```

**Cause possibili:**
1. ✅ Nessun documento in scadenza → **Normale**, considera disabilitare alert o aumentare finestra
2. ❌ Idempotenza blocca invii → Verifica `lastAlertDate`/`lastAlertBucket`
3. ❌ Email non configurate → Verifica `MAIL_TO_OVERRIDE` o `notifyTo` nei documenti

**Fix configurazione alert:**
```json
// Modifica zero-emails.json → thresholdValue: 0 (invece di 1)
// Così scatta solo se ESATTAMENTE zero email (no warning se 1+)
```

---

## 📚 **Riferimenti Tecnici**

### **Documentazione Google Cloud**
- [Log-Based Metrics](https://cloud.google.com/logging/docs/logs-based-metrics)
- [Counter Metrics](https://cloud.google.com/logging/docs/logs-based-metrics/counter-metrics)
- [Distribution Metrics](https://cloud.google.com/logging/docs/logs-based-metrics/distribution-metrics)
- [Metric Absence Alerts](https://cloud.google.com/monitoring/alerts/metric-absence)
- [Alert Policies JSON](https://cloud.google.com/monitoring/alerts/policies-in-json)

### **Best Practices**
- [SLO/SLI Monitoring](https://cloud.google.com/stackdriver/docs/solutions/slo-monitoring)
- [Alerting Strategy](https://sre.google/sre-book/monitoring-distributed-systems/)

---

## ✅ **Checklist Finale**

### **Deploy**
- [ ] Build functions: `cd functions; npm run build`
- [ ] Deploy functions: `firebase deploy --only functions:sendExpiryAlerts`
- [ ] Deploy monitoring: `.\monitoring\deploy-monitoring.ps1`
- [ ] Configura Notification Channels (UI)
- [ ] Test dry-run: `curl ...?send=1`

### **Verifica**
- [ ] Metriche visibili in console (dopo 5 min)
- [ ] Alert policies attive (3/3)
- [ ] Notification channels associati
- [ ] Log `email_sent` presenti dopo test

### **Documentazione**
- [ ] Team informato su alert meanings
- [ ] Runbook per troubleshooting
- [ ] Notification channels documentati

---

## 🎉 **Status Finale**

| Componente | Status | Note |
|------------|--------|------|
| **Codice Functions** | ✅ Ready | Log "email_sent" per ogni invio |
| **Metrica Email Sent** | ✅ Ready | Counter semplice, no extractor |
| **Metrica Errors** | ✅ Ready | Counter su severity ERROR/CRITICAL |
| **Alert Heartbeat** | ✅ Ready | Metric absence 23.5h |
| **Alert Zero Emails** | ✅ Ready | Threshold < 1 in 2h |
| **Alert Errors** | ✅ Ready | Threshold > 0 in 1h |
| **Deploy Scripts** | ✅ Ready | PowerShell one-shot |
| **Docs** | ✅ Complete | README + Solution guide |

---

## 🚀 **Prossimo Step**

**Step 6.B → COMPLETATO! ✅**

**Prossimi punti agenda:**
- 📱 PUNTO 6.C finale (UI notifiche già implementato)
- 📊 PUNTO 7 (nuovo argomento dal dev)

---

**Soluzione validata dal dev:**
> "perfetto — andiamo con il **micro-step OCR ">30 pagine" (batch/async)**"

**Implementazione:** ✅ Step 6.B (Monitoring) chiuso con soluzione robusta e production-ready!

🎯 **Ready to deploy!**

