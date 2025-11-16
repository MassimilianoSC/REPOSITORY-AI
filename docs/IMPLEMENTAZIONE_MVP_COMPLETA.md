# 🚀 IMPLEMENTAZIONE MVP COMPLETATA

**Data:** 16 Novembre 2024  
**Implementati:** 4 step critici (Aggregazione, Email, Security, Scadenze/Notifiche)

---

## ✅ COSA È STATO IMPLEMENTATO

### 1️⃣ **AGGREGAZIONE AUTOMATICA STATO AZIENDA**

**File creati:**
- `functions/src/aggregates/companyStatus.ts` → Logica di calcolo aggregato

**File modificati:**
- `functions/src/index.ts` → Chiamata aggregatore dopo `processUpload`
- `functions/src/overrideNonPertinente.ts` → Chiamata aggregatore dopo override
- `functions/src/lib/rulebookLoader.ts` → Aggiunto `getRequiredDocTypes()`

**Funzionalità:**
- Calcola stato aggregato azienda (🟢 verde / 🟡 giallo / 🔴 rosso / ⚪ N/D)
- Logica:
  - **ROSSO**: almeno 1 documento mancante O non idoneo
  - **GIALLO**: nessun rosso, ma almeno 1 in scadenza ≤10 giorni
  - **VERDE**: tutti i required presenti e idonei
  - **N/D**: nessun documento richiesto
- Salva in `tenants/{tid}/companies/{cid}.aggregateStatus`
- Aggiornamento automatico dopo ogni upload/override

---

### 2️⃣ **EMAIL NOTIFICATIONS (DRY-RUN)**

**File creati:**
- `functions/src/lib/email.ts` → Helper `queueEmail()` e utilities

**File modificati:**
- `functions/src/index.ts` → Hook email per:
  - A) Documento in coda verificatore (`needsReview=true`)
  - B) Documento non idoneo (`status='red'`)

**Funzionalità:**
- Scrive documenti in collezione `mail/` per Firebase Extension
- **Modalità dry-run** (default): solo log, nessun invio reale
- Variabile `MAIL_ENABLED=false` (da impostare `true` dopo installazione Extension)
- Destinatari da variabile `VERIFIER_EMAILS` (.env)

---

### 3️⃣ **SECURITY RULES HARDENING**

**File modificati:**
- `firestore.rules` → ABAC multi-tenant con custom claims
- `storage.rules` → Accesso tenant-scoped con RBAC

**Regole applicate:**
- **Documents**: solo lettura (scrittura solo backend)
- **Companies**: solo lettura (aggregati scritti solo backend)
- **Notifications**: lettura per tenant/azienda, scrittura solo backend
- **Mail**: nessun accesso client
- **Storage**: accesso basato su `tenant_id` e `company_ids`
- Helper functions: `isManager()`, `isVerifier()`, `isUploader()`, `inCompany()`

**IMPORTANTE:** Rimossa regola permissiva `tenant-demo` 🔥

---

### 4️⃣ **SCADENZE E NOTIFICHE (DATI REALI)**

**File modificati:**
- `app/(app)/scadenze/page.tsx` → Query Firestore con listener real-time
- `components/notification-list.tsx` → Listener abilitati per notifiche e read states

**Funzionalità Scadenze:**
- Query documenti con `expiresAt` nei prossimi 30 giorni
- Statistiche real-time: Scaduti / In Scadenza (≤10gg) / Validi
- Tabella ordinata per urgenza
- Loading states

**Funzionalità Notifiche:**
- Listener su `tenants/{tid}/notifications`
- Listener su `tenants/{tid}/userReads/{uid}/reads`
- Funzione `markAsRead()` attiva
- Contatore "non lette"
- Link ai documenti con routing aggiornato (`?id=...&tid=...`)

---

## 📋 VARIABILI D'AMBIENTE DA CONFIGURARE

Aggiungi a `functions/.env` (e `.env.stg` per staging):

```bash
# Aggregazione
EXPIRY_SOON_DAYS=10

# Email (dry-run inizialmente)
MAIL_ENABLED=false
VERIFIER_EMAILS=email1@example.com,email2@example.com
```

---

## 🚀 DEPLOY SEQUENCE

### 1. **Verifica e Build**
```bash
cd functions
npm run build
```

### 2. **Deploy Functions**
```bash
firebase deploy --only functions --project repository-ai-477311
```

Funzioni deployate:
- `processUpload` (con aggregatore + email)
- `overrideNonPertinente` (con aggregatore)
- `recomputeCompanyAggregate` (helper)
- (tutte le altre esistenti)

### 3. **Deploy Rules**
```bash
firebase deploy --only firestore:rules,storage --project repository-ai-477311
```

⚠️ **ATTENZIONE:** Le regole ora bloccano scritture dirette sui documenti. Assicurati che:
- Gli utenti abbiano custom claims (`tenant_id`, `company_ids[]`, `role`)
- Gli upload vadano tramite backend (Admin SDK)

### 4. **Deploy Hosting**
```bash
cd ..  # torna alla root del progetto
npm run build
firebase deploy --only hosting --project repository-ai-477311
```

---

## 🧪 EXIT TESTS

### **Test 1: Aggregazione Azienda** ✅

1. Vai su Firebase Console → Firestore
2. Naviga a `tenants/tenant-demo/companies/Acme Corp`
3. Verifica campo `aggregateStatus` presente con:
   - `status`: 'green' | 'yellow' | 'red' | 'na'
   - `totalRequired`, `totalOk`, `totalNotOk`, `totalExpiringSoon`
   - `nextExpiryAt`
   - `breakdown` (dettaglio per docType)

4. **Test pratico:**
   - Carica un documento con status `red` → Aggregato diventa `red`
   - Sostituisci con documento `green` → Aggregato diventa `green` (se tutti OK)
   - Carica documento in scadenza ≤10gg → Aggregato diventa `yellow`

5. Vai su `/azienda?cid=Acme%20Corp&tid=tenant-demo`
   - Semaforo dovrebbe mostrare colore corretto (non più grigio!)
   - Contatori dovrebbero essere corretti

---

### **Test 2: Email Notifications (dry-run)** ✅

1. Carica un documento che genera `needsReview=true`
2. Vai su Firebase Console → Firestore → `mail/`
3. **Verifica presenza** di un documento con:
   - `to`: array email verificatori
   - `message.subject`: "🔔 Nuovo documento da verificare..."
   - `message.html`: contenuto email

4. **Se MAIL_ENABLED=true** (dopo installazione Extension):
   - Verifica ricezione email reale
   - Controlla campo `delivery` nella collezione `mail/`

---

### **Test 3: Security Rules** ✅

1. **Prepara 2 utenti test con claims diversi:**
   ```bash
   # Via devSetClaims (se in emulator) o manualmente
   User A: tenant_id='tenant-demo', company_ids=['Acme Corp'], role='uploader'
   User B: tenant_id='tenant-demo', company_ids=['Beta Inc'], role='uploader'
   ```

2. **Test accesso negato:**
   - Login con User B
   - Prova ad accedere a `/document?id=<docId di Acme Corp>&tid=tenant-demo`
   - **Atteso:** Firestore blocca lettura (error permission-denied)

3. **Test accesso consentito:**
   - Login con User A
   - Accedi a documento di Acme Corp
   - **Atteso:** Lettura OK

4. **Test scrittura bloccata:**
   - Da console browser, prova:
     ```javascript
     firebase.firestore().doc('tenants/tenant-demo/companies/Acme Corp/documents/test').set({test: 1})
     ```
   - **Atteso:** Error permission-denied (allow write: false)

---

### **Test 4: Scadenze** ✅

1. Vai su `/scadenze`
2. **Verifica:**
   - Card statistiche NON mostrano più "0" ma numeri reali (o "..." se loading)
   - Tabella "Prossime Scadenze" mostra documenti con `expiresAt` nei prossimi 30gg
   - Documenti ordinati per urgenza (più vicini in cima)

3. **Se non ci sono documenti in scadenza:**
   - Vai su Firestore
   - Modifica manualmente un `expiresAt` di un documento a oggi + 5 giorni
   - Ricarica `/scadenze` → dovrebbe apparire nella card "In Scadenza"

---

### **Test 5: Notifiche** ✅

1. Vai su `/scadenze` → tab "Notifiche"
2. **Se non ci sono notifiche:**
   - Crea manualmente in Firestore:
     ```javascript
     tenants/tenant-demo/notifications/{randomId}
     {
       title: "Test notifica",
       message: "Questo è un test",
       severity: "info",
       createdAt: serverTimestamp(),
       docId: "<id documento esistente>",  // opzionale
       companyId: "Acme Corp"
     }
     ```
3. **Verifica:**
   - Notifica appare nella lista
   - Badge "non lette" corretto
   - Click "Segna come letto" → badge decrementa
   - Link "Apri documento" (se docId presente) → redirect corretto

---

## 📝 TODO POST-DEPLOY

### **PRIORITÀ ALTA (prima dell'uso in produzione):**

- [ ] **Configura custom claims** per utenti reali (via Admin SDK o Cloud Function)
- [ ] **Testa RBAC** con utenti di diverse aziende
- [ ] **Popola `VERIFIER_EMAILS`** in `.env` con email reali
- [ ] **Installa Firebase Extension Email** (opzionale, per invio reale):
  ```bash
  firebase ext:install firebase/firestore-send-email --project repository-ai-477311
  ```
  Config:
  - `LOCATION=europe-west1`
  - `MAIL_COLLECTION=mail`
  - `FROM_ADDRESS=noreply@repository-ai-477311.firebaseapp.com`
  - `SMTP_CONNECTION_URI=<provider SMTP>`
- [ ] **Imposta `MAIL_ENABLED=true`** dopo installazione Extension

### **PRIORITÀ MEDIA:**

- [ ] Sostituire tenantId/uid hardcoded con `useAuth()` hook
- [ ] Aggiungere indici Firestore per query `collectionGroup('documents')`
- [ ] Implementare cron giornaliera per ricalcolo aggregati
- [ ] Aggiungere trigger email per "Richiesta integrazione" (punto C)

### **NICE TO HAVE:**

- [ ] Dashboard: mostrare semaforo per più aziende
- [ ] Scadenze: vista calendario visiva
- [ ] Email: template HTML più elaborati
- [ ] Aggregazione: supporto per riskClass filtrato

---

## 🐛 TROUBLESHOOTING

### **Semafori ancora grigi dopo deploy**

**Causa:** Campo `aggregateStatus` non popolato  
**Soluzione:**
1. Carica un nuovo documento (trigger automatico)
2. OPPURE esegui manualmente:
   ```javascript
   // Via Cloud Function HTTP (da creare) o script Admin SDK
   await recomputeCompanyAggregate('tenant-demo', 'Acme Corp', getRequiredDocTypes())
   ```

---

### **Email non scritte in `mail/`**

**Verifica:**
1. Log Functions: `firebase functions:log --only processUpload`
2. Cerca: `[Email] DRY_RUN` → dovrebbe esserci
3. Se manca: verifica che `needsReview=true` o `status='non_idoneo'`

---

### **Security Rules bloccano tutto**

**Verifica custom claims:**
```javascript
// In console browser, dopo login
firebase.auth().currentUser.getIdTokenResult().then(r => console.log(r.claims))
```

Deve avere:
- `tenant_id`: 'tenant-demo'
- `company_ids`: ['Acme Corp']
- `role`: 'uploader' | 'verifier' | 'manager'

**Se mancano:** Usa `devSetClaims` (emulator) o imposta via Admin SDK

---

### **Scadenze/Notifiche vuote**

**Verifica:**
1. Console browser → Network → verifica errori Firestore
2. Se "Missing or insufficient permissions":
   - Verifica custom claims
   - Verifica rules deployate correttamente
3. Se "Index required":
   - Deploy indici: `firebase deploy --only firestore:indexes`

---

## 📊 METRICHE POST-DEPLOY

Dopo il deploy, monitora per 24h:

1. **Functions Logs:**
   - `[Aggregate] Company ... status updated` → deve apparire dopo ogni upload
   - `[Email] DRY_RUN` → deve apparire per needsReview/non_idoneo

2. **Firestore:**
   - `tenants/{tid}/companies/{cid}.aggregateStatus` → deve aggiornarsi real-time
   - `mail/` → deve popolarsi (se email attive)

3. **UI:**
   - Dashboard: semafori colorati (non grigi)
   - Scadenze: statistiche > 0
   - Notifiche: lista popolata

---

## 🎯 NEXT STEPS (da indicazioni developer)

Attendiamo risposta del developer alle domande poste per:
1. Mini-diff completi (se necessari)
2. Checklist comandi finale
3. Eventuali integrazioni aggiuntive

Per ora l'implementazione è **COMPLETA e PRONTA per il deploy** 🚀

---

**Implementato da:** AI Assistant  
**Basato su:** Indicazioni Developer (2 messaggi) + Piano MVP

