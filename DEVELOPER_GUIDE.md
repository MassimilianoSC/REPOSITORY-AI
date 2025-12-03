# 🛡️ SIKURO Document AI - Guida per Sviluppatori

## Indice
1. [Panoramica del Progetto](#1-panoramica-del-progetto)
2. [Architettura Tecnica](#2-architettura-tecnica)
3. [Sistema di Ruoli (RBAC)](#3-sistema-di-ruoli-rbac)
4. [Struttura del Database](#4-struttura-del-database)
5. [Flusso di Lavoro](#5-flusso-di-lavoro)
6. [Comandi di Deploy](#6-comandi-di-deploy)
7. [Struttura delle Cartelle](#7-struttura-delle-cartelle)
8. [Hook Principali](#8-hook-principali)
9. [Regole di Sicurezza Firestore](#9-regole-di-sicurezza-firestore)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Panoramica del Progetto

### Cos'è SIKURO Document AI?

SIKURO è un **sistema di gestione documentale multi-tenant** progettato per aziende che devono:
- Raccogliere documenti da fornitori/subappaltatori (DURC, Visura Camerale, ecc.)
- Verificare automaticamente la validità dei documenti tramite AI
- Monitorare le scadenze e ricevere notifiche
- Gestire la compliance documentale

### Caso d'uso principale

1. Un **Manager** (proprietario della piattaforma) invita le aziende fornitrici
2. Le **Aziende** (uploader) caricano i loro documenti
3. Il sistema **verifica automaticamente** i documenti con AI (OCR + Vertex AI)
4. I documenti vengono classificati con un **semaforo** (verde/giallo/rosso)
5. Manager e Verifier monitorano scadenze e problemi

### URL di Produzione

- **App**: https://repository-ai-477311.web.app
- **Console Firebase**: https://console.firebase.google.com/project/repository-ai-477311

---

## 2. Architettura Tecnica

### Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Frontend | Next.js 13.5 (App Router) |
| Linguaggio | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Functions | Cloud Functions (Node.js) |
| AI/ML | Google Vertex AI |
| Hosting | Firebase Hosting |

### Diagramma di Flusso

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Utente    │────▶│  Next.js    │────▶│  Firebase   │
│  (Browser)  │     │  Frontend   │     │   Auth      │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Firestore  │     │   Custom    │
                    │  Database   │     │   Claims    │
                    └─────────────┘     └─────────────┘
                           │
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Storage   │────▶│   Cloud     │────▶│  Vertex AI  │
│   (PDF)     │     │  Functions  │     │   (OCR)     │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 3. Sistema di Ruoli (RBAC)

Il sistema usa **Firebase Custom Claims** per gestire i permessi.

### Ruoli Disponibili

| Ruolo | Descrizione | Permessi |
|-------|-------------|----------|
| **Manager** | Amministratore del tenant | Accesso completo a tutte le aziende e documenti |
| **Verifier** | Verificatore documenti | Lettura di tutti i documenti, nessuna gestione utenti |
| **Uploader** | Utente aziendale | Accesso solo alle proprie aziende assegnate |

### Custom Claims in Firebase

```typescript
// Struttura delle claims
{
  tenant_id: "tenant-demo",      // ID del tenant
  role: "manager" | "verifier" | "uploader",
  company_ids: ["azienda-1", "azienda-2"]  // Solo per uploader
}
```

### Come vengono assegnate le Claims

1. **Manager** crea un invito dalla pagina `/admin/inviti`
2. L'invitato riceve un'email con un link
3. L'invitato clicca sul link e accetta l'invito
4. La Cloud Function `acceptInvite` imposta le custom claims
5. L'utente viene reindirizzato alla Dashboard

### Flusso di Invito

```
Manager                    Sistema                    Invitato
   │                          │                          │
   │─── Crea invito ─────────▶│                          │
   │                          │─── Invia email ─────────▶│
   │                          │                          │
   │                          │◀── Clicca link ─────────│
   │                          │                          │
   │                          │─── acceptInvite() ──────▶│
   │                          │    (imposta claims)      │
   │                          │                          │
   │                          │◀── Redirect dashboard ──│
```

---

## 4. Struttura del Database

### Gerarchia Firestore

```
tenants/
  └── {tenantId}/                    # Es: "tenant-demo"
      ├── companies/
      │   └── {companyId}/           # Es: "acme-corp"
      │       ├── name: string
      │       ├── isActive: boolean
      │       └── documents/
      │           └── {docId}/
      │               ├── docType: string
      │               ├── status: string
      │               ├── expiresAt: timestamp
      │               ├── tenantId: string
      │               ├── companyId: string
      │               ├── isCurrent: boolean
      │               ├── isDeleted: boolean
      │               └── ...
      │
      ├── invites/
      │   └── {inviteId}/
      │       ├── email: string
      │       ├── role: string
      │       ├── company_ids: array
      │       ├── status: "pending" | "accepted"
      │       └── createdAt: timestamp
      │
      └── notifications/
          └── {notifId}/
              ├── type: string
              ├── message: string
              └── createdAt: timestamp
```

### Campi Importanti nei Documenti

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `tenantId` | string | ID del tenant (per query collectionGroup) |
| `companyId` | string | ID dell'azienda (per query collectionGroup) |
| `docType` | string | Tipo documento (DURC, VISURA_CAMERALE, ecc.) |
| `status` | string | Stato backend (valid, invalid, expired, ecc.) |
| `isCurrent` | boolean | `true` = versione attuale del documento |
| `isDeleted` | boolean | `true` = documento eliminato (soft delete) |
| `expiresAt` | timestamp | Data di scadenza |
| `pipelineStage` | string | Fase del processing (gating, ocr, rag, ecc.) |

---

## 5. Flusso di Lavoro

### 5.1 Upload di un Documento

```
1. Utente seleziona azienda e tipo documento
2. Utente carica il PDF
3. File viene salvato in Firebase Storage
4. Cloud Function "onFileUpload" viene triggerata
5. Pipeline di processing:
   a. Gating (validazione file)
   b. Probe PDF (estrazione metadati)
   c. OCR (estrazione testo)
   d. RAG (analisi semantica)
   e. Vertex AI (validazione con LLM)
   f. Rules (applicazione regole business)
   g. Save (salvataggio risultato)
6. Documento appare in Dashboard con semaforo
```

### 5.2 Stati del Semaforo

| Colore | Stato Backend | Significato |
|--------|---------------|-------------|
| 🟢 Verde | `valid` | Documento valido e in regola |
| 🟡 Giallo | `expiring`, `warning` | Documento in scadenza o con avvisi |
| 🔴 Rosso | `invalid`, `expired`, `rejected` | Documento non valido o scaduto |

### 5.3 Mapping Stati (Frontend)

```typescript
// lib/statusMapper.ts
export function mapBackendToUI(backendStatus: string): 'green' | 'yellow' | 'red' {
  const greenStates = ['valid', 'approved', 'compliant'];
  const yellowStates = ['expiring', 'warning', 'pending', 'review'];
  const redStates = ['invalid', 'expired', 'rejected', 'error'];
  
  if (greenStates.includes(backendStatus)) return 'green';
  if (yellowStates.includes(backendStatus)) return 'yellow';
  return 'red';
}
```

---

## 6. Comandi di Deploy

### 6.1 Prerequisiti

```bash
# Installa Firebase CLI globalmente
npm install -g firebase-tools

# Login a Firebase
firebase login

# Verifica progetto collegato
firebase projects:list
```

### 6.2 Deploy Frontend (Hosting)

```bash
# Build dell'applicazione
npm run build

# Deploy su Firebase Hosting
firebase deploy --only hosting

# Oppure in un comando solo
npm run build && firebase deploy --only hosting
```

### 6.3 Deploy Cloud Functions

```bash
# Vai nella cartella functions
cd functions

# Installa dipendenze
npm install

# Build TypeScript
npm run build

# Deploy functions
firebase deploy --only functions

# Oppure deploy singola function
firebase deploy --only functions:acceptInvite
```

### 6.4 Deploy Firestore Rules e Indexes

```bash
# Deploy regole di sicurezza
firebase deploy --only firestore:rules

# Deploy indici
firebase deploy --only firestore:indexes

# Deploy entrambi
firebase deploy --only firestore
```

### 6.5 Deploy Completo

```bash
# Deploy di tutto
firebase deploy

# Deploy con messaggio
firebase deploy -m "Release v1.2.3"
```

### 6.6 Script Utili (package.json)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "deploy": "npm run build && firebase deploy --only hosting",
    "deploy:all": "npm run build && firebase deploy",
    "deploy:functions": "cd functions && npm run build && firebase deploy --only functions"
  }
}
```

---

## 7. Git e GitHub

### 7.1 Configurazione Repository

```bash
# Clona il repository
git clone https://github.com/MassimilianoSC/REPOSITORY-AI.git

# Vai nella cartella
cd REPOSITORY-AI
```

### 7.2 Branch Strategy

| Branch | Uso |
|--------|-----|
| `main` | Produzione stabile |
| `preview-test` | Branch di sviluppo/test |
| `feature/*` | Nuove funzionalità |
| `fix/*` | Bug fix |

### 7.3 Comandi Git Comuni

```bash
# Stato dei file
git status

# Aggiungi tutti i file
git add -A

# Commit con messaggio
git commit -m "feat: descrizione della modifica"

# Push sul branch corrente
git push origin preview-test

# Pull delle ultime modifiche
git pull origin preview-test

# Cambia branch
git checkout main

# Crea nuovo branch
git checkout -b feature/nuova-funzionalita
```

### 7.4 Convenzione Commit Messages

```
feat: nuova funzionalità
fix: correzione bug
docs: documentazione
style: formattazione (no logic change)
refactor: refactoring codice
test: aggiunta test
chore: manutenzione
```

### 7.5 Workflow Tipico

```bash
# 1. Assicurati di essere aggiornato
git pull origin preview-test

# 2. Fai le modifiche...

# 3. Testa in locale
npm run dev

# 4. Build per verificare errori
npm run build

# 5. Commit e push
git add -A
git commit -m "feat: descrizione"
git push origin preview-test

# 6. Deploy
firebase deploy --only hosting
```

---

## 8. Hook Principali

### 8.1 useAuth

Gestisce autenticazione e custom claims.

```typescript
// hooks/useAuth.ts
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { 
    uid,           // ID utente Firebase
    tenantId,      // ID tenant dalle claims
    role,          // "manager" | "verifier" | "uploader"
    companyIds,    // Array di company_id (per uploader)
    email,         // Email utente
    loading,       // true durante caricamento
    error          // Eventuale errore
  } = useAuth();

  if (loading) return <Spinner />;
  if (!tenantId) return <Redirect to="/login" />;
  
  return <div>Ciao {email}</div>;
}
```

### 8.2 useDocumentsCollectionGroup

Query su tutti i documenti del tenant (per Manager/Verifier).

```typescript
// hooks/useFirestore.ts
const { documents, loading, error } = useDocumentsCollectionGroup(
  tenantId,      // ID tenant
  companyId,     // Opzionale: filtra per azienda
  { limit: 200 } // Opzioni
);
```

### 8.3 useMultiCompanyDocuments

Query su documenti di specifiche aziende (per Uploader).

```typescript
const { documents, loading, error } = useMultiCompanyDocuments(
  tenantId,
  companyIds,    // Array di company_id
  { limit: 200 }
);
```

### 8.4 Pattern RBAC nei Componenti

```typescript
// ⚠️ IMPORTANTE: tutti gli hook DEVONO essere chiamati PRIMA di qualsiasi return

export default function DashboardPage() {
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  
  const isManager = role === 'manager' || role === 'verifier';
  
  // Hook per manager
  const { documents: managerDocs, loading: mgrLoading } = useDocumentsCollectionGroup(
    isManager && !authLoading ? tenantId : '',
    undefined,
    { limit: 200 }
  );
  
  // Hook per uploader
  const { documents: uploaderDocs, loading: uplLoading } = useMultiCompanyDocuments(
    !isManager && !authLoading ? tenantId : '',
    !isManager && !authLoading ? companyIds : [],
    { limit: 200 }
  );
  
  // Seleziona documenti in base al ruolo
  const documents = isManager ? managerDocs : uploaderDocs;
  const loading = authLoading || (isManager ? mgrLoading : uplLoading);
  
  // ✅ useMemo PRIMA dei return condizionali
  const stats = useMemo(() => ({
    total: documents.length,
    green: documents.filter(d => d.status === 'green').length,
  }), [documents]);
  
  // ✅ Return condizionali DOPO tutti gli hook
  if (loading) return <Spinner />;
  if (!tenantId) return <LoginRedirect />;
  
  return <div>...</div>;
}
```

---

## 9. Regole di Sicurezza Firestore

### File: `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthed() {
      return request.auth != null;
    }
    
    function sameTenant(tid) {
      return isAuthed() && request.auth.token.tenant_id == tid;
    }
    
    function isManager() {
      return isAuthed() && request.auth.token.role in ['Owner', 'Manager'];
    }
    
    function inCompany(cid) {
      return isAuthed() && 
             request.auth.token.company_ids is list &&
             (cid in request.auth.token.company_ids);
    }
    
    // Regole per companies
    match /tenants/{tid}/companies/{cid} {
      allow read: if sameTenant(tid);
      allow write: if sameTenant(tid) && isManager();
    }
    
    // Regole per documents
    match /tenants/{tid}/companies/{cid}/documents/{docId} {
      allow read, write: if sameTenant(tid) && (isManager() || inCompany(cid));
    }
    
    // Regole per invites
    match /tenants/{tid}/invites/{inviteId} {
      allow read, write: if sameTenant(tid) && isManager();
    }
  }
}
```

### Deploy delle regole

```bash
firebase deploy --only firestore:rules
```

---

## 10. Troubleshooting

### Errore: "Missing or insufficient permissions"

**Causa**: L'utente sta cercando di accedere a dati non autorizzati.

**Soluzioni**:
1. Verifica che le claims siano impostate correttamente
2. Controlla le Firestore Rules
3. Per uploader: assicurati che la query filtri solo per `company_ids`

### Errore: "React error #310"

**Causa**: Hook chiamato dopo un return condizionale.

**Soluzione**: Sposta tutti gli hook (incluso `useMemo`) PRIMA di qualsiasi `if (...) return`.

```typescript
// ❌ SBAGLIATO
if (loading) return <Spinner />;
const data = useMemo(() => {...}, [deps]);

// ✅ CORRETTO
const data = useMemo(() => {...}, [deps]);
if (loading) return <Spinner />;
```

### Errore: "The query requires an index"

**Causa**: Manca un indice composito in Firestore.

**Soluzione**: 
1. Clicca sul link nell'errore per creare l'indice
2. Oppure aggiungi manualmente in `firestore.indexes.json`

### Claims non aggiornate dopo invito

**Causa**: Il token non è stato refreshato.

**Soluzione**: L'utente deve fare logout e login, oppure:
```typescript
await getAuth().currentUser?.getIdToken(true);
window.location.reload();
```

### Build fallisce con errori TypeScript

```bash
# Verifica errori
npm run build

# Se ci sono errori di tipo, controlla:
# 1. Tutti gli import sono corretti
# 2. I tipi sono definiti in lib/types.ts
# 3. Le props dei componenti sono tipizzate
```

---

## Contatti e Risorse

- **Repository GitHub**: https://github.com/MassimilianoSC/REPOSITORY-AI
- **Firebase Console**: https://console.firebase.google.com/project/repository-ai-477311
- **Documentazione Next.js**: https://nextjs.org/docs
- **Documentazione Firebase**: https://firebase.google.com/docs

---

*Ultimo aggiornamento: Dicembre 2025*

