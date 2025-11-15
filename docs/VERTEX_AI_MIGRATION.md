# Vertex AI + RAG Upstream - Migration Guide

## Overview

Migrazione da Gemini Developer API a **Vertex AI (EU)** con **RAG upstream** per compliance GDPR e migliore qualità di validazione.

---

## Architettura Nuova vs Vecchia

### PRIMA (Legacy Pipeline)
```
Upload PDF → OCR → LLM Normalization → Regole Deterministiche → Persistenza → [RAG citazioni post-facto]
```

**Problemi**:
- LLM validava **senza contesto** normativo
- RAG solo per citazioni a posteriori
- Gemini Developer API: **no garanzia EU data residency**
- PII inviata al modello senza redaction

### DOPO (Vertex + RAG Upstream)
```
Upload PDF → OCR → DocType Classification → RAG Retrieval (upstream) → Load Rulebook → 
Vertex Validation (con contesto) → Regole Deterministiche Override → Persistenza
```

**Vantaggi**:
- LLM riceve **contesto normativo prima** della validazione
- **Vertex AI (europe-west1)**: garantisce EU data residency
- **PII redaction** configurabile per docType
- **Structured Output**: JSON schema forzato
- **Citations tracciabili** (ID univoci da RAG)
- **Fallback legacy** per staging

---

## Componenti Nuovi

### 1. `vertexValidator.ts`
- Adapter per Vertex AI SDK
- Schema JSON per Structured Output
- Chiamata a `gemini-2.0-flash-001` in `europe-west1`
- Temperature=0 per output deterministico
- Logging strutturato (latency, confidence, decision)

### 2. `validateDocument.ts`
- Wrapper con feature flag `USE_VERTEX`
- Fallback automatico a legacy Gemini API (staging only)
- Retry logic con backoff

### 3. `ragRetriever.ts`
- Query inline su Firestore Vector Search
- Embedding query con `text-embedding-004`
- Tenant filter + distanceThreshold (minScore)
- Citations con ID univoci (`kb:source:pX`)

### 4. `rulebookLoader.ts`
- Caricamento rulebook da Firestore (`rulebooks/v1`)
- Fallback a file locale (`src/rulebook/rulebook-v1.json`)
- In-memory cache (5 min TTL)
- Fuzzy matching docType (case-insensitive)
- Heuristic classification (keywords) per docType

### 5. `rulebook-v1.json`
- 7 docTypes: DURC, Visura_Camerale, Formazione_Preposti, Formazione_Lavoratori, 
  Registro_Controlli_Antincendio, POS, DVR
- Per ogni docType: `checksRequired`, `deroghe`, `notes`, `needsPII`
- Derivato da Excel committente ("Cosa controllare e riferimenti normativi.xlsx")

---

## Feature Flags

### Variabili `.env.stg` / `.env.prod`

```bash
# Vertex AI
USE_VERTEX=true                              # Abilita Vertex AI (false = legacy)
VERTEX_LOCATION=europe-west1                  # Regione EU
VERTEX_PROJECT_ID=repository-ai-477311       # Project ID
VERTEX_MODEL_ID=gemini-2.0-flash-001         # Modello default
VERTEX_MODEL_ID_FALLBACK=gemini-1.5-pro-002  # Se 2.0 non disponibile
RAG_MODE=FIRESTORE                            # RAG backend
ALLOW_LEGACY_FALLBACK=true                    # Fallback su errore (staging only)
```

**Staging**: `ALLOW_LEGACY_FALLBACK=true` (permette fallback su errore)  
**Production**: `ALLOW_LEGACY_FALLBACK=false` (fail-fast)

---

## Flusso Dettagliato

### Upload PDF → Validazione

1. **Storage Trigger** (`onObjectFinalized`)
   - Bucket: `repository-ai-477311.appspot.com`
   - Path: `docs/{tenant}/{company}/{docId}.pdf`

2. **Idempotency Check**
   - SHA1 hash del file
   - Skip se `contentHash` + `lastProcessedGen` invariati

3. **OCR (Document AI EU)**
   - Se PDF nativo ha >200 char/page → skip OCR
   - Altrimenti → Document AI `eu` region
   - Output: `fullText`

4. **DocType Classification (Heuristic)**
   - Keyword matching su `fullText`
   - Fallback: "ALTRO" se nessun match
   - Es: "DURC" se contiene "regolarità contributiva"

5. **RAG Retrieval (UPSTREAM)**
   - Query: `buildRAGQuery(fullText, docType)`
   - Embedding con `text-embedding-004` (dim=768)
   - Vector search su `tenants/{tid}/kb_chunks`
   - TopK=6, minScore=0.3
   - Output: `contextChunks[]` con citations IDs

6. **Load Rulebook**
   - Firestore `rulebooks/v1` (primary)
   - Fallback: `src/rulebook/rulebook-v1.json`
   - Cache 5 min
   - Output: `rulebookRules[]` per docType

7. **PII Redaction**
   - Se `needsPII=false` → regex redaction di CF/PIVA
   - `[CF_REDACTED]`, `[PIVA_REDACTED]`

8. **Vertex Validation**
   - Model: `gemini-2.0-flash-001` @ `europe-west1`
   - Input: `fullText` + `contextChunks` + `rulebookRules`
   - ResponseSchema: Structured JSON (vedi schema sotto)
   - Temperature=0
   - Output: `ValidationOutput`

9. **Deterministic Override (DURC)**
   - Se `docType=DURC` AND `issuedAt > 120 giorni fa`:
     - `finalDecision = "non_idoneo"`
     - `finalReason = "DURC scaduto: XXX giorni"`
     - `confidence = 1.0`

10. **Persistenza Firestore**
    - Doc: `tenants/{tid}/companies/{cid}/documents/{docId}`
    - Fields: `docType`, `status`, `reason`, `confidence`, `citations`, `issuedAt`, `expiresAt`, 
              `daysToExpiry`, `ocrUsed`, `provider`, `lastProcessedGen`, `contentHash`

---

## Structured Output Schema

```typescript
{
  docType: string;                          // "DURC", "POS", ecc.
  isRelevant: boolean;                      // false → "non pertinente (quindi idoneo)"
  finalDecision: "idoneo" | "non_idoneo" | "necessita_verifica_umana";
  decisionReason: string;
  checks: Array<{
    id: string;                             // "durc_validity_120d"
    status: "pass" | "fail" | "not_applicable";
    detail?: string;
    citationIds?: string[];                 // ["kb:DM_16_01_97:p12"]
  }>;
  computed?: {
    issuedAt?: string;                      // "YYYY-MM-DD"
    expiresAt?: string;                     // "YYYY-MM-DD"
    daysToExpiry?: number;
  };
  citations: Array<{
    id: string;                             // "kb:source:pX"
    source: string;                         // "DM_16_01_97.pdf"
    page?: number;
    snippet: string;
  }>;
  confidence: number;                       // 0..1
}
```

---

## Compliance EU (GDPR)

### Vertex AI Regional Endpoints
- **Endpoint**: `europe-west1-aiplatform.googleapis.com`
- **Data Residency**: dati a riposo restano in EU
- **Processing**: eseguito in regione EU
- **Nessun global endpoint** usato

### Document AI
- **Location**: `eu` (multi-region)
- **OK** per compliance

### Firestore & Storage
- **Location**: `europe-west1`
- **OK** per compliance

### PII Minimization
- Redaction automatica per docType con `needsPII=false`
- Regex: CF italiano (`[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]`), P.IVA (`\d{11}`)

---

## Rollback Strategy

### Immediato (< 5 min)
1. Set `USE_VERTEX=false` in `.env.prod`
2. `firebase deploy --only functions --env-vars-file functions/.env.prod`
3. Traffico torna a legacy pipeline

### Long-term (se migrazione fallisce)
1. `git checkout pre-vertex-v1.0` (tag pre-migrazione)
2. `firebase deploy --only functions`
3. Restore `.env` precedenti

---

## Monitoring & Logging

### Log Strutturati (Cloud Logging)

**Validation Start**:
```json
{
  "event": "validate_doc_start",
  "docType": "DURC",
  "useVertex": true,
  "ragHits": 6
}
```

**Validation Done**:
```json
{
  "event": "validate_doc_done",
  "docType": "DURC",
  "model": "gemini-2.0-flash-001",
  "region": "europe-west1",
  "latencyMs": 3200,
  "decision": "idoneo",
  "confidence": 0.92,
  "ragHits": 6,
  "useVertex": true,
  "fallbackUsed": false
}
```

**Validation Error**:
```json
{
  "event": "validate_doc_error",
  "docType": "DURC",
  "model": "gemini-2.0-flash-001",
  "error": "Vertex AI validation failed: ...",
  "useVertex": true
}
```

### Metriche Consigliate (Log-based)

1. **Latency p95**: `jsonPayload.latencyMs`
2. **Confidence avg**: `jsonPayload.confidence`
3. **RAG hits avg**: `jsonPayload.ragHits`
4. **Fallback rate**: count where `jsonPayload.fallbackUsed=true`
5. **Error rate**: count where `jsonPayload.event="validate_doc_error"`

### Alert Suggeriti

- **Error Rate > 5%** (15 min window)
- **Latency p95 > 20s** (30 min window)
- **Fallback Rate > 10%** (1 hour window)

---

## Costs Estimation

### Vertex AI (Gemini 2.0 Flash)
- **Input**: ~$0.15 / 1M tokens
- **Output**: ~$0.60 / 1M tokens
- **Avg document**: 2K tokens input + 500 tokens output
- **Cost per validation**: ~$0.0006

### Document AI (EU)
- **OCR**: ~$1.50 / 1000 pages
- **Avg document**: 3 pages
- **Cost per OCR**: ~$0.0045

### Firestore Vector Search
- **Query**: included in Firestore read pricing
- **Embedding storage**: negligible (KB chunks pre-indexed)

### Total per Document
- **Digital PDF** (no OCR): ~$0.0006
- **Scanned PDF** (with OCR): ~$0.0051

**For 1000 docs/month**: ~$3-5/month (mostly OCR)

---

## Next Steps

1. **Run Exit Tests** (vedi `docs/EXIT_TESTS_VERTEX.md`)
2. **Monitor staging** for 3-7 days
3. **Enable in production** with gradual rollout:
   - Day 1: 10% traffic (`USE_VERTEX=true` for 1 tenant)
   - Day 3: 50% traffic
   - Day 7: 100% traffic
4. **Decommission legacy** after 30 days stable

---

## Troubleshooting

### Error: "403 Forbidden" su Vertex AI
- **Causa**: IAM role mancante
- **Fix**: `gcloud projects add-iam-policy-binding ... --role="roles/aiplatform.user"`

### Error: "404 Not Found" su modello
- **Causa**: Modello non disponibile in `europe-west1`
- **Fix**: Usa fallback model (`VERTEX_MODEL_ID_FALLBACK=gemini-1.5-pro-002`)

### Latency Alta (>15s)
- **Causa 1**: KB troppo grande (>500 chunks)
  - **Fix**: Increase `minScore` threshold o limit `topK`
- **Causa 2**: OCR Document AI lento
  - **Fix**: Aumenta `DOC_AI_BATCH_MIN_PAGES` per batch async

### RAG Returns 0 Chunks
- **Causa**: Nessun chunk indexed per tenant, o query troppo specifica
- **Fix**: Verificare `tenants/{tid}/kb_chunks` ha documenti; abbassare `minScore`

### Citations Vuote
- **Causa**: LLM non referenzia gli ID forniti
- **Fix**: Verificare prompt contiene `[[CIT:...]]` markers; aumentare contesto RAG

---

## References

- [Vertex AI Data Residency](https://cloud.google.com/vertex-ai/docs/general/locations)
- [Gemini 2.0 Models](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)
- [Structured Output](https://cloud.google.com/vertex-ai/docs/generative-ai/multimodal/control-generated-output)
- [Firestore Vector Search](https://firebase.google.com/docs/firestore/vector-search)
- [Document AI Regions](https://cloud.google.com/document-ai/docs/regions)

