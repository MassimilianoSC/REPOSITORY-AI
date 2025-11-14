# 🚀 Release Notes — Version 1.0.0 (MVP Production)

**Data rilascio:** 2024-11-11  
**Ambiente:** Production  
**Commit SHA:** `________________`  
**Tag Git:** `v1.0.0`

---

## 📋 Executive Summary

Primo rilascio in produzione del **sistema di gestione documenti con OCR e AI** basato su Firebase.

L'MVP include:
- ✅ Upload e processamento automatico documenti PDF
- ✅ Estrazione dati via OCR (Document AI) e analisi LLM (Gemini)
- ✅ Knowledge base normativa con ricerca semantica (RAG)
- ✅ Sistema alert scadenze via email
- ✅ Autenticazione passwordless e multi-tenancy
- ✅ Dashboard web con filtri e visualizzazione stato documenti

---

## 🎯 Funzionalità Incluse

### 1. Autenticazione e Autorizzazione

**Implementato:**
- Login passwordless via email link (Firebase Auth)
- Custom claims per ruoli: `admin`, `manager`, `member`
- Multi-tenancy: isolamento dati per tenant (`tid`) e company (`cid`)
- Firestore security rules basate su ABAC (Attribute-Based Access Control)

**Ruoli disponibili:**
- **Admin:** accesso completo sistema
- **Manager:** gestione tenant (tutte le companies)
- **Member:** accesso limitato alla propria company

---

### 2. Pipeline Documentale

**Flusso completo:**
1. Upload PDF via drag-and-drop (frontend Next.js)
2. Storage trigger → Cloud Function `processUpload`
3. **OCR intelligente:**
   - PDF digitale (testo nativo): skip OCR, parsing diretto
   - PDF scansionato: OCR via Document AI (EU region)
   - Gating automatico: soglia 200 char/page
4. **Normalizzazione LLM:**
   - Estrazione campi: `docType`, `issuedAt`, `expiresAt`, `companyName`, `vatNumber`, `fiscalCode`
   - Gemini 2.0 Flash con fallback su modello standard
   - Confidence score e retry logic
5. **Regole deterministiche:**
   - Calcolo stato documento: 🟢 GREEN | 🟡 YELLOW | 🔴 RED
   - Validazione date scadenza
   - Ragioni descrittive per ogni stato
6. **RAG References:**
   - Query automatica knowledge base normativa
   - Top-4 citazioni pertinenti allegate al documento

**Tipi documento supportati:**
- DURC
- Visura Camerale
- DUVRI
- POS (Piano Operativo Sicurezza)
- Altro (generico)

---

### 3. Knowledge Base & RAG

**Funzionalità:**
- Ingest documenti normativi da Storage (`kb/{tid}/*.pdf`)
- Chunking intelligente: 1000 token, overlap 150
- Embeddings vettoriali (Vertex AI Text Embedding)
- Vector search su Firestore (single-field index `embedding`)
- Prefiltro per tenant (isolamento multi-tenancy)

**Endpoints:**
- `kbIngestFromStorage`: ingest documento normativo
- `kbSearch`: ricerca semantica con query in linguaggio naturale

**Performance:**
- Latenza p95: < 600ms per query con `top-k=4`
- Storage: ~1MB per 1000 chunks (dipende da dimensione embeddings)

---

### 4. Sistema Alert Scadenze

**Funzionalità:**
- Scansione giornaliera documenti in scadenza
- Bucket temporali: 30 giorni, 15 giorni, 7 giorni, 1 giorno
- Aggregazione per tenant e company
- Email automatiche via Trigger Email Extension
- Dry-run per test senza invio effettivo

**Configurazione:**
- Orario: 08:00 Europe/Rome (Cloud Scheduler)
- Template email: configurabile in `alerts/common.ts`
- Override recipient per test: `MAIL_TO_OVERRIDE` env var

**Metriche:**
- Log-based metric: `expiry_alerts_email_sent`
- Dashboard Monitoring per tracking invii
- Alert su assenza heartbeat (detection job non eseguito)

---

### 5. Dashboard Web (Next.js)

**Pagine:**
- `/login` — Autenticazione passwordless
- `/dashboard` — Tabella documenti con filtri (company, status)
- `/upload` — Upload drag-and-drop con progress bar
- `/document/[id]` — Dettaglio documento + PDF viewer + RAG references
- `/scadenze` — Vista documenti in scadenza (calendar placeholder)
- `/repository` — Tracking richieste integrazione (placeholder)

**UI/UX:**
- Design moderno con Tailwind CSS e shadcn/ui
- Componente "Traffic Light" per status visivo (verde/giallo/rosso)
- Tabelle responsive con paginazione e ordinamento
- Loading states e empty states user-friendly

---

## 🚫 Funzionalità Escluse (Future Release)

Le seguenti funzionalità **NON** sono incluse nella v1.0 e sono pianificate per release successive:

### Pianificate v1.1:
- [ ] Notifiche in-app real-time (Firebase Cloud Messaging)
- [ ] Export documenti in CSV/Excel
- [ ] Filtri avanzati dashboard (date range, confidence threshold)
- [ ] Bulk upload (caricamento multiplo simultaneo)

### Pianificate v1.2:
- [ ] Workflow approvazioni documenti (review/approve/reject)
- [ ] Audit log completo (chi ha fatto cosa quando)
- [ ] Gestione utenti via UI (inviti, revoche, modifica ruoli)
- [ ] Reportistica avanzata (analytics scadenze, OCR accuracy)

### Pianificate v2.0:
- [ ] Mobile app (iOS/Android)
- [ ] Integrazione ERP/CRM esterni
- [ ] OCR custom training per documenti specifici cliente
- [ ] Multi-lingua (attualmente solo italiano)

---

## ⚠️ Rischi Noti e Mitigazioni

### Rischio 1: Picchi costo Document AI

**Descrizione:** Caricamenti massivi di PDF scansionati possono generare costi elevati OCR.

**Mitigazione:**
- Gating automatico: soglia 200 char/page (skip OCR se superata)
- Budget alert configurati su progetto Firebase
- Limite concorrenza functions: max 80 istanze simultanee
- Monitoring daily spend via dashboard billing

**Azione richiesta:** Monitorare dashboard billing nelle prime 48h post-go-live.

---

### Rischio 2: Latenza OCR per documenti grandi

**Descrizione:** PDF >30 pagine possono richiedere 30-60 secondi elaborazione.

**Mitigazione:**
- Timeout functions: 180 secondi
- Feedback utente: status "processing" visibile in dashboard
- Future: implementare batch processing asincrono per documenti grandi

**Azione richiesta:** Comunicare agli utenti che documenti >30 pagine possono richiedere 1-2 minuti.

---

### Rischio 3: Falsi positivi/negativi LLM

**Descrizione:** Gemini può estrarre date errate o classificare male il tipo documento.

**Mitigazione:**
- Confidence score: documenti con confidence <0.75 marcati come "bassa affidabilità"
- Review manuale: utenti possono correggere campi estratti (UI da implementare v1.1)
- Fallback su modello più potente se primo tentativo fallisce

**Azione richiesta:** Validare manualmente primi 50 documenti processati e raccogliere feedback utenti.

---

### Rischio 4: Downtime Cloud Functions

**Descrizione:** Deploy o issue GCP possono causare indisponibilità temporanea processing.

**Mitigazione:**
- Retry automatico su errori transienti
- Queue implicita in Storage trigger (riprocessa a ripristino servizio)
- Rollback rapido via Firebase Hosting/Functions versioning

**Azione richiesta:** Comunicare finestra manutenzione durante deploy (stimata 2-5 minuti downtime).

---

## 🔐 Considerazioni Sicurezza

### Data Locality
- ✅ Tutti i servizi in **EU region** (europe-west1)
- ✅ Firestore: `eur3` (multi-region EU)
- ✅ Storage: default location EU
- ✅ Document AI: processor EU

### Privacy & PII
- ✅ Nessun download URL pubblico (accesso via SDK autenticato)
- ✅ Firestore rules: isolamento multi-tenant
- ✅ Storage rules: upload path validation
- ✅ Cloud Audit Logs attivi (conservazione 90 giorni)

### Authentication
- ✅ Passwordless email link (no password da gestire)
- ✅ Custom claims per ABAC
- ✅ Domini autorizzati configurati in Firebase Auth

---

## 📊 Metriche di Successo (KPI)

**Monitorare nelle prime 4 settimane:**

### Performance
- [ ] Latenza p95 `kbSearch`: < 600ms ✅
- [ ] Latenza p95 `processUpload` (PDF digitale): < 15s ✅
- [ ] Latenza p95 `processUpload` (PDF scansionato): < 45s ⚠️

### Affidabilità
- [ ] Uptime functions: > 99.5%
- [ ] Error rate: < 1%
- [ ] Retry success rate: > 95%

### Adozione
- [ ] Utenti attivi settimanali: target 20+
- [ ] Documenti processati/giorno: target 50+
- [ ] Tasso errori upload: < 5%

### Costi
- [ ] Document AI: < €100/mese (baseline MVP)
- [ ] Gemini API: < €50/mese
- [ ] Firestore: < €20/mese
- [ ] Totale infra: < €200/mese

---

## 🛠️ Operazioni Post-Go-Live

### Giorno 0 (giorno deploy)
- [x] Deploy staging + exit tests
- [x] Deploy production + exit tests
- [ ] Comunicare go-live a stakeholders
- [ ] Monitoring attivo (Cloud Logging tail)
- [ ] Verificare primi 5 upload reali

### Giorni 1-7
- [ ] Monitorare dashboard billing giornalmente
- [ ] Raccogliere feedback utenti pilot
- [ ] Verificare email alert scadenze (ogni mattina 08:00)
- [ ] Controllare metriche performance (latenza, error rate)

### Settimane 2-4
- [ ] Review metriche di successo (vs. KPI)
- [ ] Analisi costi effettivi vs. stimati
- [ ] Pianificazione feature v1.1 based su feedback
- [ ] Ottimizzazioni performance se necessarie

---

## 📞 Contatti & Supporto

### On-Call (emergenze production)
**Chi:** ________________  
**Telefono:** ________________  
**Email:** ________________  
**Orari:** 24/7 per prime 48h, poi 9-18 lun-ven

### Canali Support
- **Slack:** `#sikuro-production-alerts` (alert automatici)
- **Email:** `support@YOUR_DOMAIN.com` (utenti finali)
- **Jira:** Board "SIKURO-OPS" (bug/incident tracking)

### Escalation Path
1. On-call engineer (risposta <30 min)
2. Tech lead (risposta <2h)
3. CTO (decisioni critiche)

---

## 📚 Documentazione di Riferimento

**Repository:**
- `README.md` — Setup progetto
- `docs/DEPLOY_CHECKLIST.md` — Procedura deploy
- `docs/EXIT_TESTS.md` — Test post-deploy
- `docs/RUNBOOK.md` — Procedure operative
- `docs/MULTI_TENANCY_GUIDE.md` — Guida multi-tenancy
- `docs/NOTIFICATIONS_GUIDE.md` — Sistema notifiche
- `docs/MONITORING_SOLUTION.md` — Setup monitoring

**Firebase Console:**
- Authentication: gestione utenti e custom claims
- Firestore: database documenti
- Storage: PDF uploads
- Functions: logs e metriche

**GCP Console:**
- Cloud Logging: analisi log dettagliati
- Cloud Monitoring: dashboard e alert
- Cloud Billing: tracking costi
- Secret Manager: gestione segreti

---

## ✅ Sign-off Rilascio

### Approvazioni

**Product Owner:**  
Nome: ________________  
Firma: ________________  
Data: ________________

**Tech Lead:**  
Nome: ________________  
Firma: ________________  
Data: ________________

**QA/Test Lead:**  
Nome: ________________  
Firma: ________________  
Data: ________________

### Commit & Deploy Info

**Commit SHA:** `________________`  
**Tag Git:** `v1.0.0`  
**Deploy timestamp:** `________________`  
**Firebase project:** `repository-ai-477311` (prod)

---

## 🎉 Congratulazioni!

**L'MVP è in produzione!** 🚀

Grazie al team per il lavoro svolto. Ora monitoriamo e iteriamo sulla base del feedback reale degli utenti.

**Next steps:**
1. Monitorare metriche prime 48h
2. Raccogliere feedback pilot users
3. Planning sprint v1.1

---

_Document version: 1.0_  
_Last updated: 2024-11-11_

