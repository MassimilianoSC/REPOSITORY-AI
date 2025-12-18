# 🏢 Multi-Tenancy + Company Scope - PUNTO 7

Sistema completo di multi-tenancy con custom claims, inviti e security rules.

---

## 🎯 **Architettura**

### **Custom Claims Structure**

Ogni utente autenticato ha questi custom claims nel token JWT:

```typescript
{
  tenant_id: string;      // es: "T1" (obbligatorio)
  role: string;           // "Owner" | "Manager" | "Member"
  company_id?: string;    // es: "C1" (opzionale, solo per Member)
}
```

### **Ruoli & Permessi**

| Ruolo | Scope | Permessi |
|-------|-------|----------|
| **Owner** | Tenant | Accesso completo a tutto il tenant |
| **Manager** | Tenant | Gestione company, inviti, KB, documenti |
| **Member** | Company | Accesso solo ai documenti della propria company |

---

## 📂 **Firestore Structure**

```
tenants/
  {tid}/
    companies/
      {cid}/
        documents/
          {docId}/
            - status, docType, expiresAt, etc.
    
    kb_chunks/
      {chunkId}/
        - text, embedding, source, page
    
    notifications/
      {nid}/
        - type, title, message, severity
    
    userReads/
      {uid}/
        reads/
          {nid}/
            - readAt
    
    invites/
      {iid}/
        - email, role, company_id, expiresAt, accepted
```

---

## 🔐 **Security Rules**

### **Firestore Rules**

**File:** `firestore.rules`

**Helper Functions:**
```javascript
function isSignedIn() { return request.auth != null; }
function sameTenant(tid) { return isSignedIn() && request.auth.token.tenant_id == tid; }
function isManager() { return isSignedIn() && (request.auth.token.role in ['Owner','Manager']); }
function sameCompany(cid) { return isSignedIn() && request.auth.token.company_id == cid; }
```

**Documents:**
```javascript
match /tenants/{tid}/companies/{cid}/documents/{docId} {
  // Manager: accesso a tutte le company del tenant
  // Member: accesso solo alla propria company
  allow read, write: if sameTenant(tid) && (isManager() || sameCompany(cid));
}
```

**KB Chunks:**
```javascript
match /tenants/{tid}/kb_chunks/{chunkId} {
  allow read: if sameTenant(tid);                   // Tutti gli utenti del tenant
  allow write: if sameTenant(tid) && isManager();   // Solo Owner/Manager
}
```

**Invites:**
```javascript
match /tenants/{tid}/invites/{iid} {
  allow read, write: if sameTenant(tid) && isManager();
}
```

### **Storage Rules**

**File:** `storage.rules`

**Documents Upload:**
```javascript
match /docs/{tid}/{cid}/{docId}/{fileName} {
  // Path deve matchare claims
  allow read, write: if request.auth != null
    && request.auth.token.tenant_id == tid
    && (
      request.auth.token.role in ['Owner','Manager']
      || request.auth.token.company_id == cid
    );
}
```

**Esempio pratico:**
- ✅ Member T1/C1 può uploadare su: `/docs/T1/C1/doc123/file.pdf`
- ❌ Member T1/C1 NON può uploadare su: `/docs/T1/C2/doc456/file.pdf`
- ✅ Manager T1 può uploadare su: `/docs/T1/{any-cid}/...`

---

## 🔧 **Cloud Functions**

### **1. acceptInvite (Callable - Produzione)**

**File:** `functions/src/auth/acceptInvite.ts`

**Scopo:** Utente accetta invito e riceve custom claims.

**Flow:**
1. Utente autenticato chiama function con `{ tid, inviteId }`
2. Function valida invito (email match, non scaduto, non già accettato)
3. Setta custom claims: `tenant_id`, `role`, `company_id` (se presente)
4. Marca invito come `accepted: true`
5. Restituisce `{ ok: true, claims: {...} }`

**Chiamata Client:**
```typescript
import { httpsCallable } from 'firebase/functions';

const acceptInvite = httpsCallable(functions, 'acceptInvite');
const result = await acceptInvite({ tid: 'T1', inviteId: 'I1' });

// IMPORTANTE: Dopo acceptInvite, ricarica token per aggiornare claims
await auth.currentUser.getIdToken(true);
```

**Errori:**
- `UNAUTHENTICATED`: Utente non autenticato
- `INVALID_ARGUMENT`: Parametri mancanti
- `INVITE_NOT_FOUND`: Invito non esiste
- `INVITE_ALREADY_ACCEPTED`: Invito già utilizzato
- `EMAIL_MISMATCH`: Email utente ≠ email invito
- `INVITE_EXPIRED`: Invito scaduto

### **2. devSetClaims (HTTP - Solo Emulator)**

**File:** `functions/src/auth/devSetClaims.ts`

**⚠️ NON DEPLOYARE IN PRODUZIONE**

**Scopo:** Test rapido custom claims in emulator senza creare inviti.

**Chiamata:**
```powershell
# PowerShell
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=USER_UID&tenant_id=T1&role=Manager&company_id=C1"
```

**Parametri:**
- `uid`: UID utente (obbligatorio)
- `tenant_id`: Tenant ID (obbligatorio)
- `role`: Owner/Manager/Member (obbligatorio)
- `company_id`: Company ID (opzionale, solo per Member)

---

## 🚀 **Deploy**

### **Step 1: Deploy Rules**

```powershell
# Firestore
firebase deploy --only firestore:rules

# Storage
firebase deploy --only storage:rules
```

**Tempo:** ~30 secondi

### **Step 2: Deploy Functions**

**Produzione (solo acceptInvite):**
```powershell
cd functions
npm run build
cd ..
firebase deploy --only functions:acceptInvite
```

**Emulator (con devSetClaims):**
```powershell
# Decommentare export in functions/src/index.ts:
# export { devSetClaims } from "./auth/devSetClaims";

firebase deploy --only functions:acceptInvite,functions:devSetClaims
```

**Tempo:** ~2-3 minuti

---

## 🧪 **Test in Emulator**

### **Setup Emulator**

```powershell
# Terminal 1: Avvia emulator
firebase emulators:start
```

**Console URLs:**
- Auth UI: http://localhost:4000/auth
- Firestore UI: http://localhost:4000/firestore
- Functions: http://localhost:5001

---

### **Test 1: Crea Utenti con Custom Claims**

**Step 1.1: Crea utenti (Auth UI)**

1. Apri: http://localhost:4000/auth
2. Click **"Add user"** 3 volte:
   - User 1: `owner@test.com` → copia UID
   - User 2: `manager@test.com` → copia UID
   - User 3: `member@test.com` → copia UID

**Step 1.2: Setta claims (devSetClaims)**

```powershell
# Owner T1 (accesso completo tenant)
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=OWNER_UID&tenant_id=T1&role=Owner"

# Manager T1 (gestisce tutte le company di T1)
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=MANAGER_UID&tenant_id=T1&role=Manager"

# Member T1/C1 (accesso solo company C1)
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=MEMBER_UID&tenant_id=T1&role=Member&company_id=C1"
```

**Verifica claims (Firebase SDK):**
```typescript
import { getAuth } from 'firebase-admin/auth';

const user = await getAuth().getUser('MEMBER_UID');
console.log(user.customClaims);
// { tenant_id: 'T1', role: 'Member', company_id: 'C1' }
```

---

### **Test 2: Verifica Firestore Rules**

**Setup dati test (Firestore UI):**

1. Vai a: http://localhost:4000/firestore
2. Crea documenti:
   ```
   tenants/T1/companies/C1/documents/DOC1
   { status: "green", docType: "DURC" }
   
   tenants/T1/companies/C2/documents/DOC2
   { status: "yellow", docType: "VISURA" }
   
   tenants/T1/kb_chunks/CHUNK1
   { text: "Normativa DURC...", source: "kb/durc.pdf" }
   ```

**Test con Member T1/C1:**

| Path | Azione | Atteso | Motivo |
|------|--------|--------|--------|
| `tenants/T1/companies/C1/documents/DOC1` | READ | ✅ OK | sameTenant + sameCompany |
| `tenants/T1/companies/C1/documents/DOC1` | WRITE | ✅ OK | sameTenant + sameCompany |
| `tenants/T1/companies/C2/documents/DOC2` | READ | ❌ DENIED | sameCompany fallisce (C1 ≠ C2) |
| `tenants/T1/kb_chunks/CHUNK1` | READ | ✅ OK | sameTenant |
| `tenants/T1/kb_chunks/CHUNK1` | WRITE | ❌ DENIED | isManager fallisce |

**Test con Manager T1:**

| Path | Azione | Atteso | Motivo |
|------|--------|--------|--------|
| `tenants/T1/companies/C1/documents/DOC1` | READ | ✅ OK | sameTenant + isManager |
| `tenants/T1/companies/C2/documents/DOC2` | READ | ✅ OK | sameTenant + isManager |
| `tenants/T1/kb_chunks/CHUNK1` | WRITE | ✅ OK | sameTenant + isManager |
| `tenants/T2/companies/C1/documents/DOC3` | READ | ❌ DENIED | sameTenant fallisce (T1 ≠ T2) |

**Script test automatico:**
```typescript
// Test con Firebase SDK (client)
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

// 1. Login come Member T1/C1
await signInWithCustomToken(auth, MEMBER_TOKEN);

// 2. Try read C1 (OK)
const docC1 = await getDoc(doc(db, 'tenants/T1/companies/C1/documents/DOC1'));
console.assert(docC1.exists(), 'Member should read C1');

// 3. Try read C2 (DENIED)
try {
  await getDoc(doc(db, 'tenants/T1/companies/C2/documents/DOC2'));
  throw new Error('Should have denied');
} catch (e) {
  console.assert(e.code === 'permission-denied', 'Expected permission-denied');
}
```

---

### **Test 3: Storage Rules**

**Test upload con Member T1/C1:**

```typescript
import { getStorage, ref, uploadString } from 'firebase/storage';

// ✅ OK: path matcha claims (T1/C1)
const validRef = ref(storage, 'docs/T1/C1/doc123/file.pdf');
await uploadString(validRef, 'test content');

// ❌ DENIED: company_id non matcha (C1 ≠ C2)
const invalidRef = ref(storage, 'docs/T1/C2/doc456/file.pdf');
try {
  await uploadString(invalidRef, 'test content');
} catch (e) {
  console.assert(e.code === 'storage/unauthorized');
}
```

---

### **Test 4: Flusso Inviti Completo**

**Step 4.1: Manager crea invito (Firestore UI)**

```javascript
// tenants/T1/invites/INV1
{
  email: "newuser@test.com",
  role: "Member",
  company_id: "C1",
  expiresAt: Timestamp(2025-12-31),  // Firebase Timestamp
  accepted: false,
  createdBy: "MANAGER_UID",
  createdAt: Timestamp(now)
}
```

**Step 4.2: Nuovo utente autentica con email-link**

```typescript
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';

// 1. Invia link (nel client)
await sendSignInLinkToEmail(auth, 'newuser@test.com', {
  url: 'http://localhost:5000/login/complete',
  handleCodeInApp: true,
});

// 2. User riceve email e clicca link
// 3. Client completa login
if (isSignInWithEmailLink(auth, window.location.href)) {
  await signInWithEmailLink(auth, 'newuser@test.com', window.location.href);
}
```

**Step 4.3: User accetta invito**

```typescript
import { httpsCallable } from 'firebase/functions';

const acceptInvite = httpsCallable(functions, 'acceptInvite');
const result = await acceptInvite({ tid: 'T1', inviteId: 'INV1' });

console.log(result.data);
// { ok: true, claims: { tenant_id: 'T1', role: 'Member', company_id: 'C1' } }

// IMPORTANTE: Ricarica token
await auth.currentUser.getIdToken(true);
```

**Step 4.4: Verifica claims aggiornati**

```typescript
const token = await auth.currentUser.getIdTokenResult();
console.log(token.claims);
// { tenant_id: 'T1', role: 'Member', company_id: 'C1', ... }
```

**Step 4.5: Verifica invito marcato accepted (Firestore UI)**

```javascript
// tenants/T1/invites/INV1 (dopo acceptInvite)
{
  email: "newuser@test.com",
  role: "Member",
  company_id: "C1",
  expiresAt: Timestamp(...),
  accepted: true,          // ✅ Updated
  acceptedBy: "NEW_UID",   // ✅ Updated
  acceptedAt: Timestamp(now) // ✅ Updated
}
```

---

## 📊 **Exit Test Checklist**

### **✅ Firestore Rules**

- [ ] Member T1/C1 può leggere/scrivere `documents` di C1
- [ ] Member T1/C1 NON può leggere/scrivere `documents` di C2
- [ ] Manager T1 può leggere/scrivere `documents` di tutte le company in T1
- [ ] Member può leggere `kb_chunks`, ma NON scrivere
- [ ] Manager può scrivere `kb_chunks`
- [ ] Manager può creare/leggere `invites`

### **✅ Storage Rules**

- [ ] Member T1/C1 può uploadare su `/docs/T1/C1/...`
- [ ] Member T1/C1 NON può uploadare su `/docs/T1/C2/...`
- [ ] Manager T1 può uploadare su `/docs/T1/{any-cid}/...`

### **✅ Functions**

- [ ] `acceptInvite` restituisce errore `UNAUTHENTICATED` senza auth
- [ ] `acceptInvite` restituisce errore `INVITE_NOT_FOUND` per ID inesistente
- [ ] `acceptInvite` restituisce errore `EMAIL_MISMATCH` se email non matcha
- [ ] `acceptInvite` restituisce errore `INVITE_EXPIRED` se scaduto
- [ ] `acceptInvite` restituisce errore `INVITE_ALREADY_ACCEPTED` se già usato
- [ ] `acceptInvite` setta correttamente custom claims (verifica con `getIdTokenResult()`)
- [ ] Dopo `acceptInvite`, rules riflettono nuovi claims (test read/write)

---

## 🔍 **Troubleshooting**

### **Problema: Rules negano accesso anche con claims corretti**

**Diagnosi:**
```typescript
// Verifica claims nel token
const token = await auth.currentUser.getIdTokenResult();
console.log('Claims:', token.claims);
```

**Cause comuni:**
1. Token non ricaricato dopo `acceptInvite` → Chiama `getIdToken(true)`
2. Claims non settati → Verifica function logs
3. Typo nei nomi (es: `tenant_id` vs `tenantId`) → Case-sensitive!

**Fix:**
```typescript
// Dopo acceptInvite o devSetClaims
await auth.currentUser.getIdToken(true); // Force refresh
```

---

### **Problema: Storage upload negato con path corretto**

**Diagnosi:**
```typescript
console.log('Path:', 'docs/T1/C1/doc123/file.pdf');
console.log('Claims:', token.claims);
```

**Cause comuni:**
1. Claims mancano `company_id` per Member → Verifica invito
2. Path ha typo (es: `/docs//T1/C1/...` con doppio slash)
3. Storage rules non deployate → `firebase deploy --only storage:rules`

---

### **Problema: acceptInvite restituisce EMAIL_MISMATCH**

**Causa:** Email nel token JWT (lowercase) ≠ email in invito (case mismatch).

**Fix:** Normalizza sempre email in lowercase quando crei invito:
```typescript
const inviteData = {
  email: userEmail.toLowerCase(), // ← Normalizza
  role: 'Member',
  company_id: 'C1'
};
```

---

## 📚 **Riferimenti**

- [Custom Claims (Firebase)](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Storage Security Rules](https://firebase.google.com/docs/storage/security/start)
- [Callable Functions](https://firebase.google.com/docs/functions/callable)

---

## ✅ **Status**

| Componente | Status | File |
|------------|--------|------|
| Firestore Rules | ✅ Ready | `firestore.rules` |
| Storage Rules | ✅ Ready | `storage.rules` |
| acceptInvite | ✅ Ready | `functions/src/auth/acceptInvite.ts` |
| devSetClaims | ✅ Ready | `functions/src/auth/devSetClaims.ts` |
| Index export | ✅ Ready | `functions/src/index.ts` |
| Build | ✅ Success | `npm run build` |
| Docs | ✅ Complete | Questa guida |

**PUNTO 7 → COMPLETATO! ✅**

---

## 🔜 **Prossimi Step**

1. **Deploy Produzione:**
   ```powershell
   firebase deploy --only firestore:rules,storage:rules,functions:acceptInvite
   ```

2. **Setup Email-Link Auth:**
   - Console → Authentication → Sign-in method
   - Enable "Email link (passwordless)"
   - Add authorized domains

3. **Test in Produzione:**
   - Crea invito reale
   - User autentica con email-link
   - User chiama `acceptInvite`
   - Verifica rules con dati reali

4. **UI Integration:**
   - Pagina `/invites/[inviteId]` per accettare invito
   - Dashboard admin per gestire inviti
   - Mostra ruolo/company nell'header

🎯 **Ready for production deployment!**

