# 🔧 Fix Notifiche Emulator - PERMISSION_DENIED

## Problema
Le Firestore Rules bloccano accesso a `notifications` perché richiedono custom claims.

## Soluzione Rapida (5 minuti)

### Step 1: Autentica Utente nell'Emulator

1. **Apri Auth UI:**
   ```
   http://localhost:4000/auth
   ```

2. **Crea utente di test:**
   - Click "Add user"
   - Email: `test@example.com`
   - Auto-generate User ID
   - Click "Save"
   - **Copia UID** (es: `abc123xyz...`)

### Step 2: Setta Custom Claims

**Decommentare devSetClaims:**

File: `functions/src/index.ts`
Riga 23:
```typescript
// PRIMA (commentato):
// export { devSetClaims } from "./auth/devSetClaims";

// DOPO (decommentato):
export { devSetClaims } from "./auth/devSetClaims";
```

**Rebuild functions:**
```powershell
cd functions
npm run build
cd ..
```

**Restart emulator:**
```powershell
Ctrl+C  # nel terminal emulator
firebase emulators:start
```

**Setta claims (nuovo terminal):**
```powershell
curl "http://localhost:5001/repository-ai-477311/europe-west1/devSetClaims?uid=<TUO_UID>&tenant_id=T1&role=Manager"
```

Sostituisci `<TUO_UID>` con l'UID copiato al Step 1.

### Step 3: Login nell'App

1. **Apri app:**
   ```
   http://localhost:5000/login
   ```

2. **Login con email test:**
   - Inserisci: `test@example.com`
   - (In emulator non serve verificare email)

3. **Vai su Scadenze:**
   ```
   http://localhost:5000/scadenze
   ```

4. **Ora dovresti vedere i 2 tab!**

### Step 4: Crea Notifica Test

1. **Firestore UI:**
   ```
   http://localhost:4000/firestore
   ```

2. **Crea collection:**
   ```
   tenants/T1/notifications/NOTIF1
   ```

3. **Campi:**
   ```javascript
   {
     type: "expiry",
     title: "Test Notifica",
     message: "Questa è una notifica di test",
     severity: "info",
     createdAt: <Timestamp: now>,
     docId: "DOC1"
   }
   ```

4. **Refresh app → Tab "Notifiche" → Dovresti vedere la notifica!**

---

## Soluzione Alternativa (Solo per Test UI)

Se vuoi solo vedere l'UI senza setup auth completo:

### Modifica Temporanea Rules (SOLO EMULATOR)

**File:** `firestore.rules`

Cambia linea 26:
```javascript
// PRIMA:
allow read: if sameTenant(tid);

// DOPO (temporaneo):
allow read: if true;  // ⚠️ SOLO per test UI!
```

**Restart emulator** per caricare nuove rules.

**⚠️ IMPORTANTE:** Riverta a `sameTenant(tid)` prima del deploy produzione!

---

## Riepilogo

**Soluzione 1 (Raccomandato):**
- ✅ Testa anche l'auth flow completo
- ✅ Verifica che rules funzionino
- ⏱️ Tempo: 5 minuti

**Soluzione 2 (Quick UI Test):**
- ⚠️ Solo per vedere UI
- ⚠️ Non testa security
- ⏱️ Tempo: 1 minuto

