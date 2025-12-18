# 📖 Runbook Operativo — Sistema Gestione Documenti

**Versione:** 1.0  
**Ambiente:** Production (`repository-ai-477311`)  
**Ultima revisione:** 2024-11-11

> **Scopo:** Fornire procedure standard per operazioni comuni, troubleshooting e gestione emergenze.

---

## 📋 Indice

1. [Deploy & Rollback](#deploy--rollback)
2. [Monitoraggio & Logs](#monitoraggio--logs)
3. [Gestione Segreti](#gestione-segreti)
4. [Troubleshooting Comune](#troubleshooting-comune)
5. [Gestione Utenti](#gestione-utenti)
6. [Gestione Costi](#gestione-costi)
7. [Incident Response](#incident-response)
8. [Backup & Recovery](#backup--recovery)

---

## 1. Deploy & Rollback

### 1.1 Deploy Standard (Staging → Production)

**Prerequisiti:**
- [x] Tutti i test passati su staging
- [x] Code review approvata
- [x] Commit taggato (es. `v1.0.1`)

**Procedura:**

```bash
# 1. Verifica branch e commit
git status
git log -1 --oneline

# 2. Switch a staging
firebase use stg

# 3. Deploy staging
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# 4. Esegui exit tests (vedi docs/EXIT_TESTS.md)
# Se OK, procedi

# 5. Switch a production
firebase use prod

# 6. Deploy production
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# 7. Verifica post-deploy
curl https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/health
# Output atteso: "ok"

# 8. Monitorare logs per 10 minuti
gcloud logging tail "resource.type=cloud_function" --project=$(gcloud config get-value project)
```

**Tempo stimato:** 15-25 minuti

---

### 1.2 Rollback Rapido

#### Scenario A: Rollback solo Hosting

```bash
# 1. Switch a production
firebase use prod

# 2. Lista versioni hosting
firebase hosting:channel:list

# 3. Rollback via Firebase Console
# Alternativa: re-deploy commit precedente
git checkout v1.0.0  # tag stabile precedente
firebase deploy --only hosting
```

**Tempo:** 3-5 minuti

---

#### Scenario B: Rollback Functions

```bash
# 1. Identifica commit "last known good"
cat .last-production-deploy.txt
# Output: SHA commit stabile

# 2. Checkout commit precedente
git checkout <SHA_COMMIT_STABILE>

# 3. Re-deploy functions
firebase use prod
cd functions && npm run build && cd ..
firebase deploy --only functions

# 4. Verifica
firebase functions:list
curl https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/health
```

**Tempo:** 5-8 minuti

---

#### Scenario C: Rollback Completo

```bash
# 1. Checkout tag stabile
git checkout v1.0.0

# 2. Deploy tutto
firebase use prod
firebase deploy

# 3. Verifica exit tests critici
# - Health check
# - Auth flow
# - Upload singolo documento
```

**Tempo:** 10-15 minuti

---

### 1.3 Hotfix in Produzione (Emergenza)

**Scenario:** Bug critico in produzione, serve fix immediato.

```bash
# 1. Creare branch hotfix
git checkout main
git pull
git checkout -b hotfix/critical-bug-fix

# 2. Implementare fix minimale
# (editare solo file necessari)

# 3. Commit con messaggio descrittivo
git add .
git commit -m "hotfix: Fix critical bug in processUpload timeout"

# 4. Test locale se possibile
npm run build
npm run typecheck

# 5. Deploy diretto su production (SOLO emergenze)
firebase use prod
firebase deploy --only functions:processUpload

# 6. Verifica immediata
gcloud logging tail "resource.type=cloud_function AND resource.labels.function_name=processUpload" \
  --limit=10 --project=$(gcloud config get-value project)

# 7. Post-mortem: merge hotfix in main
git checkout main
git merge hotfix/critical-bug-fix
git push origin main
git tag -a v1.0.1-hotfix -m "Hotfix: descrizione"
git push origin v1.0.1-hotfix
```

**⚠️ ATTENZIONE:** Hotfix production è procedura di emergenza. Sempre seguire staging→prod per deploy pianificati.

---

## 2. Monitoraggio & Logs

### 2.1 Accesso Logs Production

#### Via gcloud CLI

```bash
# Tail real-time (tutte le functions)
gcloud logging tail "resource.type=cloud_function" \
  --project=repository-ai-477311

# Logs specifica function (ultimi 50)
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=processUpload" \
  --limit=50 --project=repository-ai-477311

# Filtra per errori (ultime 24h)
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --limit=50 --project=repository-ai-477311 --freshness=24h

# Cerca testo specifico
gcloud logging read "resource.type=cloud_function AND textPayload:\"Document AI\"" \
  --limit=20 --project=repository-ai-477311
```

#### Via Console UI

1. Aprire: https://console.cloud.google.com/logs
2. Selezionare progetto: `repository-ai-477311`
3. Filtri utili:
   - `resource.type="cloud_function"`
   - `resource.labels.function_name="processUpload"`
   - `severity>=ERROR`

---

### 2.2 Dashboard Monitoring

**Accesso:** https://console.cloud.google.com/monitoring/dashboards

**Dashboard chiave:**

1. **Functions Overview**
   - Metriche: invocazioni, errori, durata, memoria
   - Alert: error rate >1%, latency p95 > soglie

2. **Document AI Usage**
   - Metriche: pagine processate, costi giornalieri
   - Alert: spesa giornaliera > budget

3. **Firestore Operations**
   - Metriche: reads/writes, storage size
   - Alert: anomalie volume operazioni

4. **Custom Metrics**
   - `expiry_alerts_email_sent`: tracking email alert
   - `kbSearch_latency`: latenza RAG query

---

### 2.3 Alert Configurati

| Alert | Condizione | Azione |
|-------|------------|--------|
| Function Error Rate | >1% per 5 min | Notifica Slack + On-call |
| Function Timeout | >10% invocazioni | Investigare timeout config |
| Document AI Daily Cost | >€20/giorno | Review usage + budget alert |
| Firestore Read Spike | >10K reads/min | Check loop infiniti |
| Alert Heartbeat Missing | Nessun alert 24h | Verificare scheduler |
| Zero Emails Sent | 0 email in 48h | Check email extension |

**Canale notifiche:** `#sikuro-production-alerts` (Slack)

---

## 3. Gestione Segreti

### 3.1 Visualizzare Segreti Disponibili

```bash
# Lista segreti in Secret Manager
firebase use prod
gcloud secrets list --project=$(gcloud config get-value project)

# Verifica versione attiva
gcloud secrets versions list DOC_AI_PROCESSOR_ID --project=$(gcloud config get-value project)
gcloud secrets versions list GEMINI_API_KEY --project=$(gcloud config get-value project)
```

---

### 3.2 Aggiornare Segreto (Rotation)

**Scenario:** Rotazione chiave API Gemini.

```bash
# 1. Creare nuova versione segreto
echo -n "NEW_GEMINI_API_KEY_VALUE" | \
  gcloud secrets versions add GEMINI_API_KEY \
  --data-file=- \
  --project=repository-ai-477311

# 2. Verificare nuova versione attiva
gcloud secrets versions list GEMINI_API_KEY --project=repository-ai-477311
# Output: versione "2" ENABLED, versione "1" DISABLED

# 3. Re-deploy functions per applicare nuovo segreto
firebase use prod
firebase deploy --only functions

# 4. Verificare funzionamento
# Upload documento test → verificare log LLM call
```

**⚠️ ATTENZIONE:** Disabilitare versione vecchia solo DOPO verifica nuovo segreto funziona.

```bash
# Disabilita versione vecchia (dopo verifica)
gcloud secrets versions disable 1 --secret=GEMINI_API_KEY --project=repository-ai-477311
```

---

### 3.3 Aggiungere Nuovo Segreto

```bash
# 1. Creare segreto
echo -n "SECRET_VALUE" | \
  gcloud secrets create NEW_SECRET_NAME \
  --data-file=- \
  --replication-policy=automatic \
  --project=repository-ai-477311

# 2. Grant accesso a Service Account Functions
gcloud secrets add-iam-policy-binding NEW_SECRET_NAME \
  --member="serviceAccount:repository-ai-477311@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=repository-ai-477311

# 3. Aggiornare codice function per usare nuovo segreto
# In functions/src/index.ts:
# const NEW_SECRET = defineSecret("NEW_SECRET_NAME");
# ...
# secrets: [DOC_AI_PROCESSOR_ID, GEMINI_API_KEY, NEW_SECRET]

# 4. Deploy
firebase deploy --only functions
```

---

## 4. Troubleshooting Comune

### 4.1 Upload Fallisce: "Permission Denied"

**Sintomi:**
- Utente non riesce a caricare PDF
- Errore: `403 Forbidden` o `Permission denied`

**Diagnosi:**
```bash
# 1. Verifica custom claims utente
firebase auth:export --format=JSON users.json
cat users.json | jq '.users[] | select(.email=="user@example.com") | .customClaims'

# 2. Verifica Storage rules
cat storage.rules
```

**Soluzioni:**

**A) Custom claims mancanti o errati:**
```javascript
// Via Firebase Console > Authentication > Users > Modifica claims
// O via script:
// functions/src/auth/devSetClaims.ts (solo emulator/staging)
```

**B) Storage rules troppo restrittive:**
```javascript
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /docs/{tid}/{cid}/{docId}/{file} {
      allow write: if request.auth != null 
        && request.auth.token.tid == tid
        && (request.auth.token.companyIds.hasAny([cid]) || request.auth.token.role == 'admin');
    }
  }
}
```

**C) Path upload errato:**
- Verificare che frontend usi path: `docs/{tid}/{cid}/{docId}/{filename}`

---

### 4.2 Documento Bloccato su "Processing"

**Sintomi:**
- Upload completato ma status documento resta "processing" per >5 minuti

**Diagnosi:**
```bash
# 1. Verifica logs function processUpload
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=processUpload" \
  --limit=20 --project=repository-ai-477311 | grep -i error

# 2. Verifica documento in Firestore
firebase firestore:get /tenants/{tid}/companies/{cid}/documents/{docId}
```

**Cause comuni:**

**A) Timeout function:**
```bash
# Aumentare timeout (se < 180s)
# In functions/src/index.ts:
export const processUpload = onObjectFinalized(
  {
    region: "europe-west1",
    timeoutSeconds: 180,  // <-- verificare
    ...
  },
  async (event) => { ... }
);

# Re-deploy
firebase deploy --only functions:processUpload
```

**B) Document AI errore:**
```bash
# Verificare quota/permessi
gcloud services enable documentai.googleapis.com --project=repository-ai-477311

# Verificare IAM
gcloud projects get-iam-policy repository-ai-477311 \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/documentai.apiUser"
```

**C) Gemini API errore:**
```bash
# Verificare segreto valido
gcloud secrets versions access latest --secret=GEMINI_API_KEY --project=repository-ai-477311

# Test manuale API
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
```

**Fix immediato:**
```bash
# Re-trigger manualmente function (ri-upload file)
# O forzare re-process cambiando generation:
gsutil cp gs://BUCKET/docs/T1/C1/DOC123/file.pdf /tmp/file.pdf
gsutil rm gs://BUCKET/docs/T1/C1/DOC123/file.pdf
gsutil cp /tmp/file.pdf gs://BUCKET/docs/T1/C1/DOC123/file.pdf
```

---

### 4.3 Email Alert Non Inviate

**Sintomi:**
- Scheduler eseguito ma nessuna email ricevuta
- Log: "sendExpiryAlerts" completato senza errori

**Diagnosi:**
```bash
# 1. Verifica esecuzione scheduler
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=sendExpiryAlerts" \
  --limit=5 --project=repository-ai-477311

# 2. Verifica documenti in `mail` collection
firebase firestore:query /mail --limit=10 --order-by createdAt desc

# 3. Verifica Extension "Trigger Email"
# Firebase Console > Extensions > Trigger Email > Dashboard
```

**Cause comuni:**

**A) Extension non configurata:**
```bash
# Verifica extension installata
firebase ext:list

# Se mancante, installa:
firebase ext:install firebase/firestore-send-email
```

**B) SMTP config errata:**
```yaml
# In extension config (Firebase Console):
SMTP_CONNECTION_URI: smtp://USERNAME:PASSWORD@smtp.gmail.com:587
DEFAULT_FROM: noreply@YOUR_DOMAIN.com
```

**C) Collection path errata:**
```typescript
// In alerts/common.ts, verificare:
const mailRef = db.collection('mail').doc();  // path corretto: /mail
```

**D) Documenti in stato "ERROR":**
```bash
# Query documenti email falliti
firebase firestore:query /mail --where "delivery.state==ERROR" --limit=10
```

---

### 4.4 RAG Search Non Ritorna Risultati

**Sintomi:**
- Query `kbSearch` ritorna array vuoto: `{ results: [] }`

**Diagnosi:**
```bash
# 1. Verifica chunks in Firestore
firebase firestore:query /kb_chunks --where "tid==T1" --limit=5

# 2. Verifica embeddings presenti
firebase firestore:get /kb_chunks/{chunkId}
# Campo: "embedding": [0.123, -0.456, ...]  (array 768 elementi)
```

**Cause comuni:**

**A) Knowledge base vuota:**
```bash
# Ingest documenti normativi
curl -X POST "https://europe-west1-repository-ai-477311.cloudfunctions.net/kbIngestFromStorage" \
  -H "Content-Type: application/json" \
  -d '{
    "bucket": "repository-ai-477311.appspot.com",
    "name": "kb/T1/normativa.pdf"
  }'
```

**B) Indice vettoriale mancante:**
```bash
# Verificare in firestore.indexes.json
cat firestore.indexes.json | jq '.indexes[] | select(.collectionGroup=="kb_chunks")'

# Deploy indice
firebase deploy --only firestore:indexes
```

**C) Prefiltro tenant troppo restrittivo:**
```typescript
// In rag/query.ts, verificare:
const chunks = await db.collection('kb_chunks')
  .where('tid', '==', tid)  // <-- verificare tid corretto
  .get();
```

**D) Query semantica troppo specifica:**
```bash
# Test con query generica
curl "https://europe-west1-repository-ai-477311.cloudfunctions.net/kbSearch?tid=T1&q=normativa&k=10"
```

---

## 5. Gestione Utenti

### 5.1 Creare Nuovo Utente

```bash
# 1. Creare utente in Firebase Auth (via Console UI)
# Firebase Console > Authentication > Users > Add User
# Email: user@example.com
# (password temporanea o invia email link)

# 2. Impostare custom claims
# Via Cloud Function dedicata (da implementare) o manualmente:

# Script Node.js:
```

```javascript
// set-claims.js
const admin = require('firebase-admin');
admin.initializeApp();

const email = 'user@example.com';
const claims = {
  role: 'member',
  tid: 'T1',
  companyIds: ['C1']
};

admin.auth().getUserByEmail(email)
  .then(user => admin.auth().setCustomUserClaims(user.uid, claims))
  .then(() => console.log('Claims set:', claims))
  .catch(console.error);
```

```bash
# Eseguire:
node set-claims.js
```

---

### 5.2 Modificare Ruolo Utente

```bash
# Aggiornare custom claims (da member a manager)
# Script:
```

```javascript
const newClaims = {
  role: 'manager',  // era 'member'
  tid: 'T1',
  companyIds: ['C1', 'C2', 'C3']  // aggiunte C2, C3
};

admin.auth().getUserByEmail('user@example.com')
  .then(user => admin.auth().setCustomUserClaims(user.uid, newClaims))
  .then(() => console.log('Claims updated'))
  .catch(console.error);
```

**⚠️ ATTENZIONE:** Utente deve fare logout/login per applicare nuovi claims.

---

### 5.3 Revocare Accesso Utente

```bash
# Opzione A: Disabilitare account (reversibile)
firebase auth:export users.json
# Trova UID utente, poi:
# Via Console UI: Authentication > Users > Disable

# Opzione B: Eliminare account (irreversibile)
# Via Console UI: Authentication > Users > Delete
# O via CLI:
# firebase auth:delete UID_UTENTE
```

---

## 6. Gestione Costi

### 6.1 Monitorare Spesa Giornaliera

```bash
# Dashboard billing
# https://console.cloud.google.com/billing/YOUR_BILLING_ACCOUNT/reports

# Filtrare per progetto: repository-ai-477311
# Periodo: ultime 24 ore
```

**Servizi da monitorare:**
- Cloud Document AI (€€€ - OCR)
- Vertex AI (€€ - embeddings)
- Cloud Functions (€ - invocazioni)
- Firestore (€ - reads/writes)
- Cloud Storage (€ - storage + bandwidth)

---

### 6.2 Alert Budget

**Configurare alert:**

```bash
# 1. Creare budget (se non esistente)
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="SIKURO Monthly Budget" \
  --budget-amount=200EUR \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=75 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

**Alert configurati:**
- 50% budget (€100): warning
- 75% budget (€150): review urgente
- 90% budget (€180): escalation
- 100% budget (€200): blocco deploy non critici

---

### 6.3 Ridurre Costi (Emergenza)

**Scenario:** Spesa fuori controllo, serve riduzione immediata.

**Azioni:**

**A) Ridurre chiamate Document AI:**
```typescript
// Aumentare soglia gating (skip OCR più aggressivo)
// In functions/src/index.ts:
const CHAR_PER_PAGE_THRESHOLD = 500;  // era 200
```

**B) Ridurre embeddings RAG:**
```typescript
// Disabilitare ingest automatico temporaneamente
// Commentare trigger in kbIngestFromStorage
```

**C) Ridurre min instances functions:**
```typescript
// In functions/src/index.ts:
export const kbSearch = onRequest(
  {
    minInstances: 0,  // era 1
    ...
  },
  ...
);
```

**D) Limitare concorrenza:**
```typescript
// Ridurre max istanze simultanee
export const processUpload = onObjectFinalized(
  {
    concurrency: 20,  // era 80
    ...
  },
  ...
);
```

Re-deploy dopo modifiche:
```bash
firebase deploy --only functions
```

---

## 7. Incident Response

### 7.1 Severità Incident

| Livello | Descrizione | Tempo risposta | Esempio |
|---------|-------------|----------------|---------|
| **SEV-1** | Sistema down, nessun utente può operare | <15 min | Functions tutte down, auth non funziona |
| **SEV-2** | Funzionalità core degradata | <1 ora | Upload funziona ma processing fallisce per tutti |
| **SEV-3** | Funzionalità secondaria degradata | <4 ore | Email alert non inviate, RAG search lenta |
| **SEV-4** | Issue minore, workaround disponibile | <24 ore | UI glitch, performance subottimale |

---

### 7.2 Procedura Incident SEV-1

**Esempio:** "Tutte le Cloud Functions ritornano 500"

**Step 1: Comunicazione immediata**
```
# Postare in Slack #sikuro-production-alerts:
"🚨 SEV-1: All functions returning 500. Investigating. ETA: 15min"
```

**Step 2: Diagnosi rapida**
```bash
# Check functions status
firebase functions:list

# Check recent deploys
firebase functions:log

# Check Cloud Status
# https://status.cloud.google.com
```

**Step 3: Mitigazione**

**Opzione A: Rollback (se deploy recente)**
```bash
git checkout v1.0.0  # last stable
firebase use prod
firebase deploy --only functions
```

**Opzione B: Fix rapido**
```bash
# Identificare commit che ha introdotto bug
git log --oneline -10

# Revert commit specifico
git revert COMMIT_SHA
firebase deploy --only functions
```

**Step 4: Verifica**
```bash
curl https://europe-west1-repository-ai-477311.cloudfunctions.net/health
# Output: "ok"
```

**Step 5: Comunicazione risoluzione**
```
# Slack:
"✅ SEV-1 RESOLVED: Functions restored. Root cause: <descrizione>. 
Post-mortem: <link doc>"
```

**Step 6: Post-mortem** (entro 48h)
- Timeline incident
- Root cause analysis
- Action items per prevenire ricorrenza

---

### 7.3 Escalation Path

1. **On-call engineer** (primi 15 min)
   - Diagnosi e tentativo fix
   
2. **Tech lead** (se non risolto in 30 min)
   - Decisione rollback vs. fix
   
3. **CTO** (se impatto >1h o decisioni business)
   - Comunicazione clienti
   - Decisioni post-mortem

---

## 8. Backup & Recovery

### 8.1 Backup Firestore

**Automatico (setup):**

```bash
# Abilitare backup automatico Firestore
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d \
  --project=repository-ai-477311
```

**Manuale:**

```bash
# Export completo Firestore
gcloud firestore export gs://repository-ai-477311-backups/$(date +%Y%m%d) \
  --project=repository-ai-477311
```

---

### 8.2 Backup Storage

**Abilitare versioning:**

```bash
gsutil versioning set on gs://repository-ai-477311.appspot.com
```

**Recovery file cancellato:**

```bash
# Lista versioni file
gsutil ls -a gs://BUCKET/docs/T1/C1/DOC123/file.pdf

# Ripristinare versione specifica
gsutil cp gs://BUCKET/docs/T1/C1/DOC123/file.pdf#GENERATION /tmp/restored.pdf
gsutil cp /tmp/restored.pdf gs://BUCKET/docs/T1/C1/DOC123/file.pdf
```

---

### 8.3 Recovery Disaster

**Scenario:** Progetto Firebase completamente corrotto/inaccessibile.

**Piano:**

1. **Setup nuovo progetto Firebase**
2. **Restore Firestore** da backup recente
3. **Restore Storage** da backup o versioning
4. **Re-deploy codice** da git (tag stable)
5. **Re-create segreti** in Secret Manager
6. **Update DNS** per puntare a nuovo progetto

**RTO (Recovery Time Objective):** 2-4 ore  
**RPO (Recovery Point Objective):** 24 ore (backup daily)

---

## 📞 Contatti Emergenza

| Ruolo | Nome | Telefono | Email | Orari |
|-------|------|----------|-------|-------|
| On-call Engineer | ________ | ________ | ________ | 24/7 |
| Tech Lead | ________ | ________ | ________ | 9-18 lun-ven |
| CTO | ________ | ________ | ________ | On-demand |
| Firebase Support | N/A | N/A | firebase-support@google.com | Ticket |

---

## 📚 Link Utili

**Firebase Console:**
- Production: https://console.firebase.google.com/project/repository-ai-477311
- Staging: https://console.firebase.google.com/project/repository-ai-477311-stg

**GCP Console:**
- Logging: https://console.cloud.google.com/logs
- Monitoring: https://console.cloud.google.com/monitoring
- Billing: https://console.cloud.google.com/billing

**Documentazione:**
- Repo: https://github.com/YOUR_ORG/sikuro-docs
- Wiki: https://wiki.internal/sikuro
- Slack: #sikuro-production-alerts

---

**Documento versione:** 1.0  
**Ultima revisione:** 2024-11-11  
**Prossima review:** 2025-02-11

