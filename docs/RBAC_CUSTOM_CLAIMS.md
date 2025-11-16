# 🔐 RBAC con Custom Claims - Guida Completa

## 📋 Overview

Il sistema RBAC usa **Custom Claims di Firebase Auth** per gestire i permessi degli utenti.

**Ruoli disponibili**:
- `uploader`: Può caricare documenti
- `verifier`: Può verificare documenti + applicare "Non Pertinente"
- `manager`: Tutti i permessi (admin)

---

## 🎯 Setup Custom Claims

### **Opzione 1: Via Firebase Console (Produzione)**

1. Vai su Firebase Console → Authentication → Users
2. Seleziona utente
3. Nella sezione "Custom claims", aggiungi:

```json
{
  "role": "verifier",
  "tenant_id": "tenant-demo",
  "company_ids": ["acme", "beta"]
}
```

---

### **Opzione 2: Via Helper Function (Dev/Emulator)**

**File**: `functions/src/auth/devSetClaims.ts`

#### **A. Con Emulator (Locale)**

```bash
# 1. Avvia emulator
firebase emulators:start

# 2. Ottieni UID utente da Emulator UI (http://localhost:4000)
# 3. Chiama l'helper function
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=USER_UID&tenant_id=tenant-demo&role=verifier&company_id=acme"
```

#### **B. Con Firebase Deploy (Staging)**

```bash
# Deploy solo la function helper
firebase deploy --only functions:devSetClaims

# Chiama via URL
curl "https://europe-west1-repository-ai-477311.cloudfunctions.net/devSetClaims?uid=USER_UID&tenant_id=tenant-demo&role=manager"
```

**⚠️ IMPORTANTE**: La function `devSetClaims` **NON deve essere deployata in produzione** senza autenticazione!

---

### **Opzione 3: Via Admin SDK (Script)**

Crea file `scripts/set-claims.js`:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

async function setClaims(email, role, tenantId, companyIds) {
  const user = await admin.auth().getUserByEmail(email);
  
  await admin.auth().setCustomUserClaims(user.uid, {
    role,
    tenant_id: tenantId,
    company_ids: companyIds,
  });
  
  console.log(`✅ Claims set for ${email}: role=${role}`);
}

// Esempi
setClaims('ottavio@committente.it', 'manager', 'tenant-demo', ['acme', 'beta']);
setClaims('verificatore@committente.it', 'verifier', 'tenant-demo', ['acme']);
```

Esegui:
```bash
cd functions
node scripts/set-claims.js
```

---

## 🔍 Come Funziona il Sistema

### **Frontend** (`lib/rbac.ts`)

```typescript
import { auth } from '@/lib/firebaseClient';
import { canApplyNonPertinente } from '@/lib/rbac';

// In un componente React
const [canOverride, setCanOverride] = useState(false);

useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (user) {
      const hasPermission = await canApplyNonPertinente(user);
      setCanOverride(hasPermission);
    }
  });
  return () => unsubscribe();
}, []);
```

**Funzioni disponibili**:
- `getUserClaims(user)` - Ottiene tutti i custom claims
- `getUserRole(user)` - Ottiene solo il ruolo
- `canApplyNonPertinente(user)` - Check permesso override
- `canAccessVerifica(user)` - Check accesso coda verifica
- `canEditDocument(user)` - Check modifica documento

---

### **Backend** (`functions/src/overrideNonPertinente.ts`)

Il backend legge automaticamente i custom claims dal token JWT:

```typescript
const userRole = auth.token.role as string | undefined;

if (userRole !== "verifier" && userRole !== "manager") {
  throw new HttpsError("permission-denied", "Solo verificatori e manager");
}
```

**Campi disponibili nel token**:
- `auth.token.role` - Ruolo utente
- `auth.token.tenant_id` - ID tenant
- `auth.token.company_ids` - Array di company IDs
- `auth.token.email` - Email utente

---

## 🧪 Test RBAC

### **Test 1: Uploader (default)**

```bash
# Utente senza custom claims
# Risultato: canApplyNonPertinente = false
```

### **Test 2: Verifier**

```bash
# Utente con role: "verifier"
# Risultato: canApplyNonPertinente = true
```

### **Test 3: Manager**

```bash
# Utente con role: "manager"
# Risultato: canApplyNonPertinente = true
```

---

## 🔧 Debugging

### **Controllare i custom claims di un utente**

```javascript
// In browser console (dopo login)
import { auth } from './lib/firebaseClient';

auth.currentUser.getIdTokenResult().then(token => {
  console.log('Custom Claims:', token.claims);
});
```

### **Forzare refresh del token**

```javascript
// Se cambi i claims, l'utente deve fare refresh del token
await auth.currentUser.getIdToken(true); // force refresh
```

---

## 📝 Checklist Pre-Produzione

- [ ] Rimuovere/proteggere function `devSetClaims`
- [ ] Settare custom claims per tutti gli utenti reali
- [ ] Testare RBAC con utenti di test
- [ ] Verificare che utenti senza claims abbiano role `uploader`
- [ ] Documentare processo di assegnazione ruoli per nuovi utenti

---

## 🚨 Note di Sicurezza

### ✅ **Sicuro**
- Custom claims sono nel **token JWT** firmato da Firebase
- Backend verifica il token ad ogni chiamata
- Claims non possono essere modificati dal client

### ⚠️ **NON Sicuro**
- ❌ Non usare `devSetClaims` in produzione senza auth
- ❌ Non esporre endpoint che settano claims senza verifica
- ❌ Non fidarsi del frontend per decisioni di sicurezza

---

## 📚 Risorse

- [Firebase Custom Claims - Docs](https://firebase.google.com/docs/auth/admin/custom-claims)
- [RBAC Best Practices](https://firebase.google.com/docs/auth/admin/custom-claims#defining_roles_via_custom_claims)

---

**Ultimo aggiornamento**: 16 Novembre 2024
**Autore**: Pulizia RBAC - Rimozione Whitelist

