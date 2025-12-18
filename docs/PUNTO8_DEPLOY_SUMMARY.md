# 📦 PUNTO 8 — Deploy Produzione Controllato + Hardening

**Status:** ✅ COMPLETATO  
**Data implementazione:** 2024-11-11  
**Developer:** [tuo nome]  
**Reviewer:** [nome reviewer]

---

## 🎯 Obiettivo

Portare online l'MVP in modo **sicuro, ripetibile e reversibile**, con guardrail su costi/affidabilità e checklist di exit test post-deploy.

---

## ✅ Deliverable Implementati

### 1. Strategia Multi-Ambiente

**File:** `.firebaserc`

**Configurazione:**
```json
{
  "projects": {
    "default": "repository-ai-477311",
    "stg": "repository-ai-477311-stg",
    "prod": "repository-ai-477311"
  }
}
```

**Alias:**
- `stg` → Staging (replica produzione, dati fittizi)
- `prod` → Production (tenant reali)

**✅ Completato**

---

### 2. Deploy Checklist

**File:** `docs/DEPLOY_CHECKLIST.md`

**Contenuto:**
- Pre-requisiti (IAM, segreti, budget)
- Fase 1: Deploy staging + verifica
- Fase 2: Deploy production (solo se staging OK)
- Fase 3: Post-go-live (monitoring 24h)
- Procedure rollback (hosting, functions, completo)
- Troubleshooting comune

**Comandi chiave:**
```bash
# Staging
firebase use stg
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# Production (dopo exit tests staging OK)
firebase use prod
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting
```

**✅ Completato**

---

### 3. Exit Tests Post-Deploy

**File:** `docs/EXIT_TESTS.md`

**Test obbligatori (21 totali):**

**Categoria A — Base Vita (3 test)**
- A.1: Health HTTP endpoint
- A.2: Auth email-link flow completo
- A.3: Domini autorizzati

**Categoria B — Pipeline Documentale (4 test)**
- B.1: Upload PDF digitale (skip OCR)
- B.2: Upload PDF scansionato (OCR on)
- B.3: Idempotenza (stesso file)
- B.4: Idempotenza (file modificato)

**Categoria C — RAG (4 test)**
- C.1: Ingest PDF digitale
- C.2: Ingest PDF scansionato
- C.3: Search RAG (kbSearch)
- C.4: RAG References su documento

**Categoria D — Alert & Osservabilità (5 test)**
- D.1: Dry-run alert scadenze
- D.2: Email Extension trigger
- D.3: Metriche log-based
- D.4: Nessun errore in logs
- D.5: Scheduled function (cron)

**Categoria E — Security (4 test)**
- E.1: Firestore rules Member (company scope)
- E.2: Firestore rules Manager (tenant scope)
- E.3: Storage rules upload path
- E.4: No download URL pubblici

**Categoria F — Performance & Cost (4 test)**
- F.1: Latenza kbSearch (p95 < 600ms)
- F.2: Latenza processUpload (documenti brevi)
- F.3: Billing Document AI (nessun picco)
- F.4: Billing Firestore (reads/writes)

**Criterio GO/NO-GO:**
- ✅ 21/21 test passati → **GO per produzione**
- ❌ ≥1 test fallito → **NO-GO**, fix e re-deploy

**✅ Completato**

---

### 4. Release Notes Template

**File:** `docs/RELEASE_1.0.md`

**Contenuto:**
- Executive summary
- Funzionalità incluse (auth, pipeline, RAG, alert, dashboard)
- Funzionalità escluse (roadmap v1.1, v1.2, v2.0)
- Rischi noti e mitigazioni
- Considerazioni sicurezza (data locality, privacy, auth)
- Metriche di successo (KPI)
- Operazioni post-go-live
- Contatti supporto & escalation

**Sezioni chiave:**
- Flusso pipeline: Upload → OCR → LLM → Rules → RAG
- Tipi documento: DURC, Visura, DUVRI, POS, Altro
- Performance target: latenza, uptime, error rate
- Budget mensile stimato: ~€200 (infra totale)

**✅ Completato**

---

### 5. Runbook Operativo

**File:** `docs/RUNBOOK.md`

**Contenuto (8 sezioni):**

1. **Deploy & Rollback**
   - Deploy standard staging→prod
   - Rollback rapido (hosting/functions/completo)
   - Hotfix emergenza

2. **Monitoraggio & Logs**
   - Accesso logs (gcloud CLI, Console UI)
   - Dashboard monitoring
   - Alert configurati

3. **Gestione Segreti**
   - Visualizzare segreti
   - Rotazione chiavi (Gemini API, Document AI)
   - Aggiungere nuovo segreto

4. **Troubleshooting Comune**
   - Upload fallisce (permission denied)
   - Documento bloccato su "processing"
   - Email alert non inviate
   - RAG search senza risultati

5. **Gestione Utenti**
   - Creare nuovo utente + custom claims
   - Modificare ruolo utente
   - Revocare accesso

6. **Gestione Costi**
   - Monitorare spesa giornaliera
   - Alert budget
   - Ridurre costi (emergenza)

7. **Incident Response**
   - Severità incident (SEV-1 a SEV-4)
   - Procedura SEV-1 (sistema down)
   - Escalation path

8. **Backup & Recovery**
   - Backup Firestore (automatico/manuale)
   - Backup Storage (versioning)
   - Recovery disaster (RTO 2-4h, RPO 24h)

**✅ Completato**

---

### 6. Configurazione Runtime Functions v2

**File modificati:**
- `functions/src/index.ts`
- `functions/src/rag/query.ts`
- `functions/src/rag/ingest.ts`
- `functions/src/alerts/sendExpiryAlerts.ts`

**File documentazione:** `docs/FUNCTIONS_RUNTIME_CONFIG.md`

**Parametri ottimizzati:**

| Function | Timeout | Memory | Concurrency | Rationale |
|----------|---------|--------|-------------|-----------|
| `processUpload` | 180s | 1GiB | 80 | OCR+LLM+RAG, PDF buffer in memoria |
| `kbIngestFromStorage` | 180s | 1GiB | 80 | OCR batch, chunks+embeddings |
| `kbSearch` | 60s | 512MiB | 80 | Query+embedding, latency critica |
| `sendExpiryAlerts` | 60s | 512MiB | - | Scheduler, batch email+notifiche |
| `sendExpiryAlertsDryRun` | 60s | 512MiB | 80 | Dry-run test |

**Regione:** `europe-west1` (tutte)  
**MinInstances:** 0 (MVP, cold start accettabile)

**✅ Completato**

---

## 🚀 Prossimi Step (Execution)

### Step 1: Setup Progetto Staging

**Da fare PRIMA del primo deploy:**

1. **Creare progetto Firebase staging** (se non esiste)
   ```bash
   # Via Firebase Console: crea "repository-ai-477311-stg"
   # Aggiornare .firebaserc già fatto ✅
   ```

2. **Configurare segreti staging**
   ```bash
   firebase use stg
   
   # DOC_AI_PROCESSOR_ID (staging)
   echo -n "projects/STAGING_PROJECT/locations/eu/processors/PROCESSOR_ID" | \
     gcloud secrets create DOC_AI_PROCESSOR_ID --data-file=- --replication-policy=automatic
   
   # GEMINI_API_KEY (staging, può essere stesso di prod o separato)
   echo -n "YOUR_GEMINI_KEY" | \
     gcloud secrets create GEMINI_API_KEY --data-file=- --replication-policy=automatic
   ```

3. **Grant IAM Document AI staging**
   ```bash
   gcloud projects add-iam-policy-binding STAGING_PROJECT_ID \
     --member="serviceAccount:STAGING_PROJECT_ID@appspot.gserviceaccount.com" \
     --role="roles/documentai.apiUser"
   ```

4. **Configurare budget alert staging**
   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_BILLING_ACCOUNT \
     --display-name="Staging Budget" \
     --budget-amount=50EUR \
     --threshold-rule=percent=80
   ```

---

### Step 2: Primo Deploy Staging

```bash
# 1. Switch staging
firebase use stg

# 2. Build
npm install && npm run build
cd functions && npm install && npm run build && cd ..

# 3. Deploy
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# 4. Verifica
curl https://europe-west1-STAGING_PROJECT.cloudfunctions.net/health
# Output: "ok"
```

---

### Step 3: Eseguire Exit Tests Staging

```bash
# Seguire checklist completa in docs/EXIT_TESTS.md
# Obiettivo: 21/21 test ✅

# Test critici minimi:
# - Health check
# - Auth email link
# - Upload PDF (digitale + scansionato)
# - RAG search
# - Alert dry-run
# - Firestore rules (member/manager)
```

**Criterio GO:** Se TUTTI i test passano → proceed to production

---

### Step 4: Deploy Production

```bash
# 1. Annotare commit SHA staging
git log -1 --oneline > .staging-tested.txt

# 2. Comunicare finestra deploy a stakeholders
# Email/Slack: "Deploy production previsto per [data] ore [orario]"

# 3. Switch production
firebase use prod

# 4. Verifica segreti production
firebase functions:secrets:access DOC_AI_PROCESSOR_ID
firebase functions:secrets:access GEMINI_API_KEY

# 5. Deploy
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting

# 6. Verifica immediata
curl https://europe-west1-repository-ai-477311.cloudfunctions.net/health
```

---

### Step 5: Exit Tests Production

```bash
# Ripetere TUTTI i test di EXIT_TESTS.md su production
# IMPORTANTE: usare tenant/company DEMO (non dati reali clienti)

# Monitorare logs in tempo reale
gcloud logging tail "resource.type=cloud_function" --project=repository-ai-477311
```

---

### Step 6: Monitoring Post-Deploy (24h)

**Giorno 0 (prime 6h):**
- [ ] Verificare primi 5-10 upload reali
- [ ] Monitorare error rate functions (<1%)
- [ ] Controllare dashboard billing (nessun spike)
- [ ] Verificare email alert test (se esecuzione scheduler)

**Giorno 1:**
- [ ] Review metriche 24h (invocazioni, latenza, errori)
- [ ] Verificare costi giornalieri vs. stimati
- [ ] Raccogliere feedback pilot users
- [ ] Aggiornare .last-production-deploy.txt

**Settimana 1:**
- [ ] Analisi trend performance
- [ ] Identificare ottimizzazioni necessarie
- [ ] Planning feature v1.1 based su feedback

---

## 📊 Guardrail Costi & Performance

### Costi Target MVP (mensili)

| Servizio | Budget | Monitoring |
|----------|--------|------------|
| Document AI | €100 | Alert >€5/giorno |
| Gemini API | €50 | Alert >€2/giorno |
| Firestore | €20 | Monitorare reads/writes |
| Cloud Functions | €5 | Monitorare invocazioni |
| Cloud Storage | €10 | Lifecycle policy tmp files |
| **Totale** | **€185** | **Budget alert €200** |

### Performance Target

| Metrica | Target | Alert |
|---------|--------|-------|
| kbSearch p95 | <600ms | >800ms |
| processUpload p95 (digitale) | <15s | >30s |
| processUpload p95 (scansionato) | <45s | >90s |
| Error rate | <1% | >2% |
| Uptime | >99.5% | <99% |

---

## 🔐 Security Checklist

- [x] Firestore rules multi-tenant ABAC
- [x] Storage rules path validation
- [x] Custom claims auth (role, tid, companyIds)
- [x] Segreti in Secret Manager (non hardcoded)
- [x] Data locality EU (Firestore, Storage, Functions, DocAI)
- [x] No download URL pubblici
- [x] Cloud Audit Logs attivi (90 giorni retention)
- [ ] **TODO:** IAM review (rimuovere ruoli superflui)
- [ ] **TODO:** Firestore backup schedule (daily, 7 giorni retention)
- [ ] **TODO:** Storage lifecycle policy (delete tmp files >30 giorni)

---

## 📝 Governance

### Responsabilità

| Ruolo | Responsabile | Responsabilità |
|-------|--------------|----------------|
| **Product Owner** | ________ | Approvazione release, priorità feature |
| **Tech Lead** | ________ | Architettura, code review, decisioni tecniche |
| **DevOps** | ________ | Deploy, monitoring, incident response |
| **QA** | ________ | Exit tests, validazione funzionalità |
| **On-Call** | ________ | Risposta emergenze 24/7 (prime 48h post-deploy) |

### Processo Release

1. **Planning** (1 settimana prima)
   - Definire scope release
   - Identificare rischi
   - Comunicare finestra deploy

2. **Development & Test** (durante sprint)
   - Implementazione feature
   - Code review
   - Test locali

3. **Staging Deploy** (3 giorni prima prod)
   - Deploy staging
   - Exit tests completi
   - Raccolta feedback

4. **Production Deploy** (giorno concordato)
   - GO/NO-GO decision
   - Deploy production
   - Exit tests production
   - Monitoring attivo

5. **Post-Deploy** (prime 48h)
   - Monitoring intensivo
   - On-call disponibile
   - Quick fix se necessario

6. **Post-Mortem** (1 settimana dopo)
   - Review metriche
   - Lessons learned
   - Action items

---

## 🎉 Success Criteria

**Deploy considerato SUCCESS se:**

- ✅ Tutti exit tests (21/21) passati
- ✅ Nessun incident SEV-1 o SEV-2 nelle prime 48h
- ✅ Error rate <1% per prime 72h
- ✅ Costi giornalieri entro budget (€200/mese = ~€7/giorno)
- ✅ Feedback pilot users positivo (>80% soddisfazione)
- ✅ Nessun rollback necessario

**Se SUCCESS → Pianificare v1.1**  
**Se PARZIALE → Identificare quick wins e iterare**  
**Se FAIL → Post-mortem e ripianificare**

---

## 📚 Documentazione Correlata

**File creati in questo PUNTO 8:**
1. ✅ `.firebaserc` — Alias multi-ambiente
2. ✅ `docs/DEPLOY_CHECKLIST.md` — Procedura deploy step-by-step
3. ✅ `docs/EXIT_TESTS.md` — Test obbligatori post-deploy
4. ✅ `docs/RELEASE_1.0.md` — Template release notes
5. ✅ `docs/RUNBOOK.md` — Procedure operative
6. ✅ `docs/FUNCTIONS_RUNTIME_CONFIG.md` — Configurazione runtime functions
7. ✅ `docs/PUNTO8_DEPLOY_SUMMARY.md` — Questo file

**File esistenti da consultare:**
- `README.md` — Setup progetto
- `docs/MULTI_TENANCY_GUIDE.md` — Guida multi-tenancy
- `docs/NOTIFICATIONS_GUIDE.md` — Sistema notifiche
- `docs/MONITORING_SOLUTION.md` — Setup monitoring
- `firestore.rules` — Regole sicurezza Firestore
- `storage.rules` — Regole sicurezza Storage

---

## ✅ Sign-off PUNTO 8

**Implementazione completata:** ✅  
**Data:** 2024-11-11  
**Developer:** [nome]  
**Commit SHA:** [inserire dopo commit]

**Prossima azione:** Eseguire setup staging e primo deploy controllato.

**Note:**
- Tutti i file di documentazione sono pronti per l'uso
- Parametri runtime functions ottimizzati secondo best practice
- Exit tests completi e spuntabili
- Runbook operativo con procedure comuni

**Ready for staging deploy!** 🚀

---

_Documento versione: 1.0_  
_Ultima revisione: 2024-11-11_

