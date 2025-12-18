# 📊 Monitoring & Alerting - Expiry Alerts

Sistema completo di metriche e alert per monitorare le notifiche scadenze.

---

## 🎯 **Architettura Monitoring**

### **Metriche Log-Based (Counter)**

#### **1. `expiry_alerts_email_sent`**
- **Tipo:** Counter (DELTA, INT64)
- **Descrizione:** Conta il numero di email inviate (una entry per email)
- **Filtro Log:** 
  ```
  resource.type="cloud_function"
  AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
  AND jsonPayload.type="expiryAlerts"
  AND jsonPayload.event="email_sent"
  ```
- **Utilità:** Tracking preciso del numero di email inviate per run

#### **2. `expiry_alerts_errors`**
- **Tipo:** Counter (DELTA, INT64)
- **Descrizione:** Conta errori nelle funzioni di alert
- **Filtro Log:**
  ```
  resource.type="cloud_function"
  AND (labels.function_name="sendExpiryAlerts" OR labels.function_name="sendExpiryAlertsDryRun")
  AND (severity="ERROR" OR severity="CRITICAL")
  ```
- **Utilità:** Rilevamento immediato di failure nelle funzioni

---

### **Alert Policies**

#### **1. Heartbeat Missing (Metric Absence)**
- **Nome:** `Expiry Alerts - Heartbeat Missing`
- **Tipo:** Metric Absence (23.5 ore)
- **Metrica:** `cloudfunctions.googleapis.com/function/execution_count` (status="ok")
- **Quando scatta:** La funzione non è stata eseguita con successo nelle ultime 23.5 ore
- **Cosa controllare:**
  - Cloud Scheduler attivo?
  - Timeout/Crash della funzione?
  - Permessi IAM corretti?

#### **2. Zero Emails Sent**
- **Nome:** `Expiry Alerts - Zero Emails Sent`
- **Tipo:** Threshold (< 1 email in 2h)
- **Metrica:** `logging.googleapis.com/user/expiry_alerts_email_sent`
- **Quando scatta:** Il job è partito ma non ha inviato email
- **Cosa controllare:**
  - Ci sono documenti in scadenza?
  - Configurazione `MAIL_TO_OVERRIDE` corretta?
  - Extension "Trigger Email" attiva?
  - `lastAlertDate`/`lastAlertBucket` bloccano invii?

#### **3. Errors Detected**
- **Nome:** `Expiry Alerts - Errors Detected`
- **Tipo:** Threshold (> 0 errori in 1h)
- **Metrica:** `logging.googleapis.com/user/expiry_alerts_errors`
- **Quando scatta:** Errori nelle funzioni nelle ultime 1 ora
- **Cosa controllare:**
  - Logs: `gcloud functions logs read sendExpiryAlerts --limit=50`
  - Firestore permessi
  - Secrets (GEMINI_API_KEY, DOC_AI_PROCESSOR_ID)

---

## 🚀 **Deploy**

### **Setup Completo (One-Command)**

```powershell
# PowerShell (Windows)
.\monitoring\deploy-monitoring.ps1
```

**Cosa fa:**
1. ✅ Crea 2 metriche log-based (Counter)
2. ⏳ Attende 2 minuti per propagazione
3. ✅ Crea 3 alert policies
4. 📊 Mostra riepilogo + link console

**Tempo:** ~3-4 minuti

---

### **Deploy Manuale (Step-by-Step)**

#### **Step 1: Metriche**

```powershell
# Metrica email sent
.\monitoring\metrics\email_sent_counter.ps1

# Metrica errors
.\monitoring\metrics\errors_counter.ps1
```

Verifica: https://console.cloud.google.com/logs/metrics?project=repository-ai-477311

#### **Step 2: Alert Policies** (Dopo 2 min)

```powershell
# Heartbeat
gcloud alpha monitoring policies create `
  --project=repository-ai-477311 `
  --policy-from-file=monitoring/alerts/heartbeat-absence.json

# Zero Emails
gcloud alpha monitoring policies create `
  --project=repository-ai-477311 `
  --policy-from-file=monitoring/alerts/zero-emails.json

# Errors
gcloud alpha monitoring policies create `
  --project=repository-ai-477311 `
  --policy-from-file=monitoring/alerts/errors.json
```

Verifica: https://console.cloud.google.com/monitoring/alerting/policies?project=repository-ai-477311

---

## 🔔 **Notification Channels**

**IMPORTANTE:** Gli alert sono creati ma **senza notification channels**!

### **Configura Notifiche**

1. Vai su: https://console.cloud.google.com/monitoring/alerting/notifications?project=repository-ai-477311

2. Crea un channel (es. Email):
   - Click **"Create Channel"**
   - Tipo: **Email**
   - Email: `your-email@domain.com`
   - Display name: `Dev Team`
   - Save

3. Associa channel agli alert:
   - Vai su: https://console.cloud.google.com/monitoring/alerting/policies?project=repository-ai-477311
   - Per ogni policy → **Edit** → **Notifications** → Seleziona channel
   - Save

---

## 🧪 **Test**

### **Test 1: Verifica Metriche Esistenti**

```powershell
gcloud logging metrics list --project=repository-ai-477311 --filter="name:expiry_alerts"
```

**Atteso:**
```
NAME                            DESCRIPTION
expiry_alerts_email_sent        Conteggio email di scadenza inviate...
expiry_alerts_errors            Conteggio errori nelle funzioni...
```

### **Test 2: Trigger Manuale Dry-Run**

```powershell
# Emulator (locale)
firebase emulators:start

# Altra shell: dry-run con send=1
curl "http://127.0.0.1:5001/repository-ai-477311/europe-west1/sendExpiryAlertsDryRun?send=1&buckets=7"
```

**Verifica logs:**
```powershell
# Cerca log "email_sent"
gcloud logging read 'jsonPayload.event="email_sent"' --limit=10 --format=json
```

**Atteso:**
```json
{
  "jsonPayload": {
    "type": "expiryAlerts",
    "event": "email_sent",
    "bucket": 7,
    "recipient": "test@example.com",
    "documentId": "durc_123",
    "tenantId": "DEMO",
    "severity": "warn"
  }
}
```

### **Test 3: Verifica Alert Policies**

```powershell
gcloud alpha monitoring policies list --project=repository-ai-477311 --filter="displayName:'Expiry Alerts'"
```

**Atteso:** 3 policies (Heartbeat, Zero Emails, Errors)

---

## 📊 **Dashboard (Opzionale)**

Per visualizzare le metriche in tempo reale, crea un dashboard custom:

```powershell
# Esporta dashboard esempio
gcloud monitoring dashboards create --config-from-file=monitoring/dashboard.json
```

**File `monitoring/dashboard.json`** (da creare se desiderato):
- Chart 1: `expiry_alerts_email_sent` (line chart, 7 giorni)
- Chart 2: `expiry_alerts_errors` (bar chart, 7 giorni)
- Chart 3: `function/execution_count` (status breakdown)

---

## 🔍 **Troubleshooting**

### **Metrica non appare nei grafici**

**Causa:** Nessun log matchato ancora o propagazione in corso.

**Fix:**
1. Attendi 2-5 minuti dopo deploy
2. Trigger manuale: `sendExpiryAlertsDryRun?send=1`
3. Verifica logs: `gcloud logging read 'jsonPayload.event="email_sent"' --limit=5`

### **Alert "Zero Emails" scatta subito**

**Causa:** Metrica appena creata, nessun dato storico.

**Fix:**
1. Disabilita temporaneamente l'alert
2. Esegui un run con email: `sendExpiryAlertsDryRun?send=1&buckets=30,15,7,1`
3. Attendi 5 minuti, riabilita alert

### **Alert "Heartbeat" scatta subito**

**Causa:** Funzione non eseguita nelle ultime 23.5h.

**Fix:**
- Se è la prima volta: normale, attendi il primo run schedulato (08:00 Europe/Rome)
- Se è dopo il primo run: controlla Cloud Scheduler → View logs

---

## 📚 **Riferimenti**

- [Log-Based Metrics (Google Cloud)](https://cloud.google.com/logging/docs/logs-based-metrics)
- [Metric Absence Alerts](https://cloud.google.com/monitoring/alerts/metric-absence)
- [Counter vs Distribution](https://cloud.google.com/logging/docs/logs-based-metrics/counter-metrics)
- [Alert Policies JSON](https://cloud.google.com/monitoring/alerts/policies-in-json)

---

## ✅ **Status**

| Componente | Status | File |
|------------|--------|------|
| Metrica Email Sent | ✅ Ready | `metrics/email_sent_counter.ps1` |
| Metrica Errors | ✅ Ready | `metrics/errors_counter.ps1` |
| Alert Heartbeat | ✅ Ready | `alerts/heartbeat-absence.json` |
| Alert Zero Emails | ✅ Ready | `alerts/zero-emails.json` |
| Alert Errors | ✅ Ready | `alerts/errors.json` |
| Deploy Script | ✅ Ready | `deploy-monitoring.ps1` |
| Docs | ✅ Complete | `README.md` |

**Prossimo step:** Deploy Functions + Monitoring insieme!

```powershell
# 1. Build & Deploy Functions
cd functions
npm run build
cd ..
firebase deploy --only functions:sendExpiryAlerts

# 2. Deploy Monitoring
.\monitoring\deploy-monitoring.ps1

# 3. Configura Notification Channels (UI)
```

🎉 **Step 6.B Completato!**

