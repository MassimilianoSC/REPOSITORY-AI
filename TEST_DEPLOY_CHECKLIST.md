# 🧪 Test & Deploy Checklist - Strategia Ibrida

Repository AI - Checklist operativa completa

---

## 🎯 **Strategia: 3 Fasi Progressive**

| Fase | Ambiente | Cosa Testa | Tempo |
|------|----------|------------|-------|
| **A) Emulator** | Locale | Rules, UI, Auth, Dry-run | ~30 min |
| **B) PR Preview** | Cloud (Hosting) | Frontend completo | ~5 min |
| **C) Functions Cloud** | Cloud (GCP) | OCR, Vector Search, Email | ~20 min |

---

## 📍 **FASE A: Test Locale (Emulator)**

**Scopo:** Verificare rules, UI notifiche, auth/roles, alerts dry-run **SENZA COSTI**.

### **A.1 Setup Emulator (Una Volta)**

```powershell
# 1. Decommenta devSetClaims per test claims
# Apri: functions/src/index.ts
# Cambia riga 23:
# DA:   // export { devSetClaims } from "./auth/devSetClaims";
# A:    export { devSetClaims } from "./auth/devSetClaims";

# 2. Rebuild functions
cd functions
npm run build
cd ..

# 3. Verifica build ok
# Atteso: ✅ no TypeScript errors
```

### **A.2 Avvia Emulator**

```powershell
# Terminal 1: Emulator Suite
firebase emulators:start
```

**Console URLs:**
- 🌐 Emulator UI: http://localhost:4000
- 🔐 Auth: http://localhost:4000/auth
- 🗄️ Firestore: http://localhost:4000/firestore
- ⚡ Functions: http://localhost:5001
- 🏠 Hosting: http://localhost:5000

### **A.3 Test Firestore/Storage Rules**

**Step 1: Crea 3 utenti (Auth UI)**

1. Apri: http://localhost:4000/auth
2. Click **"Add user"** 3 volte:
   - `owner@test.com` → **Copia UID**
   - `manager@test.com` → **Copia UID**
   - `member@test.com` → **Copia UID**

**Step 2: Setta claims (PowerShell - Terminal 2)**

```powershell
# Sostituisci <OWNER_UID>, <MANAGER_UID>, <MEMBER_UID> con UID reali

# Owner T1
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=<OWNER_UID>&tenant_id=T1&role=Owner"

# Manager T1
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=<MANAGER_UID>&tenant_id=T1&role=Manager"

# Member T1/C1
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=<MEMBER_UID>&tenant_id=T1&role=Member&company_id=C1"
```

**Atteso:** 3x `ok` responses

**Step 3: Crea dati test (Firestore UI)**

1. Apri: http://localhost:4000/firestore
2. Click **"Start collection"**
3. Crea:

```
Collection: tenants
Document ID: T1

  Subcollection: companies
  Document ID: C1
  
    Subcollection: documents
    Document ID: DOC1
    Fields:
      status: "green"
      docType: "DURC"
      expiresAt: <Timestamp: 2025-12-31>

  Subcollection: companies
  Document ID: C2
  
    Subcollection: documents
    Document ID: DOC2
    Fields:
      status: "yellow"
      docType: "VISURA"
      expiresAt: <Timestamp: 2025-11-30>

Collection: tenants
Document ID: T1

  Subcollection: kb_chunks
  Document ID: CHUNK1
  Fields:
    text: "Normativa DURC validità 120 giorni cantiere"
    source: "kb/durc.pdf"
    tenantId: "T1"
```

**Step 4: Verifica Rules (Firestore UI - Rules Playground)**

1. Click tab **"Rules Playground"**
2. Test:

| Test | Path | Auth UID | Atteso |
|------|------|----------|--------|
| Member READ C1 | `tenants/T1/companies/C1/documents/DOC1` | `<MEMBER_UID>` | ✅ Allow |
| Member READ C2 | `tenants/T1/companies/C2/documents/DOC2` | `<MEMBER_UID>` | ❌ Deny |
| Manager READ C2 | `tenants/T1/companies/C2/documents/DOC2` | `<MANAGER_UID>` | ✅ Allow |
| Member READ KB | `tenants/T1/kb_chunks/CHUNK1` | `<MEMBER_UID>` | ✅ Allow |
| Member WRITE KB | `tenants/T1/kb_chunks/CHUNK1` | `<MEMBER_UID>` | ❌ Deny |
| Manager WRITE KB | `tenants/T1/kb_chunks/CHUNK1` | `<MANAGER_UID>` | ✅ Allow |

**Exit Criteria A.3:** ✅ Tutte le rules passano i test attesi

---

### **A.4 Test UI Notifiche**

**Step 1: Crea notifica test (Firestore UI)**

```
Collection: tenants/T1/notifications
Document ID: NOTIF1
Fields:
  type: "expiry"
  title: "DURC in scadenza tra 7 giorni"
  message: "Il documento DURC risulta in scadenza..."
  severity: "warn"
  createdAt: <Timestamp: now>
  docId: "DOC1"
  docPath: "tenants/T1/companies/C1/documents/DOC1"
```

**Step 2: Apri app locale**

1. Vai a: http://localhost:5000/scadenze
2. Click tab **"Notifiche"**

**Atteso:**
- ✅ Lista mostra NOTIF1
- ✅ Badge contatore = "1 non lette"
- ✅ Click "Segna come letto" → badge aggiornato

**Exit Criteria A.4:** ✅ UI notifiche funziona (anche se con mock data per ora)

---

### **A.5 Test Alerts Dry-Run**

**Step 1: Crea documento in scadenza (Firestore UI)**

```
Collection: tenants/T1/companies/C1/documents
Document ID: DURC_SCADE
Fields:
  status: "green"
  docType: "DURC"
  expiresAt: <Timestamp: oggi + 7 giorni>  ← Importante!
  companyName: "ACME SRL"
  notifyTo: "test@example.com"
```

**Step 2: Chiama dry-run (Terminal 2)**

```powershell
# Dry-run (NO email, solo conteggi)
curl "http://localhost:5001/repository-ai-477311/europe-west1/sendExpiryAlertsDryRun"

# Dry-run con invio (crea email in collection mail/)
curl "http://localhost:5001/repository-ai-477311/europe-west1/sendExpiryAlertsDryRun?send=1&buckets=7"
```

**Atteso (JSON response):**
```json
{
  "buckets": [30, 15, 7, 1],
  "send": false,
  "results": {
    "7": [
      {
        "id": "DURC_SCADE",
        "path": "tenants/T1/companies/C1/documents/DURC_SCADE",
        "tenantId": "T1",
        "to": "test@example.com"
      }
    ]
  }
}
```

**Step 3: Verifica notifica creata (se send=1)**

1. Apri: http://localhost:4000/firestore
2. Vai a: `tenants/T1/notifications`
3. Atteso: Nuova notifica per DURC_SCADE

**Exit Criteria A.5:** ✅ Dry-run restituisce documenti in scadenza corretti

---

### **A.6 Test Flusso Inviti**

**Step 1: Crea invito (Firestore UI)**

```
Collection: tenants/T1/invites
Document ID: INV1
Fields:
  email: "newuser@test.com"
  role: "Member"
  company_id: "C1"
  expiresAt: <Timestamp: 2025-12-31>
  accepted: false
  createdBy: "<MANAGER_UID>"
  createdAt: <Timestamp: now>
```

**Step 2: Simula user autentica (Auth UI)**

1. Apri: http://localhost:4000/auth
2. Add user: `newuser@test.com` → **Copia UID**

**Step 3: Chiama acceptInvite (Terminal 2 con auth)**

⚠️ **Nota:** Callable function richiede auth token. Per test emulator:

```powershell
# Opzione A: Test via client SDK (vedi docs/MULTI_TENANCY_GUIDE.md)
# Opzione B: Test manuale claims
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=<NEW_UID>&tenant_id=T1&role=Member&company_id=C1"
```

**Step 4: Verifica invito accepted (Firestore UI)**

1. Vai a: `tenants/T1/invites/INV1`
2. Atteso:
   - `accepted: true`
   - `acceptedBy: "<NEW_UID>"`
   - `acceptedAt: <Timestamp>`

**Exit Criteria A.6:** ✅ Invito marcato accepted + claims settati

---

### **✅ Exit Criteria FASE A (Emulator)**

- [ ] 3 utenti creati con claims (Owner, Manager, Member)
- [ ] Firestore rules verificate (6 test passati)
- [ ] Storage rules verificate (upload path matching)
- [ ] UI notifiche funzionante (mock data ok)
- [ ] Alerts dry-run restituisce documenti corretti
- [ ] Flusso inviti completo (create → accept → claims)

**Tempo totale:** ~30 minuti

---

## 📍 **FASE B: PR Preview (Frontend Cloud)**

**Scopo:** Vedere l'app aggiornata con link pubblico preview.

### **B.1 Commit & Push**

```powershell
# Verifica status
git status

# Add all changes
git add .

# Commit con messaggio descrittivo
git commit -m "feat: PUNTO 6 (alerts+notif+monitoring) + PUNTO 7 (multi-tenancy+claims)

- Alert scadenze schedulati (sendExpiryAlerts)
- Notifiche in-app (schema + rules + UI)
- Monitoring metriche (email_sent, errors)
- Alert policies (Heartbeat, Zero Emails, Errors)
- KB OCR ibrido (sync + batch >30p)
- Multi-tenancy security rules
- Custom claims (acceptInvite)
- Functions: acceptInvite, devSetClaims
"

# Crea branch feature
git checkout -b feat/p6-p7-alerts-security

# Push
git push -u origin feat/p6-p7-alerts-security
```

### **B.2 Crea Pull Request**

1. Vai su: https://github.com/YOUR_USERNAME/YOUR_REPO/pulls
2. Click **"New pull request"**
3. Base: `main` ← Compare: `feat/p6-p7-alerts-security`
4. Click **"Create pull request"**
5. Titolo: "PUNTO 6+7: Alerts, Notifications, Multi-Tenancy"
6. Descrizione:
   ```markdown
   ## PUNTO 6: Alert Scadenze & Osservabilità
   - ✅ Alert schedulati (30/15/7/1 giorni)
   - ✅ Notifiche in-app (schema + UI)
   - ✅ Monitoring metriche (Counter)
   - ✅ Alert policies (3)
   
   ## PUNTO 7: Multi-Tenancy + Custom Claims
   - ✅ Firestore rules (tenant + company scope)
   - ✅ Storage rules (path matching)
   - ✅ Function acceptInvite
   - ✅ Custom claims structure
   
   ## KB OCR Ibrido
   - ✅ Sync OCR (<30 pagine)
   - ✅ Batch OCR (>30 pagine)
   - ✅ Feature flag KB_OCR_ENABLED
   ```
7. Click **"Create pull request"**

### **B.3 Ottieni Preview URL**

**Se hai GitHub Actions configurata:**

1. Vai sul tab **"Checks"** della PR
2. Attendi completamento workflow (~3-5 min)
3. Cerca commento bot Firebase: **"Preview URL: ..."**
4. Click sul link

**Alternativa (Hosting Channel):**

```powershell
firebase hosting:channel:deploy feat-p6-p7
```

**Atteso output:**
```
✔  hosting:channel: Channel URL (feat-p6-p7): https://repository-ai-477311--feat-p6-p7-xyz123.web.app
```

### **B.4 Test Frontend su Preview**

1. Apri Preview URL
2. Test checklist:

**Login:**
- [ ] Pagina `/login` carica correttamente
- [ ] Form email-link presente
- [ ] Placeholder "Check your inbox" dopo submit

**Dashboard:**
- [ ] Pagina `/dashboard` carica
- [ ] Tabella documenti (mock data) visibile
- [ ] Traffic lights rendering
- [ ] Filtri company/status presenti

**Scadenze:**
- [ ] Pagina `/scadenze` carica
- [ ] Tab "Panoramica" e "Notifiche" presenti
- [ ] Tab "Notifiche" mostra lista (mock)
- [ ] Badge contatore visibile (anche se mock)

**Upload:**
- [ ] Pagina `/upload` carica
- [ ] Drag&drop area visibile
- [ ] File input presente

**Repository:**
- [ ] Pagina `/repository` carica
- [ ] Lista integration requests (mock)

**Document Detail:**
- [ ] Pagina `/document/1` carica
- [ ] PDF viewer placeholder presente
- [ ] Extracted fields panel visibile
- [ ] Validation rules list presente

**Exit Criteria B.4:** ✅ Tutte le pagine caricano senza errori 404/500

---

### **✅ Exit Criteria FASE B (PR Preview)**

- [ ] Branch pushed su GitHub
- [ ] Pull Request creata
- [ ] Preview URL ottenuto
- [ ] 6 pagine testate (login, dashboard, scadenze, upload, repository, document)
- [ ] No errori console critici (404/500)

**Tempo totale:** ~5 minuti

---

## 📍 **FASE C: Deploy Cloud (Functions GCP)**

**Scopo:** Testare OCR, Vector Search, Email (funzionalità NON emulabili).

### **C.1 Setup Secrets (Una Volta)**

```powershell
# GEMINI_API_KEY (per LLM + embeddings)
firebase functions:secrets:set GEMINI_API_KEY
# Prompt: incolla la tua API key Gemini

# DOC_AI_PROCESSOR_ID (per OCR Document AI)
firebase functions:secrets:set DOC_AI_PROCESSOR_ID
# Prompt: incolla processor ID (formato: abc123...)
```

**Come trovare Processor ID:**
1. Vai su: https://console.cloud.google.com/ai/document-ai/processors
2. Seleziona processor OCR (EU)
3. Copia ID dalla URL o dalla pagina dettagli

### **C.2 Deploy Mirato (Solo Functions Necessarie)**

```powershell
# Deploy solo functions che richiedono GCP
firebase deploy --only functions:kbIngestFromStorage,functions:kbSearch,functions:sendExpiryAlertsDryRun,functions:acceptInvite

# Deploy rules (se non già fatto)
firebase deploy --only firestore:rules,storage:rules
```

**Tempo:** ~3-4 minuti

**Atteso output:**
```
✔  functions[kbIngestFromStorage(europe-west1)]: Successful update
✔  functions[kbSearch(europe-west1)]: Successful update
✔  functions[sendExpiryAlertsDryRun(europe-west1)]: Successful update
✔  functions[acceptInvite(europe-west1)]: Successful update
```

**Function URLs (copia per test):**
```
https://kbingestfromstorage-ifjiaaz4rq-ew.a.run.app
https://kbsearch-ifjiaaz4rq-ew.a.run.app
https://sendexpiryalertsdryrun-ifjiaaz4rq-ew.a.run.app
https://acceptinvite-ifjiaaz4rq-ew.a.run.app
```

---

### **C.3 Test OCR + KB Ingestion**

**Pre-requisito:** Upload PDF test su Storage

```powershell
# Opzione A: Via Console Storage
# 1. Vai: https://console.firebase.google.com/project/repository-ai-477311/storage
# 2. Upload file in: kb/test_digitale.pdf
# 3. Upload file in: kb/test_scansione.pdf

# Opzione B: Via CLI
firebase storage:upload local/test.pdf kb/test_digitale.pdf
```

**Test 1: PDF Digitale (No OCR)**

```powershell
curl "https://kbingestfromstorage-ifjiaaz4rq-ew.a.run.app?tid=DEMO&storagePath=kb/test_digitale.pdf&source=TestDigitale"
```

**Atteso (dopo 5-10 sec):**
```
Ingested 15 chunks from kb/test_digitale.pdf
```

**Verifica Firestore:**
1. Console → Firestore → `tenants/DEMO/kb_chunks`
2. Atteso: 15 documenti con campi `text`, `embedding` (vector), `source`

**Test 2: PDF Scansionato <30 pag (Sync OCR)**

⚠️ **Nota:** Richiede `KB_OCR_ENABLED=true` deployato

```powershell
# Se KB_OCR_ENABLED=false (default), forza con flag:
curl "https://kbingestfromstorage-ifjiaaz4rq-ew.a.run.app?tid=DEMO&storagePath=kb/test_scansione.pdf&source=TestScan&forceOcr=1"
```

**Atteso (dopo 15-30 sec):**
```
Ingested 22 chunks from kb/test_scansione.pdf (with OCR SYNC)
```

**Test 3: PDF Lungo >30 pag (Batch OCR)**

⚠️ **Nota:** Richiede PDF >30 pagine

```powershell
curl "https://kbingestfromstorage-ifjiaaz4rq-ew.a.run.app?tid=DEMO&storagePath=kb/manual_lungo.pdf&source=TestBatch&forceOcr=1"
```

**Atteso (dopo 3-5 min):**
```
Ingested 142 chunks from kb/manual_lungo.pdf (with OCR BATCH)
```

**Verifica output batch (Storage):**
1. Console → Storage → `docai_batch/kb/`
2. Atteso: Directory con timestamp + file JSON output

**Exit Criteria C.3:** ✅ 3 tipi di ingestion funzionano (digitale, scan sync, scan batch)

---

### **C.4 Test Vector Search**

**Pre-requisito:** Almeno 1 ingestion completata (C.3)

```powershell
# Query normativa DURC
curl "https://kbsearch-ifjiaaz4rq-ew.a.run.app?tid=DEMO&q=Normativa%20DURC%20validit%C3%A0%20120%20giorni&k=5"
```

**Atteso (JSON):**
```json
{
  "results": [
    {
      "id": "abc123...",
      "text": "...normativa DURC validità 120 giorni...",
      "source": "kb/test_digitale.pdf",
      "page": 3,
      "score": 0.87
    },
    ...
  ]
}
```

**Exit Criteria C.4:** ✅ Vector search restituisce risultati rilevanti

---

### **C.5 Test Email Alerts (Se Extension Configurata)**

**Pre-requisito:** Extension "Trigger Email" installata e configurata

**Setup Extension (Console - Una volta):**
1. Vai: https://console.firebase.google.com/project/repository-ai-477311/extensions
2. Click **"Install Extension"**
3. Cerca: **"Trigger Email"**
4. Configura:
   - Collection path: `mail`
   - SMTP settings: (tuo provider)
   - Default FROM: `noreply@tuodominio.com`

**Test 1: Crea documento in scadenza (Firestore Console)**

```
Collection: tenants/DEMO/companies/TEST/documents
Document ID: DURC_TEST
Fields:
  status: "green"
  docType: "DURC"
  expiresAt: <Timestamp: oggi + 7 giorni>
  companyName: "Test SRL"
  notifyTo: "tua-email@test.com"  ← Email reale per test
```

**Test 2: Trigger dry-run con send**

```powershell
curl "https://sendexpiryalertsdryrun-ifjiaaz4rq-ew.a.run.app?send=1&buckets=7"
```

**Atteso:**
- JSON con conteggi
- Email ricevuta entro 1-2 minuti
- Firestore: Notifica creata in `tenants/DEMO/notifications`
- Firestore: Email document in `mail/` collection

**Verifica Logs:**

```powershell
gcloud functions logs read sendExpiryAlertsDryRun --limit=20
```

**Atteso logs:**
```
{"type":"expiryAlerts","event":"email_sent","bucket":7,"recipient":"tua-email@test.com",...}
{"type":"expiryAlerts","event":"run_completed","sent":1,...}
```

**Exit Criteria C.5:** ✅ Email ricevuta + notifica creata + logs corretti

---

### **C.6 Test Monitoring Metriche (Dopo 5-10 min)**

**Pre-requisito:** Almeno 1 email inviata (C.5)

**Verifica Metriche:**

```powershell
# Lista metriche user-defined
gcloud logging metrics list --project=repository-ai-477311 --filter="name:expiry_alerts"
```

**Atteso:**
```
NAME                            DESCRIPTION
expiry_alerts_email_sent        Conteggio email di scadenza inviate...
expiry_alerts_errors            Conteggio errori nelle funzioni...
```

**Verifica Time Series:**

```powershell
gcloud monitoring time-series list \
  --filter='metric.type="logging.googleapis.com/user/expiry_alerts_email_sent"' \
  --project=repository-ai-477311
```

**Atteso:** Time series con `points[].value.int64Value >= 1`

**Verifica Console UI:**

1. Vai: https://console.cloud.google.com/monitoring/metrics-explorer?project=repository-ai-477311
2. Metric: `logging.googleapis.com/user/expiry_alerts_email_sent`
3. Chart type: Line
4. Atteso: Grafico mostra 1+ email sent

**Exit Criteria C.6:** ✅ Metriche popolate e visibili in Monitoring

---

### **✅ Exit Criteria FASE C (Functions Cloud)**

- [ ] Secrets configurati (GEMINI_API_KEY, DOC_AI_PROCESSOR_ID)
- [ ] 4 functions deployate
- [ ] Rules deployate
- [ ] KB Ingestion: PDF digitale ok
- [ ] KB Ingestion: PDF scansionato sync ok
- [ ] KB Ingestion: PDF batch >30p ok (se testato)
- [ ] Vector Search: risultati rilevanti
- [ ] Email: ricevuta dopo dry-run send=1
- [ ] Notifica: creata in Firestore
- [ ] Metriche: popolate e visibili

**Tempo totale:** ~20 minuti

---

## 📊 **Riepilogo Finale**

### **Cosa Hai Testato**

| Funzionalità | Emulator | Cloud | Status |
|--------------|----------|-------|--------|
| Firestore Rules | ✅ | - | Verificato |
| Storage Rules | ✅ | - | Verificato |
| UI Notifiche | ✅ | ✅ (PR) | Verificato |
| Alerts Dry-Run | ✅ | ✅ | Verificato |
| Flusso Inviti | ✅ | - | Verificato |
| KB Ingestion (digitale) | ❌ | ✅ | Verificato |
| KB Ingestion (OCR sync) | ❌ | ✅ | Verificato |
| KB Ingestion (OCR batch) | ❌ | ✅ | Verificato |
| Vector Search | ❌ | ✅ | Verificato |
| Email Alerts | ❌ | ✅ | Verificato |
| Monitoring Metriche | ❌ | ✅ | Verificato |

**Legenda:**
- ✅ = Testato e funzionante
- ❌ = Non supportato in quell'ambiente
- - = Non necessario testare

---

## 🎯 **Prossimi Step**

### **Opzione 1: Deploy Completo Produzione**

```powershell
# Deploy TUTTO (tutte le functions + rules)
firebase deploy --project=repository-ai-477311

# Setup monitoring
.\monitoring\deploy-monitoring.ps1

# Configura Notification Channels (UI)
# https://console.cloud.google.com/monitoring/alerting/notifications?project=repository-ai-477311
```

**Tempo:** ~10 minuti

---

### **Opzione 2: Deploy Incrementale**

**Deploy solo ciò che serve:**

```powershell
# Batch 1: Security
firebase deploy --only firestore:rules,storage:rules

# Batch 2: Auth
firebase deploy --only functions:acceptInvite

# Batch 3: KB
firebase deploy --only functions:kbIngestFromStorage,functions:kbSearch

# Batch 4: Alerts
firebase deploy --only functions:sendExpiryAlerts,functions:sendExpiryAlertsDryRun

# Batch 5: Monitoring
.\monitoring\deploy-monitoring.ps1
```

---

### **Opzione 3: Chiudi PR e Merge**

Se tutti i test passano:

1. Vai sulla PR su GitHub
2. Review + Approve
3. Click **"Merge pull request"**
4. Delete branch `feat/p6-p7-alerts-security`
5. Pull main locale: `git checkout main; git pull`

---

## 📚 **Documentazione Riferimenti**

- **PUNTO 6 (Alerts):** `docs/MONITORING_SOLUTION.md`
- **PUNTO 6 (Notifiche):** `docs/NOTIFICATIONS_GUIDE.md`
- **PUNTO 7 (Multi-Tenancy):** `docs/MULTI_TENANCY_GUIDE.md`
- **Quick Start PUNTO 7:** `PUNTO7_QUICKSTART.md`
- **Monitoring Setup:** `monitoring/README.md`

---

## ✅ **Checklist Complessiva**

### **Testing**
- [ ] FASE A completata (Emulator - 30 min)
- [ ] FASE B completata (PR Preview - 5 min)
- [ ] FASE C completata (Cloud Functions - 20 min)

### **Deploy**
- [ ] Rules deployate (Firestore + Storage)
- [ ] Functions deployate (minimo 4)
- [ ] Monitoring configurato (metriche + alert)
- [ ] Notification channels configurati

### **Documentazione**
- [ ] README aggiornati
- [ ] CHANGELOG.md aggiornato (opzionale)
- [ ] PR description completa

### **Production Ready**
- [ ] Tutti i test passano
- [ ] Logs puliti (no errori critici)
- [ ] Metriche popolate
- [ ] Alert policies attive
- [ ] Email-Link Auth abilitata

---

**🎉 COMPLETATO? → Production Ready!**

**Tempo totale stimato:** ~55 minuti (A: 30min + B: 5min + C: 20min)

