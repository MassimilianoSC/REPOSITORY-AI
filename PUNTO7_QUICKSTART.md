# 🚀 PUNTO 7 - Quick Start

Multi-Tenancy + Custom Claims + Security Rules

---

## ✅ **Implementazione Completata**

| Componente | Status | File |
|------------|--------|------|
| Firestore Rules | ✅ Ready | `firestore.rules` |
| Storage Rules | ✅ Ready | `storage.rules` |
| Function acceptInvite | ✅ Ready | `functions/src/auth/acceptInvite.ts` |
| Function devSetClaims | ✅ Ready | `functions/src/auth/devSetClaims.ts` |
| Build | ✅ Success | `npm run build` |
| Docs | ✅ Complete | `docs/MULTI_TENANCY_GUIDE.md` |

---

## 🚀 **Deploy Produzione (3 Comandi)**

```powershell
# Opzione 1: Script automatico
.\deploy-punto7.ps1

# Opzione 2: Manuale step-by-step
cd functions
npm run build
cd ..
firebase deploy --only firestore:rules,storage:rules,functions:acceptInvite
```

**Tempo:** ~3-4 minuti

---

## 🧪 **Test Emulator**

### **Setup (una volta)**

```powershell
# 1. Decommenta devSetClaims in functions/src/index.ts
# Cambia:
# // export { devSetClaims } from "./auth/devSetClaims";
# In:
# export { devSetClaims } from "./auth/devSetClaims";

# 2. Rebuild
cd functions
npm run build
cd ..

# 3. Avvia emulator
firebase emulators:start
```

### **Test Rapido**

```powershell
# Script interattivo guidato
.\test-punto7-emulator.ps1
```

**Cosa fa:**
1. Chiede UIDs di 3 utenti (crea in Auth UI: http://localhost:4000/auth)
2. Setta custom claims: Owner, Manager, Member
3. Guida creazione dati test in Firestore
4. Checklist verifica rules

---

## 📚 **Custom Claims Structure**

```typescript
// Owner (accesso completo tenant)
{
  tenant_id: "T1",
  role: "Owner"
}

// Manager (gestisce tutte le company)
{
  tenant_id: "T1",
  role: "Manager"
}

// Member (accesso solo propria company)
{
  tenant_id: "T1",
  role: "Member",
  company_id: "C1"
}
```

---

## 🔐 **Security Rules (Summary)**

### **Firestore**

| Collection | Member | Manager/Owner |
|------------|--------|---------------|
| `documents` (own company) | ✅ R/W | ✅ R/W |
| `documents` (other company) | ❌ | ✅ R/W |
| `kb_chunks` | ✅ Read | ✅ R/W |
| `notifications` | ✅ Read | ✅ R/W |
| `invites` | ❌ | ✅ R/W |

### **Storage**

| Path | Member T1/C1 | Manager T1 |
|------|--------------|------------|
| `/docs/T1/C1/...` | ✅ R/W | ✅ R/W |
| `/docs/T1/C2/...` | ❌ | ✅ R/W |

---

## 🔧 **Functions**

### **acceptInvite (Callable)**

**Client:**
```typescript
import { httpsCallable } from 'firebase/functions';

const acceptInvite = httpsCallable(functions, 'acceptInvite');
const result = await acceptInvite({ tid: 'T1', inviteId: 'INV1' });

// IMPORTANTE: Reload token
await auth.currentUser.getIdToken(true);
```

**Errori:**
- `UNAUTHENTICATED`: Non autenticato
- `INVITE_NOT_FOUND`: Invito inesistente
- `EMAIL_MISMATCH`: Email non corrisponde
- `INVITE_EXPIRED`: Invito scaduto
- `INVITE_ALREADY_ACCEPTED`: Già utilizzato

### **devSetClaims (HTTP - Solo Emulator)**

```powershell
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=USER_UID&tenant_id=T1&role=Manager&company_id=C1"
```

---

## 📊 **Flusso Inviti Completo**

```
1. Manager crea invito in Firestore:
   tenants/T1/invites/INV1
   { email: "user@test.com", role: "Member", company_id: "C1" }

2. User riceve email-link (o viene guidato a login)

3. User autentica con email-link

4. User chiama acceptInvite({ tid: "T1", inviteId: "INV1" })

5. Function:
   - Valida invito (email match, non scaduto, non già usato)
   - Setta custom claims: { tenant_id: "T1", role: "Member", company_id: "C1" }
   - Marca invito accepted: true

6. Client reload token: getIdToken(true)

7. Rules applicano nuovi permessi basati su claims
```

---

## ✅ **Exit Test Checklist**

### **Emulator**

- [ ] 3 utenti creati (Owner, Manager, Member)
- [ ] Claims settati con devSetClaims
- [ ] Member può leggere/scrivere documenti propria company
- [ ] Member NON può accedere documenti altra company
- [ ] Manager può accedere tutte le company del tenant
- [ ] Member può leggere KB, ma NON scrivere
- [ ] Manager può scrivere KB
- [ ] Storage upload negato se path non matcha claims

### **Inviti**

- [ ] Invito creato in Firestore
- [ ] User autentica con email-link
- [ ] acceptInvite restituisce `{ ok: true, claims: {...} }`
- [ ] Token ricaricato: claims visibili in `getIdTokenResult()`
- [ ] Invito marcato `accepted: true` in Firestore
- [ ] Rules applicano permessi corretti dopo accept

### **Produzione**

- [ ] Rules deployate: `firebase deploy --only firestore:rules,storage:rules`
- [ ] Function deployata: `firebase deploy --only functions:acceptInvite`
- [ ] Email-Link Auth abilitata in Console
- [ ] Domini autorizzati configurati (*.web.app, custom domain)
- [ ] Test invito reale con user production

---

## 🔍 **Troubleshooting Rapido**

### **Rules negano accesso**

```typescript
// Verifica claims
const token = await auth.currentUser.getIdTokenResult();
console.log('Claims:', token.claims);

// Reload token se modificato
await auth.currentUser.getIdToken(true);
```

### **EMAIL_MISMATCH error**

```typescript
// Normalizza sempre email in lowercase
const inviteData = {
  email: userEmail.toLowerCase(), // ← Fix
  role: 'Member',
  company_id: 'C1'
};
```

### **Storage upload denied**

```typescript
// Path DEVE matchare claims
const validPath = `docs/${token.claims.tenant_id}/${token.claims.company_id}/doc123/file.pdf`;
const ref = ref(storage, validPath);
```

---

## 📚 **Documentazione Completa**

**`docs/MULTI_TENANCY_GUIDE.md`** - Guida dettagliata con:
- Architettura completa
- Rules spiegate riga per riga
- Test step-by-step
- Troubleshooting approfondito
- Esempi codice client/server

---

## 🎯 **Status Finale**

✅ **PUNTO 7 COMPLETATO**

**Codice:**
- ✅ Firestore rules (multi-tenant + company scope)
- ✅ Storage rules (path matching claims)
- ✅ Function acceptInvite (produzione)
- ✅ Function devSetClaims (emulator)
- ✅ Build success

**Docs:**
- ✅ Guida completa (69 KB)
- ✅ Quick start (questo file)
- ✅ Script deploy automatico
- ✅ Script test emulator

**Deploy:**
- [ ] TODO: `.\deploy-punto7.ps1`

**Test:**
- [ ] TODO: `.\test-punto7-emulator.ps1`

---

## 🔜 **Prossimi Step**

1. **Deploy PUNTO 7:**
   ```powershell
   .\deploy-punto7.ps1
   ```

2. **Setup Email-Link (Console):**
   - https://console.firebase.google.com/project/repository-ai-477311/authentication/providers
   - Enable "Email link (passwordless)"
   - Add domains: `localhost`, `*.web.app`, custom domain

3. **Test Emulator:**
   ```powershell
   .\test-punto7-emulator.ps1
   ```

4. **Test Produzione:**
   - Crea invito reale
   - User completa flusso email-link + acceptInvite
   - Verifica rules con dati production

---

**PUNTO 7 pronto per il deploy!** 🚀

