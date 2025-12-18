# 🚀 Deploy Checklist — Staging → Production

**Versione:** 1.0  
**Ambiente target:** `stg` → `prod`  
**Data ultima revisione:** 2024-11-11

> **Regola d'oro**: Deploy **la stessa commit** prima su `stg`, esegui exit test, poi promuovi su `prod`.

---

## Pre-requisiti (da verificare UNA TANTUM)

### 1. Progetti Firebase configurati

```bash
# Verifica progetti configurati
firebase projects:list

# Verifica alias nel repo
cat .firebaserc
```

**Attesi:**
- Alias `stg` → progetto staging (es. `repository-ai-477311-stg`)
- Alias `prod` → progetto produzione (es. `repository-ai-477311`)

---

### 2. IAM e Service Accounts

**Staging:**
```bash
firebase use stg
gcloud projects get-iam-policy $(firebase use | grep 'Now using' | awk '{print $5}') \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/documentai.apiUser"
```

**Production:**
```bash
firebase use prod
gcloud projects get-iam-policy $(firebase use | grep 'Now using' | awk '{print $5}') \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/documentai.apiUser"
```

**Verifica:**
- Service Account delle Functions ha ruolo `roles/documentai.apiUser` ✅

---

### 3. Segreti (Secret Manager)

**Staging:**
```bash
firebase use stg
gcloud secrets list --project=$(gcloud config get-value project)

# Verifica presenza
gcloud secrets describe DOC_AI_PROCESSOR_ID --project=$(gcloud config get-value project)
gcloud secrets describe GEMINI_API_KEY --project=$(gcloud config get-value project)
```

**Production:**
```bash
firebase use prod
gcloud secrets list --project=$(gcloud config get-value project)

# Verifica presenza
gcloud secrets describe DOC_AI_PROCESSOR_ID --project=$(gcloud config get-value project)
gcloud secrets describe GEMINI_API_KEY --project=$(gcloud config get-value project)
```

**Se mancanti, creare:**
```bash
# DOC_AI_PROCESSOR_ID
echo -n "projects/YOUR_PROJECT_ID/locations/eu/processors/YOUR_PROCESSOR_ID" | \
  gcloud secrets create DOC_AI_PROCESSOR_ID --data-file=- --replication-policy=automatic

# GEMINI_API_KEY
echo -n "YOUR_GEMINI_API_KEY" | \
  gcloud secrets create GEMINI_API_KEY --data-file=- --replication-policy=automatic
```

---

### 4. Budget e Quote

```bash
# Verifica budget attivi
gcloud billing budgets list --billing-account=YOUR_BILLING_ACCOUNT_ID

# Verifica quote Document AI (pagine/giorno)
gcloud services enable documentai.googleapis.com
gcloud services quota list --service=documentai.googleapis.com --filter="metric.type:documentai.googleapis.com/quota/api/request_count"
```

**Attesi:**
- Budget alert configurati su entrambi gli ambienti ✅
- Quote Document AI sufficienti per carico previsto ✅

---

## FASE 1 — Deploy STAGING

### Step 1.1 — Switch ambiente e verifica

```bash
# Switch a staging
firebase use stg

# Verifica progetto attivo
firebase use
# Output atteso: "Now using project repository-ai-477311-stg"

# Verifica branch e commit
git status
git log -1 --oneline
# Annotare commit SHA per tracciabilità
```

---

### Step 1.2 — Build e verifica dipendenze

```bash
# Frontend
npm install
npm run build

# Functions
cd functions
npm install
npm run build
cd ..
```

**Verifica output:**
- ✅ Build completato senza errori
- ✅ Nessun warning critico TypeScript

---

### Step 1.3 — Verifica configurazione runtime

```bash
# Verifica secrets disponibili per functions
firebase functions:secrets:access DOC_AI_PROCESSOR_ID
firebase functions:secrets:access GEMINI_API_KEY

# Verifica parametri environment (se usati)
# Esempio: KB_OCR_ENABLED, DOC_AI_LOCATION, ecc.
cat functions/.env.stg 2>/dev/null || echo "No .env.stg found (usando params inline)"
```

---

### Step 1.4 — Deploy completo STAGING

```bash
# Deploy TUTTO in un colpo solo
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# In alternativa, deploy passo-passo:
# firebase deploy --only firestore:rules
# firebase deploy --only firestore:indexes
# firebase deploy --only storage
# firebase deploy --only functions
# firebase deploy --only hosting
```

**Monitorare output:**
- ✅ Firestore rules deployate
- ✅ Firestore indexes creati/aggiornati
- ✅ Storage rules deployate
- ✅ Functions deployate (controllare nomi: `processUpload`, `kbIngestFromStorage`, `kbSearch`, `sendExpiryAlerts`, `health`)
- ✅ Hosting deployato

**Tempo atteso:** 3-8 minuti

---

### Step 1.5 — Post-deploy verification STAGING

```bash
# 1. Health check
curl https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/health
# Output atteso: "ok"

# 2. Verifica functions deployate
firebase functions:list

# 3. Verifica hosting live
firebase hosting:channel:list
# Verifica che l'URL live sia attivo
```

---

### Step 1.6 — Esegui EXIT TESTS su STAGING

📋 **Segui la checklist completa in `docs/EXIT_TESTS.md`**

**Categorie obbligatorie:**
- ✅ A — Base vita (health, auth)
- ✅ B — Pipeline documentale (upload, OCR, idempotenza)
- ✅ C — RAG (ingest, search)
- ✅ D — Alert & osservabilità (dry-run, email, metriche)
- ✅ E — Security (rules Firestore/Storage)
- ✅ F — Performance & cost (latenza, billing)

**Criterio GO/NO-GO:**
- Se **TUTTI** i test passano → 🟢 **GO per produzione**
- Se **1 o più** test falliscono → 🔴 **NO-GO**, fix e ri-deploy staging

---

## FASE 2 — Deploy PRODUCTION (solo se STAGING OK)

### Step 2.1 — Annotare commit e release

```bash
# Annotare SHA della commit che ha passato tutti i test
git log -1 --oneline
# Esempio output: a1b2c3d Fix: aggiornato timeout OCR

# (Opzionale) Creare tag git
git tag -a v1.0.0 -m "Release 1.0.0 - MVP Production"
git push origin v1.0.0
```

---

### Step 2.2 — Switch a PRODUCTION

```bash
# Switch a production
firebase use prod

# Verifica progetto attivo
firebase use
# Output atteso: "Now using project repository-ai-477311"

# IMPORTANTE: verifica di essere sulla STESSA commit di staging
git log -1 --oneline
```

---

### Step 2.3 — Verifica segreti e parametri PRODUCTION

```bash
# Verifica secrets production
firebase functions:secrets:access DOC_AI_PROCESSOR_ID
firebase functions:secrets:access GEMINI_API_KEY

# Verifica parametri environment production
cat functions/.env.prod 2>/dev/null || echo "No .env.prod found"

# ATTENZIONE: valori possono differire da staging (es. alert cron, bucket days, ecc.)
```

---

### Step 2.4 — Deploy completo PRODUCTION

```bash
# Deploy con conferma esplicita
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# Output: annotare timestamp e URL functions/hosting deployati
```

**⚠️ ATTENZIONE:**
- Comunicare finestra di rilascio ai referenti PRIMA del deploy
- Evitare deploy production durante orari di picco utenza (se applicabile)

---

### Step 2.5 — Post-deploy verification PRODUCTION

```bash
# 1. Health check production
curl https://europe-west1-$(gcloud config get-value project).cloudfunctions.net/health
# Output atteso: "ok"

# 2. Verifica functions production
firebase functions:list

# 3. Verifica hosting production live
curl -I https://YOUR_PRODUCTION_DOMAIN.web.app
# Status: 200 OK
```

---

### Step 2.6 — Esegui EXIT TESTS su PRODUCTION

📋 **Ripeti TUTTI i test di `docs/EXIT_TESTS.md` su ambiente production**

**⚠️ ATTENZIONE:**
- Usare **tenant/company demo** per test (NON dati clienti reali)
- Monitorare **Cloud Logging** in tempo reale durante i test
- Verificare **metriche billing** nei primi 30 minuti post-deploy

---

## FASE 3 — Post-Go-Live

### Step 3.1 — Monitoring attivo (prime 24h)

```bash
# Monitorare logs in tempo reale
gcloud logging tail "resource.type=cloud_function" --project=$(gcloud config get-value project)

# Dashboard metriche
# Aprire: https://console.cloud.google.com/monitoring/dashboards
# Verificare:
# - Error rate functions < 1%
# - Latency p95 < soglie definite
# - Document AI API calls
# - Firestore read/write rate
```

---

### Step 3.2 — Comunicazione stakeholders

📋 **Inviare release notes** (template in `docs/RELEASE_1.0.md`)

**Include:**
- ✅ Funzionalità incluse nella v1.0
- ✅ Funzionalità escluse / future
- ✅ Rischi noti e mitigazioni
- ✅ Contatti on-call per emergenze

---

### Step 3.3 — Backup e rollback preparedness

```bash
# Annotare versione hosting production per rollback rapido
firebase hosting:channel:list

# Annotare SHA commit production
git rev-parse HEAD > .last-production-deploy.txt
cat .last-production-deploy.txt

# (Opzionale) Abilitare Object Versioning su Storage per 48h
gsutil versioning set on gs://$(gcloud config get-value project).appspot.com
```

---

## ROLLBACK (se necessario)

### Opzione A — Rollback Hosting

```bash
firebase use prod
firebase hosting:rollback
# Seguire prompts UI per selezionare versione precedente
```

### Opzione B — Rollback Functions

```bash
# Checkout commit "last known good"
git checkout $(cat .last-production-deploy.txt)

# Ri-deploy functions
firebase use prod
firebase deploy --only functions
```

### Opzione C — Rollback completo

```bash
# Ripristinare branch/tag stabile
git checkout v0.9.0  # Esempio tag precedente

# Re-deploy tutto
firebase use prod
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting
```

---

## Troubleshooting comune

### ❌ Deploy fallito: "Deployment quota exceeded"

**Causa:** Troppi deploy in breve tempo  
**Soluzione:** Attendere 10-15 minuti, riprovare

---

### ❌ Functions: "Secret DOC_AI_PROCESSOR_ID not found"

**Causa:** Secret non accessibile da service account functions  
**Soluzione:**
```bash
gcloud secrets add-iam-policy-binding DOC_AI_PROCESSOR_ID \
  --member="serviceAccount:YOUR_PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

### ❌ Firestore rules: "Permission denied"

**Causa:** Rules non allineate con claims utente  
**Soluzione:**
1. Verificare custom claims utente test: `firebase auth:export --format=JSON users.json`
2. Controllare rules in `firestore.rules`
3. Testare con Firebase Console > Firestore > Rules playground

---

### ❌ Hosting: 404 su route dinamiche

**Causa:** Configurazione `rewrites` mancante in `firebase.json`  
**Soluzione:**
```json
{
  "hosting": {
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

---

## Sign-off finale

**Staging deploy:**
- [ ] Deploy completato senza errori
- [ ] Exit tests: 100% passed
- [ ] Performance: entro SLA
- [ ] Costi: entro budget

**Production deploy:**
- [ ] Deploy completato senza errori
- [ ] Exit tests: 100% passed
- [ ] Monitoring: attivo e alerts configurati
- [ ] Rollback plan: documentato e testabile
- [ ] Release notes: inviate a stakeholders

**Firma responsabile rilascio:**  
Nome: ________________  
Data: ________________  
Commit SHA: ________________

---

**🎉 DEPLOY COMPLETATO! Monitorare le prime 24-48h.**

