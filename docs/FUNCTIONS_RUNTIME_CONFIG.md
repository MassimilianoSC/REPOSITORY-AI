# ⚙️ Cloud Functions v2 — Configurazione Runtime

**Versione:** 1.0  
**Ultima revisione:** 2024-11-11

> Riepilogo parametri runtime per tutte le Cloud Functions v2 del progetto.

---

## 📊 Tabella Riepilogativa

| Function | Timeout | Memory | Concurrency | Min Instances | Region | Secrets |
|----------|---------|--------|-------------|---------------|--------|---------|
| `health` | 60s (default) | 256MiB (default) | 80 (default) | 0 | europe-west1 | - |
| `processUpload` | **180s** | **1GiB** | 80 | 0 | europe-west1 | DOC_AI_PROCESSOR_ID, GEMINI_API_KEY |
| `kbIngestFromStorage` | **180s** | **1GiB** | 80 (default) | 0 | europe-west1 | DOC_AI_PROCESSOR_ID, GEMINI_API_KEY |
| `kbSearch` | **60s** | **512MiB** | 80 (default) | 0 | europe-west1 | GEMINI_API_KEY |
| `sendExpiryAlerts` | **60s** | **512MiB** | - (scheduled) | - | europe-west1 | - |
| `sendExpiryAlertsDryRun` | **60s** | **512MiB** | 80 (default) | 0 | europe-west1 | - |
| `acceptInvite` | 60s (default) | 256MiB (default) | 80 (default) | 0 | europe-west1 | - |
| `devSetClaims` | 60s (default) | 256MiB (default) | 80 (default) | 0 | europe-west1 | - |

---

## 🔍 Dettaglio per Function

### 1. `health`

**Scopo:** Health check endpoint HTTP.

**Configurazione:**
```typescript
{
  region: "europe-west1"
}
```

**Rationale:**
- Endpoint leggero, default va bene
- Non richiede segreti o risorse particolari
- Timeout 60s più che sufficiente

---

### 2. `processUpload`

**Scopo:** Pipeline completa OCR + LLM + RAG per documenti caricati.

**Configurazione:**
```typescript
{
  region: "europe-west1",
  timeoutSeconds: 180,
  memory: "1GiB",
  concurrency: 80,
  secrets: [DOC_AI_PROCESSOR_ID, GEMINI_API_KEY]
}
```

**Rationale:**
- **Timeout 180s:** Document AI OCR può richiedere 30-60s per documenti grandi, LLM altri 10-20s, RAG query 5-10s
- **Memory 1GiB:** Buffer PDF in memoria + overhead Node.js + modelli embedding
- **Concurrency 80:** Gestire picchi upload senza saturare risorse
- **Secrets:** Necessari per Document AI e Gemini API

**Trigger:** `onObjectFinalized` (Storage)

---

### 3. `kbIngestFromStorage`

**Scopo:** Ingest documenti normativi in knowledge base (chunking + embeddings).

**Configurazione:**
```typescript
{
  region: "europe-west1",
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [GEMINI_API_KEY, DOC_AI_PROCESSOR_ID]
}
```

**Rationale:**
- **Timeout 180s:** OCR batch asincrono può richiedere polling lungo, embeddings multipli su chunks
- **Memory 1GiB:** PDF grandi in memoria + chunks + embeddings batch
- **Secrets:** Document AI per OCR, Gemini per embeddings

**Trigger:** HTTP request (chiamata manuale o automatica da pipeline)

---

### 4. `kbSearch`

**Scopo:** Ricerca semantica vettoriale su knowledge base.

**Configurazione:**
```typescript
{
  region: "europe-west1",
  timeoutSeconds: 60,
  memory: "512MiB",
  minInstances: 0,
  secrets: [GEMINI_API_KEY]
}
```

**Rationale:**
- **Timeout 60s:** Embedding query (1-2s) + vector search Firestore (500ms-1s) + overhead
- **Memory 512MiB:** Sufficiente per embedding singolo + risultati top-k
- **MinInstances 0:** MVP, cold start accettabile (3-5s). Se latenza critica, aumentare a 1
- **Secrets:** Gemini per embedding query

**Trigger:** HTTP request (chiamata da processUpload o frontend)

**Note:** Se SLA latenza < 1s richiesto, considerare `minInstances: 1` per eliminare cold start.

---

### 5. `sendExpiryAlerts`

**Scopo:** Funzione schedulata giornaliera per invio alert scadenze.

**Configurazione:**
```typescript
{
  region: "europe-west1",
  timeoutSeconds: 60,
  memory: "512MiB",
  schedule: "every day 08:00",
  timeZone: "Europe/Rome"
}
```

**Rationale:**
- **Timeout 60s:** Query Firestore collectionGroup (5-10s) + batch write notifiche (5-10s) + email trigger (< 1s)
- **Memory 512MiB:** Carico < 500 documenti per run, sufficiente
- **Schedule:** Configurabile via env var `ALERT_CRON` (default "every day 08:00")
- **TimeZone:** Configurabile via env var `ALERT_TZ` (default "Europe/Rome")

**Trigger:** Cloud Scheduler (cron job)

**Parametri configurabili:**
- `ALERT_BUCKETS_DAYS`: bucket scadenze (default "30,15,7,1")
- `ALERT_MAX_PER_RUN`: limite doc per esecuzione (default 500)
- `MAIL_FROM`: mittente email
- `MAIL_TO_OVERRIDE`: override destinatario per test

---

### 6. `sendExpiryAlertsDryRun`

**Scopo:** Dry-run HTTP per testare alert senza invio email.

**Configurazione:**
```typescript
{
  region: "europe-west1",
  timeoutSeconds: 60,
  memory: "512MiB"
}
```

**Rationale:**
- Stessa logica di `sendExpiryAlerts` ma senza effetti collaterali
- Ritorna JSON con conteggi e dettagli documenti

**Trigger:** HTTP request (manuale)

**Esempio:**
```bash
curl "https://europe-west1-PROJECT_ID.cloudfunctions.net/sendExpiryAlertsDryRun?buckets=30,15,7,1"
```

---

### 7. `acceptInvite`

**Scopo:** Gestione accettazione inviti utente (aggiornamento custom claims).

**Configurazione:**
```typescript
{
  region: "europe-west1"
}
```

**Rationale:**
- Operazione leggera, default va bene
- Scrittura singola Firestore + update custom claims

**Trigger:** HTTP request (chiamata da frontend post-signup)

---

### 8. `devSetClaims`

**Scopo:** Utility per impostare custom claims in emulator (solo dev/staging).

**Configurazione:**
```typescript
{
  region: "europe-west1"
}
```

**Rationale:**
- Solo per sviluppo, default sufficiente
- **⚠️ NON esporre in produzione** (commentare export in index.ts per prod)

**Trigger:** HTTP request (solo emulator)

---

## 📈 Monitoraggio Performance

### Metriche Chiave

Per ogni function, monitorare:

1. **Invocazioni/min**
   - Dashboard: Cloud Functions > Metrics > Invocations
   - Alert: spike >10x normale

2. **Durata (p50, p95, p99)**
   - Dashboard: Cloud Functions > Metrics > Execution time
   - Alert: p95 > 90% timeout configurato

3. **Error rate**
   - Dashboard: Cloud Functions > Metrics > Errors
   - Alert: >1% per 5 minuti

4. **Memoria utilizzata**
   - Dashboard: Cloud Functions > Metrics > Memory utilization
   - Alert: >90% memoria allocata

5. **Cold start frequency**
   - Dashboard: Cloud Functions > Metrics > Cold starts
   - Se >20%, considerare minInstances

---

## 🔧 Tuning Runtime

### Quando Aumentare Timeout

**Sintomi:**
- Log: `Function execution took 179s, finished with status: 'timeout'`
- Spike error rate correlato a documenti grandi

**Azioni:**
1. Verificare logs: quale step è lento (OCR, LLM, RAG)?
2. Se OCR: considerare batch asincrono per documenti >30 pagine
3. Se LLM: verificare latenza API Gemini (retry/fallback)
4. Aumentare timeout a 240s-300s se necessario

**Esempio:**
```typescript
export const processUpload = onObjectFinalized(
  {
    timeoutSeconds: 240,  // era 180
    ...
  },
  ...
);
```

---

### Quando Aumentare Memory

**Sintomi:**
- Log: `Function execution failed: memory limit exceeded`
- Crash improvvisi senza errore esplicito

**Azioni:**
1. Verificare dimensione PDF processati (MB)
2. Verificare numero chunks generati (KB)
3. Aumentare memoria a 2GiB se necessario

**Esempio:**
```typescript
export const kbIngestFromStorage = onRequest(
  {
    memory: "2GiB",  // era 1GiB
    ...
  },
  ...
);
```

**⚠️ ATTENZIONE:** Aumentare memoria aumenta costi. Verificare necessità reale.

---

### Quando Aumentare minInstances

**Sintomi:**
- Cold start latency >5s impatta UX
- Query RAG critiche per esperienza utente

**Azioni:**
1. Monitorare cold start frequency
2. Se >20% richieste hanno cold start, valutare minInstances: 1
3. Calcolare costo aggiuntivo (1 istanza always-on ~€20-30/mese)

**Esempio:**
```typescript
export const kbSearch = onRequest(
  {
    minInstances: 1,  // era 0
    ...
  },
  ...
);
```

**Trade-off:** Latenza migliore vs. costi fissi mensili.

---

## 💰 Stima Costi Runtime

**Assunzioni MVP:**
- 100 upload/giorno
- 50 query RAG/giorno
- 1 alert run/giorno

| Function | Invocazioni/mese | Durata media | GB-s/mese | Costo/mese |
|----------|------------------|--------------|-----------|------------|
| `processUpload` | 3,000 | 30s | 90,000 | ~€3.60 |
| `kbSearch` | 1,500 | 2s | 1,536 | ~€0.06 |
| `sendExpiryAlerts` | 30 | 10s | 154 | ~€0.01 |
| `kbIngestFromStorage` | 300 | 60s | 18,000 | ~€0.72 |
| **Totale** | **~4,830** | - | **~109,690** | **~€4.40** |

**Note:**
- Calcolo: GB-s/mese × €0.00004
- Non include: Document AI, Gemini API, Firestore, Storage
- Con minInstances=1 su kbSearch: +€20-30/mese

---

## 🔐 Secrets Management

**Segreti configurati:**

1. **DOC_AI_PROCESSOR_ID**
   - Formato: `projects/{projectId}/locations/eu/processors/{processorId}`
   - Uso: `processUpload`, `kbIngestFromStorage`
   - Rotation: ogni 12 mesi (processor ID stabile, no rotation necessaria)

2. **GEMINI_API_KEY**
   - Formato: `AIza...` (40 caratteri)
   - Uso: `processUpload`, `kbIngestFromStorage`, `kbSearch`
   - Rotation: ogni 6 mesi (vedi docs/RUNBOOK.md)

**Accesso secrets:**
```bash
# Verificare secrets disponibili
gcloud secrets list --project=PROJECT_ID

# Rotazione secret
echo -n "NEW_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-

# Grant accesso service account
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 🌍 Multi-Environment

**Differenze parametri per ambiente:**

| Parametro | Staging | Production |
|-----------|---------|------------|
| Timeout | Stessi | Stessi |
| Memory | Stessi | Stessi |
| MinInstances | 0 | 0 (o 1 per kbSearch se SLA richiesto) |
| Secrets | Secret Manager staging | Secret Manager production |
| ALERT_CRON | "every day 10:00" (test) | "every day 08:00" (prod) |
| MAIL_TO_OVERRIDE | "test@example.com" | "" (vuoto, usa email reale) |

**Best practice:**
- Codice identico stg/prod
- Differenze solo in env vars e secrets
- Testare sempre su staging prima di prod

---

## 📚 Riferimenti

**Documentazione ufficiale:**
- [Cloud Functions v2 Configuration](https://firebase.google.com/docs/functions/config-env)
- [Cloud Functions v2 Timeouts & Limits](https://cloud.google.com/functions/docs/configuring/timeout)
- [Cloud Functions v2 Memory](https://cloud.google.com/functions/docs/configuring/memory)
- [Cloud Functions v2 Pricing](https://cloud.google.com/functions/pricing)

**File progetto:**
- `functions/src/index.ts` — Main functions export
- `functions/src/rag/query.ts` — kbSearch implementation
- `functions/src/rag/ingest.ts` — kbIngestFromStorage implementation
- `functions/src/alerts/sendExpiryAlerts.ts` — Alert scheduler

---

**Documento versione:** 1.0  
**Ultima revisione:** 2024-11-11  
**Prossima review:** 2025-02-11 (trimestrale)

