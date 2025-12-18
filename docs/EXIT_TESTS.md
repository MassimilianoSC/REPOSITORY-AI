# ✅ Exit Tests — Post-Deploy Obbligatori

**Versione:** 1.0  
**Ambiente:** `[STG | PROD]` _(specificare)_  
**Data esecuzione:** __________  
**Esecutore:** __________

> **Criterio pass/fail:** TUTTI i test devono passare (✅) per considerare il deploy valido.  
> Un singolo test fallito (❌) richiede fix immediato e re-deploy.

---

## Categoria A — Base Vita

### Test A.1 — Health HTTP endpoint

**Obiettivo:** Verificare che la function `health` risponda correttamente.

**Comando:**
```bash
curl -i https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/health
```

**Output atteso:**
```
HTTP/2 200
content-type: text/html; charset=utf-8
...

ok
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test A.2 — Autenticazione email-link (flow completo)

**Obiettivo:** Verificare flusso login passwordless su dominio production.

**Passi manuali:**
1. Aprire browser in incognito
2. Navigare a `https://YOUR_DOMAIN.web.app/login`
3. Inserire email test: `test-user@example.com`
4. Cliccare "Send magic link"
5. Aprire email ricevuta (verificare inbox)
6. Cliccare link di login
7. Verificare redirect a `/dashboard`
8. Verificare presenza token auth in localStorage

**Verifiche:**
- [ ] Email arrivata entro 30 secondi
- [ ] Link valido (non 403/404)
- [ ] Redirect corretto a dashboard
- [ ] User autenticato (verificabile in Firebase Console > Authentication)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test A.3 — Domini autorizzati

**Obiettivo:** Verificare che domini production siano autorizzati per auth.

**Comando:**
```bash
# Recuperare lista domini autorizzati
gcloud identity-platform config describe --project=$(gcloud config get-value project) --format=json | jq '.authorizedDomains'
```

**Output atteso (inclusi):**
```json
[
  "localhost",
  "YOUR_PROJECT_ID.firebaseapp.com",
  "YOUR_PROJECT_ID.web.app",
  "YOUR_CUSTOM_DOMAIN.com"  // se configurato
]
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Categoria B — Pipeline Documentale

### Test B.1 — Upload PDF digitale (skip OCR)

**Obiettivo:** Verificare upload → processamento → Firestore per PDF digitale (testo nativo).

**Passi:**
1. Login come utente test (tenant `T1`, company `C1`)
2. Navigare a `/upload`
3. Upload file `test-digital.pdf` (PDF con testo nativo, es. esportato da Word)
4. Attendere completamento upload (progress bar 100%)

**Verifiche Cloud Logging:**
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=processUpload" \
  --limit=20 --format=json --project=$(gcloud config get-value project) | jq '.[] | select(.jsonPayload.name | contains("test-digital"))'
```

**Output atteso nei log:**
- `status: processing`
- `skip Document AI OCR` (se PDF digitale rilevato)
- `status: green|yellow|red` (finale)

**Verifiche Firestore:**
```bash
# Via Firebase Console o CLI
firebase firestore:get /tenants/T1/companies/C1/documents/{docId}
```

**Campi attesi nel documento:**
```json
{
  "docType": "DURC|ALTRO|...",
  "status": "green|yellow|red",
  "reason": "...",
  "confidence": 0.75-0.99,
  "ocrUsed": false,
  "updatedAt": "2024-11-11T...",
  "lastProcessedGen": "..."
}
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test B.2 — Upload PDF scansionato (OCR on)

**Obiettivo:** Verificare chiamata Document AI OCR per PDF scansionato.

**Passi:**
1. Login come utente test
2. Upload file `test-scanned.pdf` (PDF immagine, scansione)
3. Attendere completamento

**Verifiche Cloud Logging:**
```bash
gcloud logging read "resource.type=cloud_function AND jsonPayload.message:\"Calling Document AI OCR\"" \
  --limit=5 --project=$(gcloud config get-value project)
```

**Output atteso:**
- Log: `Calling Document AI OCR (EU)...`
- Log: `OCR pages: X OCR text length: YYYY`

**Verifiche Firestore:**
```json
{
  "ocrUsed": true,
  "docType": "...",
  "status": "green|yellow|red"
}
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test B.3 — Idempotenza (stesso file)

**Obiettivo:** Verificare che ri-upload dello stesso file non ri-processi.

**Passi:**
1. Upload `test-digital.pdf` (prima volta)
2. Annotare `lastProcessedGen` e `contentHash` dal doc Firestore
3. Ri-upload STESSO file identico (stesso nome, stesso contenuto)
4. Verificare logs

**Verifiche:**
```bash
gcloud logging read "resource.type=cloud_function AND jsonPayload.message:\"Already processed\"" \
  --limit=3 --project=$(gcloud config get-value project)
```

**Output atteso:**
- Log: `Already processed, skip: { name: '...', generation: '...' }`
- Firestore doc: **NON modificato** (`updatedAt` identico)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test B.4 — Idempotenza (file modificato)

**Obiettivo:** Verificare che file con stesso nome ma contenuto diverso venga ri-processato.

**Passi:**
1. Upload `test.pdf` versione 1
2. Modificare il PDF (aggiungere una pagina, cambiare testo)
3. Ri-upload come `test.pdf` (stesso nome, contenuto diverso)

**Verifiche:**
```bash
# Verificare che contentHash sia cambiato
firebase firestore:get /tenants/T1/companies/C1/documents/{docId}
```

**Campi attesi:**
- `contentHash`: **DIVERSO** dal precedente
- `lastProcessedGen`: **DIVERSO** dal precedente
- `updatedAt`: **AGGIORNATO**

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Categoria C — RAG (Knowledge Base)

### Test C.1 — Ingest PDF digitale

**Obiettivo:** Verificare ingest di documento normativo → creazione chunks + embeddings.

**Passi:**
1. Upload PDF normativo in path: `gs://YOUR_BUCKET/kb/T1/normativa-edilizia.pdf`

**Comando trigger:**
```bash
# Chiamare function kbIngestFromStorage
curl -X POST "https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/kbIngestFromStorage" \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "YOUR_BUCKET",
    "name": "kb/T1/normativa-edilizia.pdf"
  }'
```

**Verifiche Firestore:**
```bash
# Controllare collezione kb_chunks
firebase firestore:query /kb_chunks --where "tid==T1" --limit 5
```

**Campi attesi nei chunks:**
```json
{
  "tid": "T1",
  "source": "normativa-edilizia.pdf",
  "page": 1,
  "text": "...",
  "embedding": [0.123, -0.456, ...],  // array lunghezza 768
  "createdAt": "2024-11-11T..."
}
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test C.2 — Ingest PDF scansionato (OCR on)

**Obiettivo:** Verificare OCR durante ingest se flag `KB_OCR_ENABLED=true`.

**Prerequisito:** Parametro `KB_OCR_ENABLED=true` configurato.

**Passi:**
1. Upload PDF scansionato in `gs://YOUR_BUCKET/kb/T1/circolare-min-lavoro.pdf`
2. Trigger ingest

**Verifiche log:**
```bash
gcloud logging read "resource.type=cloud_function AND jsonPayload.message:\"KB ingest: calling OCR\"" \
  --limit=3 --project=$(gcloud config get-value project)
```

**Output atteso:**
- Log: `KB ingest: calling OCR for scanned doc`
- Chunks creati con testo estratto via OCR

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test C.3 — Search RAG (kbSearch)

**Obiettivo:** Verificare ricerca semantica su knowledge base → top-k risultati coerenti.

**Comando:**
```bash
curl -X GET "https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/kbSearch?tid=T1&q=Normativa%20DURC%20validità%20120%20giorni&k=4"
```

**Output atteso (JSON):**
```json
{
  "results": [
    {
      "source": "normativa-edilizia.pdf",
      "page": 3,
      "text": "... DURC validità ... 120 giorni ...",
      "score": 0.85
    },
    {
      "source": "circolare-min-lavoro.pdf",
      "page": 1,
      "text": "...",
      "score": 0.78
    },
    ...
  ]
}
```

**Verifiche:**
- [ ] 4 risultati ritornati (`k=4`)
- [ ] Score decrescente
- [ ] Testo coerente con query
- [ ] Prefiltro `tid=T1` applicato (no risultati di altri tenant)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test C.4 — RAG References su documento processato

**Obiettivo:** Verificare che `processUpload` attacchi `ragRefs` al documento.

**Passi:**
1. Upload documento `test-durc.pdf` (tipo DURC)
2. Attendere fine processamento
3. Verificare campo `ragRefs` in Firestore

**Verifiche:**
```bash
firebase firestore:get /tenants/T1/companies/C1/documents/{docId}
```

**Campo atteso:**
```json
{
  "ragRefs": [
    { "source": "normativa-edilizia.pdf", "page": 3, "score": 0.85 },
    { "source": "...", "page": 1, "score": 0.78 },
    ...
  ]
}
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Categoria D — Alert & Osservabilità

### Test D.1 — Dry-run alert scadenze

**Obiettivo:** Verificare logica aggregazione documenti in scadenza per bucket (30/15/7/1 giorni).

**Comando:**
```bash
curl -X POST "https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/sendExpiryAlertsDryRun" \
  -H "Content-Type: application/json" \
  -d '{ "refDate": "2024-11-11" }'
```

**Output atteso (JSON):**
```json
{
  "dryRun": true,
  "refDate": "2024-11-11",
  "buckets": {
    "30": { "count": 5, "companies": ["C1", "C2"] },
    "15": { "count": 3, "companies": ["C1"] },
    "7": { "count": 2, "companies": ["C3"] },
    "1": { "count": 1, "companies": ["C2"] }
  }
}
```

**Verifiche:**
- [ ] Conteggi coerenti con dati Firestore
- [ ] Nessun errore 500
- [ ] Tempo risposta < 10s

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test D.2 — Email Extension trigger

**Obiettivo:** Verificare invio email via Trigger Email Extension.

**Prerequisito:** Extension **Trigger Email** installata e configurata.

**Passi:**
1. Scrivere documento in collezione `mail`:

```bash
# Via Firebase Console o CLI
firebase firestore:write /mail/test-email-001 '{
  "to": "test-recipient@example.com",
  "from": "noreply@YOUR_DOMAIN.com",
  "message": {
    "subject": "Test Alert Scadenze",
    "text": "Questo è un test.",
    "html": "<p>Questo è un <strong>test</strong>.</p>"
  }
}'
```

2. Attendere 10-30 secondi
3. Controllare inbox destinatario

**Verifiche:**
- [ ] Email ricevuta
- [ ] Mittente corretto (`MAIL_FROM`)
- [ ] Subject e body corretti
- [ ] Documento in `mail` ha campo `delivery.state: SUCCESS`

**Verifiche Firestore:**
```bash
firebase firestore:get /mail/test-email-001
```

**Campo atteso:**
```json
{
  "delivery": {
    "state": "SUCCESS",
    "endTime": "2024-11-11T...",
    "info": { "messageId": "..." }
  }
}
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test D.3 — Metriche log-based (email sent)

**Obiettivo:** Verificare che metrica `expiry_alerts_email_sent` incrementi dopo invio alert.

**Prerequisito:** Metrica creata come da `monitoring/metrics/email_sent_counter.ps1`.

**Passi:**
1. Eseguire `sendExpiryAlerts` (manualmente o attendere cron)
2. Verificare logs

```bash
gcloud logging read "resource.type=cloud_function AND jsonPayload.metric:\"expiry_alerts_email_sent\"" \
  --limit=5 --project=$(gcloud config get-value project)
```

**Output atteso:**
```json
{
  "jsonPayload": {
    "metric": "expiry_alerts_email_sent",
    "value": 1,
    "labels": { "bucket": "30" }
  }
}
```

**Verifiche Dashboard Monitoring:**
- Aprire: `https://console.cloud.google.com/monitoring/metrics-explorer`
- Metrica: `logging.googleapis.com/user/expiry_alerts_email_sent`
- Serie temporale: **almeno 1 punto dati** dopo test

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test D.4 — Nessun errore in Cloud Logging

**Obiettivo:** Verificare assenza errori critici nelle functions negli ultimi 10 minuti.

**Comando:**
```bash
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --limit=10 --project=$(gcloud config get-value project) --freshness=10m
```

**Output atteso:**
```
(nessun risultato)
```

Se ci sono errori, investigare e risolvere.

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test D.5 — Scheduled function (cron)

**Obiettivo:** Verificare che `sendExpiryAlerts` venga triggerata dallo scheduler alle 08:00 Europe/Rome.

**Prerequisito:** Cloud Scheduler configurato con cron `0 8 * * *` timezone `Europe/Rome`.

**Passi:**
1. Verificare job scheduler esistente:

```bash
gcloud scheduler jobs list --location=europe-west1 --project=$(gcloud config get-value project)
```

**Output atteso:**
```
NAME                    LOCATION       SCHEDULE (TZ)              TARGET_TYPE  STATE
sendExpiryAlerts-job    europe-west1   0 8 * * * (Europe/Rome)   HTTP         ENABLED
```

2. **(Opzionale)** Modificare temporaneamente orario per test immediato:

```bash
# Modificare a "ora attuale + 2 minuti" per test rapido
gcloud scheduler jobs update http sendExpiryAlerts-job \
  --location=europe-west1 \
  --schedule="25 14 * * *" \
  --time-zone="Europe/Rome"

# Attendere trigger
# Ripristinare schedule originale dopo test
gcloud scheduler jobs update http sendExpiryAlerts-job \
  --location=europe-west1 \
  --schedule="0 8 * * *" \
  --time-zone="Europe/Rome"
```

3. Verificare esecuzione nei logs:

```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=sendExpiryAlerts" \
  --limit=5 --project=$(gcloud config get-value project)
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Categoria E — Security

### Test E.1 — Firestore Rules: Member (company scope)

**Obiettivo:** Verificare che utente **Member** possa leggere/scrivere SOLO documenti della propria company.

**Setup:**
1. Creare utente test: `member-user@test.com`
2. Impostare custom claims:
```json
{
  "role": "member",
  "tid": "T1",
  "companyIds": ["C1"]
}
```

**Test positivi (DEVONO passare):**
```bash
# Leggere doc di C1 (propria company)
# Via Firebase Console > Firestore > Rules playground
# User: member-user@test.com
# Path: /tenants/T1/companies/C1/documents/doc001
# Operation: get
# Risultato atteso: ALLOW
```

**Test negativi (DEVONO fallire):**
```bash
# Leggere doc di C2 (altra company)
# Path: /tenants/T1/companies/C2/documents/doc002
# Operation: get
# Risultato atteso: DENY
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test E.2 — Firestore Rules: Manager (tenant scope)

**Obiettivo:** Verificare che utente **Manager** possa leggere/scrivere documenti di TUTTE le companies del proprio tenant.

**Setup:**
1. Creare utente test: `manager-user@test.com`
2. Impostare custom claims:
```json
{
  "role": "manager",
  "tid": "T1",
  "companyIds": ["C1", "C2", "C3"]
}
```

**Test positivi:**
- Leggere doc di C1: ALLOW ✅
- Leggere doc di C2: ALLOW ✅
- Leggere doc di C3: ALLOW ✅

**Test negativi:**
- Leggere doc di tenant T2: DENY ❌

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test E.3 — Storage Rules: Upload path validation

**Obiettivo:** Verificare che upload sia possibile SOLO nei path autorizzati: `docs/{tid}/{cid}/{docId}/{file}`.

**Test positivi:**
```bash
# Upload in path corretto
gsutil cp test.pdf gs://YOUR_BUCKET/docs/T1/C1/DOC123/test.pdf
# Risultato atteso: SUCCESS
```

**Test negativi:**
```bash
# Upload in path NON autorizzato (root)
gsutil cp test.pdf gs://YOUR_BUCKET/test.pdf
# Risultato atteso: 403 FORBIDDEN
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test E.4 — No download URL pubblici

**Obiettivo:** Verificare che file in Storage NON siano pubblicamente accessibili senza autenticazione.

**Passi:**
1. Upload file: `gs://YOUR_BUCKET/docs/T1/C1/DOC123/test.pdf`
2. Generare URL firmato (signed URL) con scadenza breve
3. Tentare accesso diretto senza auth

**Comando:**
```bash
# Tentativo accesso senza auth (deve fallire)
curl -I https://storage.googleapis.com/YOUR_BUCKET/docs/T1/C1/DOC123/test.pdf
```

**Output atteso:**
```
HTTP/2 403 Forbidden
```

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Categoria F — Performance & Cost

### Test F.1 — Latenza kbSearch (p95)

**Obiettivo:** Verificare che query RAG risponda entro 600ms (p95).

**Comando (ripetere 20 volte):**
```bash
for i in {1..20}; do
  time curl -s "https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/kbSearch?tid=T1&q=Normativa%20DURC&k=4" > /dev/null
done
```

**Calcolare percentile 95:**
- Ordinare i tempi di risposta
- Prendere il 19° valore (95% di 20)

**Soglia attesa:** < 600ms

**Risultato:** [ ] ✅ PASS (p95 < 600ms) | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test F.2 — Latenza processUpload (documenti brevi)

**Obiettivo:** Verificare tempo elaborazione per PDF < 5 pagine.

**Passi:**
1. Upload PDF digitale 3 pagine
2. Misurare tempo tra trigger Storage e scrittura finale in Firestore

**Verifiche log:**
```bash
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=processUpload" \
  --limit=1 --format=json --project=$(gcloud config get-value project) | jq '.[] | .timestamp'
```

**Tempo atteso:** < 15 secondi (PDF digitale), < 30 secondi (PDF scansionato con OCR)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test F.3 — Billing: nessun picco anomalo Document AI

**Obiettivo:** Verificare spesa Document AI nel giorno 0 post-deploy.

**Comando:**
```bash
# Aprire dashboard billing
# https://console.cloud.google.com/billing/YOUR_BILLING_ACCOUNT/reports

# Filtrare per servizio: "Cloud Document AI API"
# Periodo: ultime 24 ore
```

**Verifiche:**
- [ ] Spesa giornaliera < $XX (soglia concordata)
- [ ] Numero pagine processate coerente con upload effettuati
- [ ] Nessun picco anomalo (10x normale)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

### Test F.4 — Billing: Firestore reads/writes

**Obiettivo:** Verificare volume operazioni Firestore coerente.

**Comando:**
```bash
# Dashboard Cloud Console > Firestore > Usage
# Periodo: ultime 24 ore
```

**Verifiche:**
- Reads: coerenti con query dashboard/scadenze/repository
- Writes: coerenti con upload/processamento documenti
- Nessun loop infinito (writes costanti senza input)

**Risultato:** [ ] ✅ PASS | [ ] ❌ FAIL  
**Note:** _____________________

---

## Summary & Sign-off

### Riepilogo risultati

**Categoria A — Base Vita:**  
[ ] A.1 | [ ] A.2 | [ ] A.3

**Categoria B — Pipeline Documentale:**  
[ ] B.1 | [ ] B.2 | [ ] B.3 | [ ] B.4

**Categoria C — RAG:**  
[ ] C.1 | [ ] C.2 | [ ] C.3 | [ ] C.4

**Categoria D — Alert & Osservabilità:**  
[ ] D.1 | [ ] D.2 | [ ] D.3 | [ ] D.4 | [ ] D.5

**Categoria E — Security:**  
[ ] E.1 | [ ] E.2 | [ ] E.3 | [ ] E.4

**Categoria F — Performance & Cost:**  
[ ] F.1 | [ ] F.2 | [ ] F.3 | [ ] F.4

---

### Decisione GO/NO-GO

**Totale test:** 21  
**Test passati:** ___ / 21  
**Test falliti:** ___ / 21

**Decisione:**
- [ ] 🟢 **GO** — Tutti i test passati, deploy confermato
- [ ] 🔴 **NO-GO** — Almeno 1 test fallito, richiesto fix e re-test

---

### Firma responsabile test

**Nome:** ________________  
**Ruolo:** ________________  
**Data:** ________________  
**Commit SHA testato:** ________________

---

**Note aggiuntive / Issue riscontrati:**

_______________________________________________________
_______________________________________________________
_______________________________________________________

