# HQ Document AI - Developer Report

## 🎯 Cos'è

Sistema di gestione documentale multi-tenant per la raccolta e verifica automatica di documenti aziendali (DURC, Visure, Certificazioni).

**URL Prod**: https://repository-ai-477311.web.app

---

## 🛠️ Stack

| Componente | Tecnologia |
|------------|------------|
| Frontend | Next.js 13.5 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Auth | Firebase Authentication (Google) |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Functions | Cloud Functions (Node.js) |
| AI | Google Vertex AI (OCR + validazione) |
| Hosting | Firebase Hosting |

---

## 📁 Struttura Progetto

```
project/
├── app/                    # Next.js App Router
│   ├── (app)/              # Route protette
│   │   ├── dashboard/      # Panoramica documenti
│   │   ├── scadenze/       # Documenti in scadenza
│   │   ├── verifica/       # Coda revisione manuale
│   │   ├── upload/         # Upload documenti
│   │   ├── messaggi/       # Chat HQ ↔ Aziende
│   │   └── admin/          # Gestione inviti/aziende
│   └── login/              # Autenticazione
├── components/             # Componenti React
├── hooks/                  # Custom hooks (useAuth, useMessages, ecc.)
├── lib/                    # Utilities e tipi
├── functions/              # Cloud Functions
├── firestore.rules         # Regole di sicurezza
└── firebase.json           # Config Firebase
```

---

## 👥 Ruoli (RBAC via Custom Claims)

| Ruolo | Permessi |
|-------|----------|
| **Manager** | Accesso completo, gestisce utenti e aziende |
| **Verifier** | Vede tutti i documenti, non gestisce utenti |
| **Uploader** | Vede solo documenti delle proprie aziende |

---

## 🗄️ Database Firestore

```
tenants/{tenantId}/
├── companies/{companyId}/
│   ├── documents/{docId}    # Documenti caricati
│   └── messages/{msgId}     # Chat
└── invites/{inviteId}       # Inviti pendenti
```

---

## 🚀 Deploy Firebase

### Prerequisiti (una tantum)
```bash
npm install -g firebase-tools
firebase login
```

### Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

### Deploy Functions
```bash
cd functions
npm install && npm run build
firebase deploy --only functions
cd ..
```

### Deploy Regole Firestore
```bash
firebase deploy --only firestore:rules
```

### Deploy Completo
```bash
npm run build && firebase deploy
```

---

## 📤 Push GitHub

### Repository
```
https://github.com/MassimilianoSC/REPOSITORY-AI
```

### Comandi
```bash
git add -A
git commit -m "feat: descrizione"
git push origin preview-test
```

### Branch
- `main` → Produzione
- `preview-test` → Sviluppo

---

## ⚡ Workflow Rapido

```bash
# Sviluppo locale
npm run dev

# Build + Deploy + Push
npm run build && firebase deploy --only hosting && git add -A && git commit -m "update" && git push origin preview-test
```

---

## 🔑 File Chiave da Conoscere

| File | Descrizione |
|------|-------------|
| `hooks/useAuth.ts` | Gestione auth e claims |
| `hooks/useFirestore.ts` | Query documenti |
| `hooks/useMessages.ts` | Chat real-time |
| `lib/types.ts` | Tipi TypeScript |
| `lib/statusMapper.ts` | Mapping stati semaforo |
| `components/navigation.tsx` | Sidebar navigazione |
| `firestore.rules` | Regole sicurezza DB |

---

*Dicembre 2025*

