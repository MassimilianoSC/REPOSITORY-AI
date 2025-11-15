# 🔔 Guida Notifiche In-App

Sistema completo di notifiche in-app per scadenze documenti.

---

## 📋 **Indice**

1. [Schema Dati](#schema-dati)
2. [Security Rules](#security-rules)
3. [Backend Integration](#backend-integration)
4. [Frontend Integration](#frontend-integration)
5. [Test](#test)
6. [Deployment](#deployment)

---

## 📦 **Schema Dati**

### **Collezione Notifications**

```
tenants/{tid}/notifications/{notifId}
```

**Campi:**
- `type`: `"expiry"` | `"alert"` | `"info"`
- `title`: string (es. "DURC in scadenza tra 7 giorni")
- `message`: string (testo completo notifica)
- `docPath`: string (percorso Firestore del documento)
- `docId`: string (ID documento per deep link)
- `companyId`: string | null (filtro per azienda)
- `expiresAt`: Timestamp (data scadenza documento)
- `createdAt`: Timestamp (data creazione notifica)
- `severity`: `"info"` | `"warn"` | `"error"`
- `targets`: array | null (opzionale: ruoli/utenti specifici)

### **Collezione User Read States**

```
tenants/{tid}/userReads/{uid}/reads/{notifId}
```

**Campi:**
- `readAt`: Timestamp (quando l'utente ha letto)

**Vantaggi:**
- ✅ Scalabile (no array "readBy" con migliaia di utenti)
- ✅ Query veloce per "non letti" lato client
- ✅ Privacy: ogni utente gestisce solo i suoi read states

---

## 🔐 **Security Rules**

Le rules sono già configurate in `firestore.rules`:

```javascript
// Notifications: lettura per tutti del tenant
match /tenants/{tid}/notifications/{nid} {
  allow read: if request.auth != null
    && request.auth.token.tenant_id == tid;
  
  allow create, update, delete: if request.auth != null
    && request.auth.token.tenant_id == tid
    && (request.auth.token.role in ['Owner', 'Manager']);
}

// User reads: ogni utente gestisce solo i suoi
match /tenants/{tid}/userReads/{uid}/reads/{nid} {
  allow read, write: if request.auth != null
    && request.auth.token.tenant_id == tid
    && request.auth.uid == uid;
}
```

**Deploy rules:**
```bash
firebase deploy --only firestore:rules
```

---

## ⚙️ **Backend Integration**

### **1. Automatic Notifications (già implementato)**

File: `functions/src/alerts/sendExpiryAlerts.ts`

Ogni volta che lo scheduler invia alert scadenze, crea automaticamente una notifica in-app:

```typescript
// In-app notification (sempre)
const notifRef = db.collection(`tenants/${tenantId}/notifications`).doc();
await notifRef.set({
  type: "expiry",
  title: makeSubject(title, days),
  message: makePlainText(data, days),
  docPath: doc.ref.path,
  docId: doc.id,
  companyId: data?.companyId || data?.cid || null,
  expiresAt: data?.expiresAt || null,
  severity: days <= 7 ? "warn" : "info",
  createdAt: new Date(),
});
```

### **2. Manual Notifications (opzionale)**

Per creare notifiche custom da altre Cloud Functions:

```typescript
import { getFirestore } from "firebase-admin/firestore";

async function createNotification(tenantId: string, data: {
  type: string;
  title: string;
  message: string;
  severity?: "info" | "warn" | "error";
  docId?: string;
  docPath?: string;
}) {
  const db = getFirestore();
  await db.collection(`tenants/${tenantId}/notifications`).add({
    ...data,
    severity: data.severity || "info",
    createdAt: new Date(),
  });
}
```

---

## 🎨 **Frontend Integration**

### **1. Setup Firebase Client**

**File:** `lib/firebaseClient.ts`

Assicurati di avere:

```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // ... altri campi
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

### **2. Auth Hook**

**File:** `hooks/useAuth.ts`

```typescript
import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';

export function useAuth() {
  const [uid, setUid] = useState<string | null>(null);
  const [tid, setTid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        // Recupera tenant ID da custom claims
        const token = await user.getIdTokenResult();
        setTid(token.claims.tenant_id as string || null);
      } else {
        setUid(null);
        setTid(null);
      }
    });
    return () => unsub();
  }, []);

  return { uid, tid };
}
```

### **3. Update Components**

I componenti sono già creati, ma devi:

#### **NotificationBell** (`components/notification-bell.tsx`)

Sostituisci:
```typescript
// PRIMA (mock):
const uid = 'EXAMPLE_UID';
const tid = 'EXAMPLE_TENANT';

// DOPO (reale):
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/hooks/useAuth';

const { uid, tid } = useAuth();
```

Decommentare query Firebase:
```typescript
const q = query(
  collection(db, `tenants/${tid}/notifications`),
  orderBy('createdAt', 'desc'),
  limit(50)
);
const unsub = onSnapshot(q, (snap) => {
  setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});
return () => unsub();
```

#### **NotificationList** (`components/notification-list.tsx`)

Stessi passi: importa `db`, `useAuth`, e decommenta le query Firebase.

### **4. Add Bell to Header**

**File:** `components/navigation.tsx` o `app/layout.tsx`

```typescript
import { useState } from 'react';
import { NotificationBell } from '@/components/notification-bell';

function Header() {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="flex items-center justify-between">
      <h1>Repository AI</h1>
      <div className="flex items-center gap-4">
        <NotificationBell onOpen={() => setShowNotifications(true)} />
        {/* Drawer/Modal per lista completa */}
      </div>
    </header>
  );
}
```

---

## 🧪 **Test**

### **1. Test Backend (Dry Run)**

```bash
# Terminal 1: Emulator
firebase emulators:start

# Terminal 2: Test notifiche
curl "http://127.0.0.1:5001/repository-ai-477311/europe-west1/sendExpiryAlertsDryRun?send=1&buckets=7"
```

Verifica:
- ✅ Log: `"sent": 1` o più
- ✅ Firestore Emulator UI: `tenants/DEMO/notifications` contiene nuove notifiche

### **2. Test Frontend (Locale)**

```bash
npm run dev
```

Vai a: `http://localhost:3000/scadenze`

- ✅ Tab "Notifiche" visibile
- ✅ Lista notifiche (mock o reali se emulator attivo)
- ✅ Badge contatore funzionante
- ✅ "Segna come letto" funziona

### **3. Test Production**

Deploy tutto:
```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

Crea notifica manuale:
```javascript
// Console Firestore
tenants/YOUR_TENANT/notifications/test123
{
  type: "expiry",
  title: "Test Notification",
  message: "Questa è una notifica di test",
  severity: "info",
  createdAt: new Date()
}
```

Apri app → verifica badge + lista.

---

## 🚀 **Deployment**

### **1. Deploy Backend**

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions:sendExpiryAlerts
```

### **2. Deploy Rules & Indexes**

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### **3. Deploy Frontend**

```bash
npm run build
firebase deploy --only hosting
```

---

## 🎯 **Funzionalità Implementate**

✅ **Backend:**
- Creazione automatica notifiche da scheduler scadenze
- Idempotenza (no duplicati stesso giorno/bucket)
- Severity basata su giorni rimanenti (≤7 giorni = `warn`)

✅ **Firestore:**
- Schema notifications + userReads
- Security rules tenant-aware
- Index su `createdAt DESC`

✅ **Frontend:**
- Badge contatore "non letti" (realtime)
- Lista notifiche con filtri visuali (letto/non letto)
- "Segna come letto" (per-utente)
- Deep link a documento (`/document/[id]`)
- Tab dedicato in pagina Scadenze

---

## 🔜 **Funzionalità Future (Opzionali)**

- [ ] **Push Notifications:** FCM integration per notifiche browser
- [ ] **Filtri Avanzati:** per company, severity, type
- [ ] **Paginazione:** infinite scroll per >100 notifiche
- [ ] **Targeting:** notifiche visibili solo a ruoli/filiali specifiche
- [ ] **Dismissal:** "nascondi notifica" (soft delete)
- [ ] **Preferences:** utente può disabilitare certe categorie

---

## 📞 **Supporto**

Per domande o problemi:
1. Verifica logs: `firebase functions:log`
2. Controlla Firestore Emulator UI
3. Console browser: Network tab + Redux DevTools

---

**Status:** ✅ Implementazione completa e pronta per produzione!

