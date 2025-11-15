# Exit Tests - Vertex AI + RAG Upstream (STAGING)

Exit tests obbligatori per validare il deployment Vertex AI con RAG upstream in staging.

## Pre-requisiti

- [ ] `USE_VERTEX=true` in `.env.stg`
- [ ] Vertex AI API abilitata (`aiplatform.googleapis.com`)
- [ ] IAM configurato (`roles/aiplatform.user` per Cloud Functions SA)
- [ ] `GEMINI_API_KEY` secret presente (per RAG embeddings)
- [ ] Rulebook v1 presente in Firestore (`rulebooks/v1`) o come fallback file
- [ ] KB chunks ingested in `tenants/{tid}/kb_chunks` con embedding dim=768

---

## Categoria A - Smoke Tests

### Test 1: Health Check
**Obiettivo**: Verificare che le functions siano deployate e raggiungibili

```bash
curl https://europe-west1-repository-ai-477311.cloudfunctions.net/health
```

**Atteso**: `200 OK` con body `"ok"`

---

### Test 2: Vertex AI Model Access
**Obiettivo**: Verificare che il modello Gemini 2.0 Flash sia accessibile in `europe-west1`

**Metodo**: Upload di un PDF test → verifica log Cloud Logging per `[Vertex] Calling gemini-2.0-flash-001 in europe-west1`

**Atteso**: Log senza errori `403 Forbidden` o `404 Not Found` su modello

---

## Categoria B - Pipeline Documentale

### Test 3: PDF Digitale (DURC valido)
**Obiettivo**: Validare flusso completo con PDF digitale (no OCR)

**Input**:
- PDF digitale DURC valido (<120 giorni)
- Tenant demo con KB chunks ingested

**Atteso**:
```json
{
  "docType": "DURC",
  "status": "idoneo",
  "confidence": >= 0.8,
  "ocrUsed": false,
  "provider": "vertex-ai",
  "citations": [/* almeno 1 citation */]
}
```

**Verifica log**:
- `[Pipeline] Detected docType: DURC`
- `[RAG] Retrieved X/6 chunks`
- `[Pipeline] Loaded Y rules for DURC`
- `[Pipeline] Done: DURC → idoneo`

---

### Test 4: PDF Scansionato (POS)
**Obiettivo**: Validare OCR + Vertex validation

**Input**:
- PDF scansionato (POS)
- Tenant demo con KB chunks

**Atteso**:
```json
{
  "docType": "POS",
  "ocrUsed": true,
  "provider": "vertex-ai",
  "citations": [/* array */]
}
```

**Verifica log**:
- `Calling Document AI OCR (EU)...`
- `OCR pages: X, OCR text length: Y`
- `[Pipeline] Detected docType: POS`

---

### Test 5: DURC Scaduto (Deterministic Override)
**Obiettivo**: Verificare che regole deterministiche vincano su LLM

**Input**:
- PDF DURC con `issuedAt` > 120 giorni fa

**Atteso**:
```json
{
  "docType": "DURC",
  "status": "non_idoneo",
  "reason": "DURC scaduto: XXX giorni dalla emissione (max 120)",
  "confidence": 1.0
}
```

**Verifica log**:
- `[Pipeline] DURC OVERRIDE: XXX days > 120, marking as non_idoneo`

---

### Test 6: Idempotenza
**Obiettivo**: Re-upload stesso file → skip processing

**Metodo**:
1. Upload PDF test
2. Attendi completamento
3. Re-upload STESSO file (stesso bucket path)

**Atteso**:
- Log: `Already processed, skip`
- No nuovo processing
- `lastProcessedGen` e `contentHash` invariati

---

## Categoria C - RAG & Rulebook

### Test 7: RAG Retrieval
**Obiettivo**: Verificare che il retrieval KB funzioni

**Metodo**:
- Upload documento che richiede regole specifiche (es. Formazione Preposti)

**Atteso**:
```json
{
  "citations": [
    {
      "id": "kb:DM_16_01_97:p12",
      "source": "DM_16_01_97.pdf",
      "page": 12,
      "snippet": "..."
    }
  ]
}
```

**Verifica log**:
- `[RAG] Retrieved X/6 chunks in Yms (minScore=0.3)`
- `[Pipeline] Loaded Z rules for Formazione_Preposti`

---

### Test 8: Rulebook Fallback
**Obiettivo**: Verificare fallback a file locale se Firestore non disponibile

**Metodo**:
1. Cancella temporaneamente `rulebooks/v1` da Firestore
2. Upload documento

**Atteso**:
- Log: `[Rulebook] Using fallback file`
- Processing completa comunque

---

### Test 9: Transitorio Preposti (8h → 12h)
**Obiettivo**: Validare regola transitoria da rulebook

**Input**:
- PDF attestato preposti 8 ore con data corso **< 12/2025**

**Atteso**:
```json
{
  "docType": "Formazione_Preposti",
  "status": "idoneo",
  "reason": "Corso 8 ore valido in regime transitorio"
}
```

**Input 2**:
- PDF attestato preposti 8 ore con data corso **> 12/2025**

**Atteso**:
```json
{
  "status": "non_idoneo",
  "reason": "Ore insufficienti: richieste 12 ore (post riforma)"
}
```

---

## Categoria D - PII Redaction

### Test 10: PII Redacted (Formazione Lavoratori)
**Obiettivo**: Verificare redazione PII per documenti che non la richiedono

**Input**:
- PDF attestato formazione con CF/PIVA

**Atteso**:
- Log NON contiene CF/PIVA originali
- Testo passato al modello contiene `[CF_REDACTED]` e `[PIVA_REDACTED]`

**Metodo verifica**:
Controllare log strutturati (NON devono esserci PII in chiaro)

---

### Test 11: PII Non Redacted (Visura Camerale)
**Obiettivo**: Verificare che PII sia conservata quando necessaria

**Input**:
- PDF Visura Camerale (needsPII=true nel rulebook)

**Atteso**:
- Testo NON redatto passato al modello
- CF/PIVA visibili in `computed` fields

---

## Categoria E - Fallback & Resilienza

### Test 12: Fallback Legacy (USE_VERTEX=false)
**Obiettivo**: Verificare che legacy pipeline funzioni

**Metodo**:
1. Set `USE_VERTEX=false` in `.env.stg`
2. Redeploy functions
3. Upload PDF test

**Atteso**:
```json
{
  "provider": "legacy",
  "status": "...",
  "confidence": "..."
}
```

**Verifica log**:
- `[Pipeline] Using legacy pipeline (emulator or USE_VERTEX=false)`

---

### Test 13: Fallback su Errore Vertex (ALLOW_LEGACY_FALLBACK=true)
**Obiettivo**: Verificare fallback automatico su errore Vertex

**Metodo**:
1. Forzare errore Vertex (es. `FORCE_VERTEX_FAIL=1` env var)
2. Upload PDF

**Atteso**:
- Log: `[Validate] Falling back to legacy Gemini API`
- `fallbackUsed: true` nel log strutturato
- Processing completa con `provider: "legacy"`

---

## Categoria F - Performance & Latency

### Test 14: Latency p95 < 15s (Gemini 2.0 Flash)
**Obiettivo**: Verificare latenza accettabile

**Metodo**:
- Upload 10 PDF test (mix digitali/scansionati)
- Calcolare p95 latency da log `latencyMs`

**Atteso**:
- p95 < 15000ms (15s) con `gemini-2.0-flash-001`
- Se > 15s, investigare (KB troppo grande? OCR lento?)

---

### Test 15: KB Query Performance
**Obiettivo**: Verificare che query vettoriale sia rapida

**Metodo**:
- Analizzare log `[RAG] Retrieved X/6 chunks in Yms`

**Atteso**:
- Y < 500ms per query RAG
- Se > 500ms, verificare indice Firestore Vector Search

---

## Categoria G - Structured Logging

### Test 16: Log Strutturati Presenti
**Obiettivo**: Verificare che log strutturati siano emessi

**Metodo**:
- Upload PDF → controllare Cloud Logging

**Atteso**:
Log JSON con chiavi:
```json
{
  "event": "validate_doc_start|validate_doc_done",
  "docType": "...",
  "model": "gemini-2.0-flash-001",
  "region": "europe-west1",
  "latencyMs": 1234,
  "ragHits": 6,
  "decision": "idoneo",
  "confidence": 0.85,
  "useVertex": true,
  "fallbackUsed": false
}
```

---

## Categoria H - Citations & Traceability

### Test 17: Citations Complete
**Obiettivo**: Verificare che citazioni normative siano complete

**Input**:
- PDF che viola regola specifica (es. DURC scaduto)

**Atteso**:
```json
{
  "citations": [
    {
      "id": "kb:...",
      "source": "...",
      "page": N,
      "snippet": "..."
    }
  ]
}
```

Verificare che:
- Almeno 1 citation presente
- `snippet` non vuoto
- `source` e `page` valorizzati

---

## Esecuzione Exit Tests

### Staging Deploy
```bash
firebase use stg
firebase deploy --only functions --env-vars-file functions/.env.stg
```

### Run Tests
Eseguire i 17 test sopra in ordine, spuntando `[ ]` → `[x]` quando passano.

### Criterio Go/No-Go
**GO** se:
- Tutti test **A-C** (Pipeline Core) passano
- Almeno 80% test **D-H** passano
- Nessun errore critico (500) su test principali

**NO-GO** se:
- Test 3, 4, 5 falliscono (core validation non funziona)
- Latency p95 > 20s
- Vertex API non accessibile (403/404)

---

## Log Query Utili (Cloud Logging)

### Errori Vertex AI
```
resource.type="cloud_function"
resource.labels.function_name="processUpload"
jsonPayload.event="validate_doc_error"
```

### Performance RAG
```
resource.type="cloud_function"
jsonPayload.event=~"validate_doc_done"
```

Poi usa "Distribution" chart su `jsonPayload.latencyMs`

---

## Rollback Plan

Se exit tests falliscono:

1. **Immediato**: Set `USE_VERTEX=false` + redeploy
2. **Risoluzione**: Investigare error logs
3. **Retry**: Fix + redeploy + re-run exit tests
4. **Escalation**: Se dopo 3 tentativi non passa, ritorno a commit precedente (`pre-vertex-v1.0` tag)

---

## Next Steps (dopo GO)

- [ ] Run tests in **production** (con tenant demo)
- [ ] Monitor costi Vertex AI per 7 giorni
- [ ] Abilitare `USE_VERTEX=true` progressivamente per tenant reali
- [ ] Raccogliere feedback utenti su qualità validazione

