# 🛡️ HQ Document AI - Guida per Sviluppatori

## Indice
1. [Panoramica del Progetto](#1-panoramica-del-progetto)
2. [🚀 Il Viaggio di un Documento: Come Funziona la Verifica Intelligente](#2-il-viaggio-di-un-documento-come-funziona-la-verifica-intelligente)
3. [Architettura Tecnica](#3-architettura-tecnica)
4. [Sistema di Autenticazione](#4-sistema-di-autenticazione)
5. [Sistema di Ruoli (RBAC)](#5-sistema-di-ruoli-rbac)
6. [Sistema di Inviti](#6-sistema-di-inviti)
7. [Struttura del Database](#7-struttura-del-database)
8. [Flusso di Elaborazione Documenti (Dettaglio Tecnico)](#8-flusso-di-elaborazione-documenti-dettaglio-tecnico)
9. [Pagine dell'Applicazione](#9-pagine-dellapplicazione)
10. [Sistema di Notifiche e Messaggi](#10-sistema-di-notifiche-e-messaggi)
11. [Comandi di Deploy](#11-comandi-di-deploy)
12. [Struttura delle Cartelle](#12-struttura-delle-cartelle)
13. [Hook Principali](#13-hook-principali)
14. [Regole di Sicurezza Firestore](#14-regole-di-sicurezza-firestore)
15. [Servizi Esterni e Estensioni](#15-servizi-esterni-e-estensioni)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Panoramica del Progetto

### Cos'è HQ Document AI?

HQ Document AI è un **sistema di gestione documentale multi-tenant** progettato per aziende che devono:
- Raccogliere documenti da fornitori/subappaltatori (DURC, Visura Camerale, ecc.)
- Verificare automaticamente la validità dei documenti tramite AI
- Monitorare le scadenze e ricevere notifiche proattive
- Gestire la compliance documentale in modo centralizzato
- Comunicare con le aziende fornitrici tramite chat integrata

### Caso d'uso principale

1. Un **Manager** (proprietario della piattaforma) invita le aziende fornitrici
2. Le **Aziende** (uploader) ricevono un'email e si registrano con Google o Email/Password
3. Le **Aziende** caricano i loro documenti
4. Il sistema **verifica automaticamente** i documenti con AI (OCR + Vertex AI)
5. I documenti vengono classificati con un **semaforo** (verde/giallo/rosso)
6. Manager e Verifier monitorano scadenze e problemi
7. Il sistema invia **notifiche email** per documenti in scadenza

### URL di Produzione

- **App**: https://repository-ai-477311.web.app
- **Console Firebase**: https://console.firebase.google.com/project/repository-ai-477311

---

## 2. 🚀 Il Viaggio di un Documento: Come Funziona la Verifica Intelligente

> **Questa sezione spiega, in termini semplici, cosa succede "dietro le quinte" quando un documento viene caricato nella piattaforma. È pensata per comprendere la complessità e il valore tecnologico del sistema.**

### Il Problema che Risolviamo

Immagina di dover verificare manualmente centinaia di documenti (DURC, Visure, Certificazioni) ogni mese:
- Aprire ogni PDF uno per uno
- Leggere il contenuto e cercare le informazioni chiave
- Verificare se il documento è scaduto
- Confrontare i dati con i requisiti normativi
- Decidere se il documento è valido o no

**Tempo stimato**: 5-10 minuti per documento. Con 100 documenti = **8-16 ore di lavoro manuale**.

**HQ Document AI automatizza completamente questo processo** grazie a un sistema di verifica a **doppio livello di controllo**.

---

### 📄 Fase 1: Ricezione e "Lettura" del Documento

Quando un utente carica un PDF, il sistema non lo salva semplicemente come file. Inizia un processo sofisticato di **comprensione del contenuto**.

#### 1.1 Riconoscimento del Testo (OCR)

Molti documenti sono **scansioni di fogli cartacei** o **immagini**. Un computer non può "leggere" un'immagine come farebbe un umano.

Il sistema utilizza una tecnologia chiamata **OCR (Optical Character Recognition)** - Riconoscimento Ottico dei Caratteri:

```
📄 Documento scansionato (immagine)
         ↓
    [Sistema OCR]
         ↓
📝 Testo leggibile dal computer

Esempio:
- Input: immagine di un DURC
- Output: "DURC - Documento Unico di Regolarità Contributiva
          Azienda: Rossi Costruzioni Srl
          Codice Fiscale: 12345678901
          Data rilascio: 15/11/2025
          Scadenza: 15/03/2026
          Esito: REGOLARE"
```

**Perché è importante**: Senza OCR, il sistema vedrebbe solo "pixel colorati". Con l'OCR, può leggere e comprendere il contenuto come farebbe un essere umano.

#### 1.2 Estrazione delle Informazioni Chiave

Una volta ottenuto il testo, il sistema identifica automaticamente:
- **Tipo di documento** (DURC, Visura, Certificazione, ecc.)
- **Date importanti** (emissione, scadenza)
- **Dati dell'azienda** (nome, codice fiscale)
- **Esito/Stato** del documento

---

### 🧠 Fase 2: Primo Controllo - Intelligenza Artificiale con Memoria Normativa

Qui entra in gioco il cuore tecnologico del sistema: un'**Intelligenza Artificiale** (Google Gemini) potenziata da una **memoria delle normative**.

#### 2.1 La "Memoria delle Normative" (Database Vettoriale)

Il sistema possiede un **archivio digitale** di tutte le regole e normative relative ai documenti che deve verificare:
- Requisiti legali per ogni tipo di documento
- Formati validi
- Informazioni obbligatorie
- Criteri di validità

Questa "memoria" non è un semplice elenco. È un **database vettoriale** che funziona per **significato semantico**:

```
Domanda: "Questo DURC è valido?"

Il sistema NON cerca la parola esatta "DURC valido".
Il sistema COMPRENDE il significato della domanda e trova:
- "Requisiti di regolarità contributiva"
- "Validità temporale del DURC: 120 giorni"
- "Elementi obbligatori: codice fiscale, data rilascio, esito"
```

**Perché è rivoluzionario**: Un database tradizionale trova solo corrispondenze esatte. Il database vettoriale **capisce il contesto** e trova informazioni correlate anche se scritte con parole diverse.

#### 2.2 L'Intelligenza Artificiale Analizza il Documento

Con il testo del documento e le normative pertinenti, l'**AI (Google Gemini)** esegue un'analisi approfondita:

```
┌─────────────────────────────────────────────────────────────┐
│                    INTELLIGENZA ARTIFICIALE                 │
│                                                             │
│  Input:                                                     │
│  ├── Testo del documento (dal OCR)                         │
│  └── Normative pertinenti (dal database vettoriale)        │
│                                                             │
│  Analisi:                                                   │
│  ├── "Il documento contiene tutti i campi obbligatori?"    │
│  ├── "Le date sono coerenti e il documento è in corso?"    │
│  ├── "I dati corrispondono a un documento autentico?"      │
│  └── "Ci sono anomalie o incongruenze?"                    │
│                                                             │
│  Output:                                                    │
│  ├── Validità: ✓ Idoneo / ✗ Non idoneo / ⚠ Da verificare  │
│  ├── Confidenza: 95%                                        │
│  └── Motivazione: "Documento valido, scade tra 45 giorni"  │
└─────────────────────────────────────────────────────────────┘
```

**Cosa rende questo speciale**:
- L'AI non segue regole rigide pre-programmate
- **Comprende il linguaggio naturale** dei documenti
- Può identificare **documenti fraudolenti o alterati**
- Fornisce una **spiegazione** del suo giudizio (non è una "scatola nera")

---

### ✅ Fase 3: Secondo Controllo - Regole di Business

Anche l'AI più avanzata può sbagliare. Per questo il sistema implementa un **secondo livello di controllo** basato su **regole deterministiche**.

#### 3.1 Perché un Doppio Controllo?

| Controllo AI | Controllo Regole |
|--------------|------------------|
| Flessibile e intelligente | Preciso e deterministico |
| Capisce il contesto | Applica regole esatte |
| Può interpretare | Non lascia margine di errore |
| ~95% accuratezza | 100% su criteri oggettivi |

Combinando i due approcci, otteniamo il **meglio di entrambi i mondi**.

#### 3.2 Esempi di Regole di Business

```
REGOLA 1: Scadenza
├── SE data_scadenza < oggi → ❌ SCADUTO
├── SE data_scadenza < oggi + 30 giorni → ⚠️ IN SCADENZA
└── ALTRIMENTI → ✅ VALIDO

REGOLA 2: Campi Obbligatori (DURC)
├── SE manca codice_fiscale → ❌ NON VALIDO
├── SE manca data_rilascio → ❌ NON VALIDO
└── SE tutti presenti → ✅ OK

REGOLA 3: Coerenza Date
├── SE data_rilascio > data_scadenza → ❌ ANOMALIA
└── SE data_rilascio > oggi → ⚠️ DATA FUTURA (sospetto)

REGOLA 4: Validità Temporale per Tipo
├── DURC: max 120 giorni dalla data rilascio
├── VISURA: max 6 mesi dalla data rilascio
└── DVR: nessuna scadenza automatica
```

#### 3.3 Il Verdetto Finale

I risultati dei due controlli vengono **combinati** per produrre il giudizio finale:

```
┌─────────────────────────────────────────────────┐
│              VERDETTO FINALE                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  Controllo AI:        ✅ Idoneo (95%)           │
│  Controllo Regole:    ✅ Tutti i check passati  │
│                                                 │
│  ══════════════════════════════════════════    │
│  RISULTATO:  🟢 DOCUMENTO VALIDO               │
│  ══════════════════════════════════════════    │
│                                                 │
│  Dettagli:                                      │
│  • Tipo: DURC                                   │
│  • Scadenza: 15/03/2026 (tra 98 giorni)        │
│  • Azienda: Rossi Costruzioni Srl              │
│  • Checks superati: 5/5                         │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### 🚦 L'Output: Il Sistema Semaforico

Il risultato viene presentato all'utente con un **sistema semaforico intuitivo**:

| Colore | Significato | Azione Richiesta |
|--------|-------------|------------------|
| 🟢 **Verde** | Documento valido e conforme | Nessuna - tutto OK |
| 🟡 **Giallo** | Attenzione: in scadenza o da verificare | Controllare e/o rinnovare |
| 🔴 **Rosso** | Problema: scaduto, non valido o rifiutato | Intervento immediato richiesto |

---

### ⏱️ Tutto Questo in Quanto Tempo?

L'intero processo - dal caricamento al verdetto finale - avviene in **10-30 secondi**.

| Fase | Tempo |
|------|-------|
| Upload e salvataggio | ~2 secondi |
| OCR (se necessario) | ~3-5 secondi |
| Ricerca normative pertinenti | ~2 secondi |
| Analisi AI | ~5-15 secondi |
| Applicazione regole | <1 secondo |
| Salvataggio risultato | ~1 secondo |
| **TOTALE** | **~15-25 secondi** |

**Confronto**: Un operatore umano impiegherebbe 5-10 minuti per lo stesso lavoro.

---

### 📊 Riepilogo: Perché Questo Sistema è Speciale

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   📄 DOCUMENTO                                                   │
│      │                                                           │
│      ▼                                                           │
│   ┌──────────────────┐                                          │
│   │  1. LETTURA      │  OCR: converte immagini in testo         │
│   └────────┬─────────┘                                          │
│            │                                                     │
│            ▼                                                     │
│   ┌──────────────────┐  ┌─────────────────────┐                 │
│   │  2. COMPRENSIONE │◀─│ DATABASE VETTORIALE │                 │
│   │     (AI/LLM)     │  │ (memoria normative) │                 │
│   └────────┬─────────┘  └─────────────────────┘                 │
│            │                                                     │
│            │  🧠 Primo controllo: Intelligenza Artificiale       │
│            │     • Comprende il contenuto                        │
│            │     • Confronta con le normative                    │
│            │     • Valuta autenticità e coerenza                 │
│            │                                                     │
│            ▼                                                     │
│   ┌──────────────────┐                                          │
│   │  3. VERIFICA     │                                          │
│   │  REGOLE BUSINESS │                                          │
│   └────────┬─────────┘                                          │
│            │                                                     │
│            │  ✅ Secondo controllo: Regole Deterministiche       │
│            │     • Controlla scadenze                            │
│            │     • Verifica campi obbligatori                    │
│            │     • Applica criteri oggettivi                     │
│            │                                                     │
│            ▼                                                     │
│   ┌──────────────────┐                                          │
│   │  🚦 VERDETTO     │  🟢 Valido | 🟡 Attenzione | 🔴 Problema  │
│   └──────────────────┘                                          │
│                                                                  │
│   ⏱️ Tempo totale: ~20 secondi (vs 5-10 minuti manuale)         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Vantaggi Chiave

| Caratteristica | Beneficio |
|----------------|-----------|
| **OCR Avanzato** | Legge qualsiasi documento, anche scansioni di bassa qualità |
| **Database Vettoriale** | Trova normative pertinenti per significato, non per parole chiave |
| **AI (Google Gemini)** | Comprende il contenuto come un esperto umano |
| **Doppio Controllo** | Elimina errori: AI + Regole = massima affidabilità |
| **Velocità** | 20 secondi vs 10 minuti: risparmio del 97% del tempo |
| **Tracciabilità** | Ogni decisione è motivata e documentata |
| **Scalabilità** | 10 o 10.000 documenti: stesso tempo per documento |

---

## 3. Architettura Tecnica

### Stack Tecnologico

| Componente | Tecnologia |
|------------|------------|
| Frontend | Next.js 13.5 (App Router) |
| Linguaggio | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Firebase Authentication (Google + Email/Password) |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| Functions | Cloud Functions (Node.js 20, 2nd Gen) |
| AI/ML | Google Vertex AI |
| Email | Firebase Extension "Trigger Email" + SMTP |
| Hosting | Firebase Hosting |
| Region | europe-west1 (Belgio) |

### Diagramma di Flusso Generale

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
                           │
                           ▼
                    ┌─────────────┐
                    │  Extension  │
                    │ Trigger Mail│
                    └─────────────┘
```

---

## 4. Sistema di Autenticazione

### Metodi di Autenticazione Supportati

| Metodo | Descrizione | Verifica Email |
|--------|-------------|----------------|
| **Google Sign-In** | OAuth con popup | Automatica ✓ |
| **Email + Password** | Registrazione tradizionale | Richiesta manualmente |

### Flusso di Login (`/login`)

```
1. Utente va su /login
2. Sceglie "Continua con Google" o inserisce Email/Password
3. Firebase Auth autentica l'utente
4. App legge le Custom Claims dal token
5. Utente viene reindirizzato alla Dashboard
```

### Funzionalità "Password Dimenticata"

```typescript
// Implementato in app/login/page.tsx
import { sendPasswordResetEmail } from 'firebase/auth';

// Invia email di reset
await sendPasswordResetEmail(auth, email);
```

L'utente riceve un'email da Firebase con un link per reimpostare la password.

### Pagina Accept Invite (`/accept-invite`)

Quando un utente clicca sul link nell'email di invito:

1. La pagina mostra i dettagli dell'invito (email, ruolo)
2. L'utente può registrarsi con:
   - **Google Sign-In** (consigliato - verifica email automatica)
   - **Email + Password** (richiede verifica email)
3. Dopo l'autenticazione, viene chiamata la Cloud Function `acceptInvite`
4. Le Custom Claims vengono impostate
5. L'utente viene reindirizzato alla Dashboard

---

## 5. Sistema di Ruoli (RBAC)

Il sistema usa **Firebase Custom Claims** per gestire i permessi.

### Ruoli Disponibili

| Ruolo | Descrizione | Permessi |
|-------|-------------|----------|
| **Manager** | Amministratore del tenant | Accesso completo, gestione utenti e aziende |
| **Verifier** | Verificatore documenti | Lettura tutti i documenti, nessuna gestione utenti |
| **Uploader** | Utente aziendale | Accesso solo alle proprie aziende assegnate |

### Custom Claims in Firebase

```typescript
// Struttura delle claims (salvate nel token JWT)
{
  tenant_id: "tenant-demo",                    // ID del tenant
  role: "manager" | "verifier" | "uploader",   // Ruolo utente
  company_ids: ["azienda-1", "azienda-2"]      // Solo per uploader
}
```

### Lettura Claims nel Frontend

```typescript
// hooks/useAuth.ts
const { tenantId, role, companyIds } = useAuth();

// Controlli di ruolo
const isManager = role === 'manager';
const isVerifier = role === 'verifier';
const isUploader = role === 'uploader';
const isManagerOrVerifier = role === 'manager' || role === 'verifier';
```

---

## 6. Sistema di Inviti

### Flusso Completo di Invito

```
Manager                    Sistema                    Invitato
   │                          │                          │
   │─── Crea invito ─────────▶│                          │
   │    (Firestore + Mail)    │                          │
   │                          │─── Email SMTP ──────────▶│
   │                          │    (Trigger Email Ext)   │
   │                          │                          │
   │                          │◀── Clicca link ─────────│
   │                          │    /accept-invite        │
   │                          │                          │
   │                          │◀── Google/Email Auth ───│
   │                          │                          │
   │                          │─── acceptInvite() ──────▶│
   │                          │    (Cloud Function)      │
   │                          │    - Verifica invito     │
   │                          │    - Imposta claims      │
   │                          │    - Revoca token        │
   │                          │                          │
   │                          │◀── Redirect dashboard ──│
```

### Invio Email con SMTP (Firebase Extension)

L'invio email utilizza la **Firebase Extension "Trigger Email from Firestore"**:

```typescript
// app/(app)/admin/inviti/page.tsx
await addDoc(collection(db, 'mail'), {
  to: [email],
  message: {
    subject: '🔐 Invito alla piattaforma HQ Document AI',
    html: `...template HTML...`,
    text: `...versione testo...`
  }
});
```

L'extension monitora la collezione `mail` e invia automaticamente via SMTP configurato (Google Workspace, SendGrid, etc.).

### Configurazione SMTP

| Parametro | Valore |
|-----------|--------|
| **SMTP URI** | `smtps://email:password@smtp.gmail.com:465` |
| **Collection** | `mail` |
| **FROM** | Email mittente verificata |

### Stati dell'Invito

| Stato | Descrizione |
|-------|-------------|
| `pending` | In attesa di accettazione |
| `accepted` | Accettato dall'utente |
| `cancelled` | Revocato dal manager |
| `expired` | Scaduto (7 giorni) |
| `error` | Errore nell'invio |

### Cloud Function `acceptInvite`

```typescript
// functions/src/auth/acceptInvite.ts
export const acceptInvite = onCall({ region: "europe-west1" }, async (req) => {
  // 1. Verifica autenticazione
  // 2. Verifica email_verified per utenti password
  // 3. Verifica invito esistente e pending
  // 4. Verifica email match
  // 5. Imposta Custom Claims
  // 6. Revoca refresh tokens
  // 7. Aggiorna stato invito a "accepted"
});
```

---

## 7. Struttura del Database

### Gerarchia Firestore

```
tenants/
  └── {tenantId}/                    # Es: "tenant-demo"
      ├── companies/
      │   └── {companyId}/           # Es: "acme-corp"
      │       ├── name: string
      │       ├── isActive: boolean
      │       ├── createdAt: timestamp
      │       │
      │       ├── documents/         # Documenti dell'azienda
      │       │   └── {docId}/
      │       │       ├── docType: string
      │       │       ├── status: string
      │       │       ├── expiresAt: timestamp
      │       │       ├── tenantId: string
      │       │       ├── companyId: string
      │       │       ├── isCurrent: boolean
      │       │       ├── isDeleted: boolean
      │       │       ├── pipelineStage: string
      │       │       ├── validation: object
      │       │       └── ...
      │       │
      │       └── messages/          # Chat HQ ↔ Azienda
      │           └── {msgId}/
      │               ├── text: string
      │               ├── senderUid: string
      │               ├── role: string
      │               └── createdAt: timestamp
      │
      ├── invites/
      │   └── {inviteId}/
      │       ├── email: string
      │       ├── role: string
      │       ├── company_ids: array
      │       ├── status: string
      │       ├── createdAt: timestamp
      │       ├── expiresAt: timestamp
      │       └── emailSentAt: timestamp
      │
      ├── notifications/
      │   └── {notifId}/
      │       ├── type: string
      │       ├── message: string
      │       ├── companyId: string
      │       └── createdAt: timestamp
      │
      └── kb_chunks/                 # Knowledge Base per RAG
          └── {chunkId}/
              ├── text: string
              ├── embedding: array
              └── metadata: object

mail/                               # Collezione per Trigger Email Extension
  └── {mailId}/
      ├── to: array
      ├── message: object
      └── delivery: object (auto-populated)
```

### Campi Importanti nei Documenti

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `tenantId` | string | ID del tenant (per query collectionGroup) |
| `companyId` | string | ID dell'azienda (per query collectionGroup) |
| `docType` | string | Tipo documento (DURC, VISURA_CAMERALE, ecc.) |
| `status` | string | Stato validazione (valid, invalid, expired) |
| `overall.status` | string | Stato complessivo dal backend |
| `isCurrent` | boolean | `true` = versione attuale del documento |
| `isDeleted` | boolean | `true` = documento eliminato (soft delete) |
| `expiresAt` | timestamp | Data di scadenza |
| `issuedAt` | timestamp | Data di emissione |
| `pipelineStage` | string | Fase del processing (gating, ocr, rag, vertex, done) |
| `confidence` | number | Confidenza della validazione AI (0-100) |
| `reason` | string | Motivo dello stato |

---

## 8. Flusso di Elaborazione Documenti (Dettaglio Tecnico)

### Pipeline di Processing

```
1. Upload file (Frontend)
   └── Salvataggio in Firebase Storage
       └── Trigger Cloud Function "processUpload"

2. Gating (validazione file)
   └── Verifica tipo file, dimensione, ecc.

3. Probe PDF (pdf.js)
   └── Estrazione metadati e testo base

4. OCR (se necessario)
   └── Riconoscimento testo da immagini/scan

5. RAG (Retrieval Augmented Generation)
   └── Ricerca regole pertinenti nel Knowledge Base

6. Vertex AI
   └── Validazione con LLM (Gemini)

7. Rules Engine
   └── Applicazione regole di business

8. Save
   └── Salvataggio risultato in Firestore
```

### Timeline Utente

Durante l'upload, l'utente vede una timeline con messaggi user-friendly:

| Step | Label | Dettaglio |
|------|-------|-----------|
| upload | 📄 Documento ricevuto | File ricevuto correttamente |
| probe | 🔍 Lettura del documento | Contenuto acquisito |
| ocr | 📝 Riconoscimento testo | Testo estratto / Già leggibile |
| rag | 📋 Ricerca requisiti | Trovate N regole da verificare |
| vertex | 🤖 Verifica con IA | Analisi completata |
| rules | ✅ Controlli di conformità | X su Y controlli superati |
| write | 💾 Salvataggio esito | ✓ Idoneo / ✗ Non idoneo |

### Stati del Semaforo

| Colore | Stati Backend | Significato |
|--------|---------------|-------------|
| 🟢 Verde | `valid`, `approved`, `compliant`, `idoneo`, `green` | Documento valido |
| 🟡 Giallo | `expiring`, `warning`, `pending`, `review`, `yellow` | In scadenza o da verificare |
| 🔴 Rosso | `invalid`, `expired`, `rejected`, `error`, `non_idoneo`, `red` | Non valido o scaduto |

---

## 9. Pagine dell'Applicazione

### Struttura Navigazione

| Pagina | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| Dashboard | `/dashboard` | Tutti | Vista generale documenti e statistiche |
| Carica Documento | `/upload` | Tutti | Upload nuovi documenti |
| Scadenze | `/scadenze` | Tutti | Monitoraggio scadenze + Da Verificare |
| Messaggi | `/messaggi` | Tutti | Chat HQ ↔ Aziende |
| Aziende | `/admin/aziende` | Manager | Gestione aziende |
| Inviti | `/admin/inviti` | Manager | Gestione inviti utenti |

### Pagina Scadenze (`/scadenze`)

La pagina Scadenze ha **3 tab**:

| Tab | Contenuto |
|-----|-----------|
| **Scadenze** | Documenti con data di scadenza (scaduti, in scadenza, validi) |
| **Da Verificare** | Documenti rossi (non idonei) e gialli (da rivedere) |
| **Calendario** | Vista calendario delle scadenze |

### Componenti di Protezione Ruolo

```typescript
// Solo manager possono accedere
<ManagerOnly>
  <AdminContent />
</ManagerOnly>

// Manager e verifier possono accedere
<VerifierOnly>
  <VerificationContent />
</VerifierOnly>
```

---

## 10. Sistema di Notifiche e Messaggi

### Chat Integrata (`/messaggi`)

Ogni azienda ha una chat dedicata con l'HQ:

```typescript
// Path Firestore
tenants/{tid}/companies/{cid}/messages/{msgId}

// Struttura messaggio
{
  text: "Contenuto del messaggio",
  senderUid: "uid-utente",
  role: "manager" | "uploader",
  createdAt: serverTimestamp()
}
```

### Badge Messaggi Non Letti

Il sistema traccia i messaggi non letti usando `localStorage`:

```typescript
// hooks/useMessages.ts
const CHAT_LAST_READ_KEY = 'chat_last_read_timestamps';

// Salva quando l'utente legge la chat
markChatAsRead(companyId, latestMessageTimestamp);

// Conta messaggi non letti
const unreadCount = useGlobalUnreadCount();
```

**Fix Clock Skew**: Per gestire la differenza di tempo tra client e server:

```typescript
// Se il timestamp del messaggio è nel futuro rispetto al client
if (latestMessageTimestamp >= Date.now()) {
  newValue = latestMessageTimestamp + 1; // Usa timestamp messaggio + 1ms
}
```

### Notifiche Email Scadenze

Cloud Function schedulata che invia email per documenti in scadenza:

```typescript
// functions/src/scheduler/sendExpiryAlerts.ts
// Esegue ogni giorno alle 8:00 CET
export const sendExpiryAlerts = onSchedule({...}, async () => {
  // Trova documenti in scadenza nei prossimi 30 giorni
  // Invia email ai manager
});
```

---

## 11. Comandi di Deploy

### Prerequisiti

```bash
# Installa Firebase CLI globalmente
npm install -g firebase-tools

# Login a Firebase
firebase login

# Verifica progetto collegato
firebase projects:list
```

### Deploy Frontend (Hosting)

```bash
# Build e deploy
npm run build && firebase deploy --only hosting

# Solo build
npm run build

# Solo deploy (se già buildato)
firebase deploy --only hosting
```

### Deploy Cloud Functions

```bash
# Vai nella cartella functions
cd functions

# Installa dipendenze e builda
npm install
npm run build

# Deploy tutte le functions
firebase deploy --only functions

# Deploy singola function
firebase deploy --only functions:acceptInvite
firebase deploy --only functions:processUpload
```

### Deploy Firestore Rules

```bash
# Deploy regole di sicurezza
firebase deploy --only firestore:rules

# Deploy indici
firebase deploy --only firestore:indexes

# Deploy entrambi
firebase deploy --only firestore
```

### Deploy Completo

```bash
# Tutto insieme
firebase deploy

# Con messaggio
firebase deploy -m "Release v1.2.3"
```

---

## 12. Struttura delle Cartelle

```
project/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Layout autenticato
│   │   ├── admin/
│   │   │   ├── aziende/          # Gestione aziende
│   │   │   └── inviti/           # Gestione inviti
│   │   ├── dashboard/
│   │   ├── messaggi/
│   │   ├── scadenze/
│   │   └── upload/
│   ├── accept-invite/            # Accettazione inviti
│   ├── login/                    # Login
│   └── layout.tsx
│
├── components/
│   ├── navigation.tsx            # Menu laterale
│   ├── upload-timeline.tsx       # Timeline processing
│   ├── ManagerOnly.tsx           # Protezione ruolo
│   └── ...
│
├── hooks/
│   ├── useAuth.ts                # Autenticazione e claims
│   ├── useFirestore.ts           # Query Firestore
│   └── useMessages.ts            # Chat e notifiche
│
├── lib/
│   ├── firebaseClient.ts         # Inizializzazione Firebase
│   ├── statusMapper.ts           # Mapping stati semaforo
│   └── utils.ts                  # Utility varie
│
├── functions/                    # Cloud Functions
│   └── src/
│       ├── auth/
│       │   └── acceptInvite.ts
│       ├── pipeline/
│       │   └── processUpload.ts
│       └── scheduler/
│           └── sendExpiryAlerts.ts
│
├── firestore.rules               # Regole sicurezza Firestore
├── firestore.indexes.json        # Indici Firestore
└── firebase.json                 # Configurazione Firebase
```

---

## 13. Hook Principali

### useAuth

```typescript
import { useAuth } from '@/hooks/useAuth';

const { 
  uid,           // ID utente Firebase
  tenantId,      // ID tenant dalle claims
  role,          // "manager" | "verifier" | "uploader"
  companyIds,    // Array di company_id (per uploader)
  email,         // Email utente
  loading,       // true durante caricamento
  error          // Eventuale errore
} = useAuth();
```

### useDocumentsCollectionGroup

Per Manager/Verifier - query su tutti i documenti del tenant:

```typescript
import { useDocumentsCollectionGroup } from '@/hooks/useFirestore';

const { documents, loading, error } = useDocumentsCollectionGroup(
  tenantId,
  companyId,     // Opzionale: filtra per azienda
  { limit: 200 }
);
```

### useMultiCompanyDocuments

Per Uploader - query su documenti delle proprie aziende:

```typescript
import { useMultiCompanyDocuments } from '@/hooks/useFirestore';

const { documents, loading, error } = useMultiCompanyDocuments(
  tenantId,
  companyIds,
  { limit: 200 }
);
```

### useGlobalUnreadCount

Conteggio messaggi non letti:

```typescript
import { useGlobalUnreadCount } from '@/hooks/useMessages';

const unreadCount = useGlobalUnreadCount();
// Ritorna il numero totale di messaggi non letti
```

### Pattern RBAC nei Componenti

```typescript
export default function DashboardPage() {
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  const isManager = role === 'manager' || role === 'verifier';
  
  // ⚠️ IMPORTANTE: Hook PRIMA di qualsiasi return condizionale
  const { documents: managerDocs } = useDocumentsCollectionGroup(
    isManager ? tenantId : '', ...
  );
  const { documents: uploaderDocs } = useMultiCompanyDocuments(
    !isManager ? tenantId : '', ...
  );
  
  // Seleziona documenti in base al ruolo
  const documents = isManager ? managerDocs : uploaderDocs;
  
  // Return condizionali DOPO tutti gli hook
  if (authLoading) return <Spinner />;
  
  return <div>...</div>;
}
```

---

## 14. Regole di Sicurezza Firestore

### File: `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    
    // === HELPER FUNCTIONS ===
    function isAuthed() { return request.auth != null; }
    
    function sameTenant(t) { 
      return isAuthed() && request.auth.token.tenant_id == t; 
    }
    
    function isManager() { 
      return isAuthed() && request.auth.token.role == 'manager'; 
    }
    
    function isManagerOrVerifier() {
      return isAuthed() && (request.auth.token.role == 'manager' 
                        || request.auth.token.role == 'verifier');
    }
    
    function inCompany(cid) { 
      return isAuthed() 
             && request.auth.token.company_ids is list 
             && (cid in request.auth.token.company_ids); 
    }
    
    // === DOCUMENTS ===
    match /tenants/{tid}/companies/{cid}/documents/{docId} {
      allow read: if sameTenant(tid) && (isManagerOrVerifier() || inCompany(cid));
      allow write: if false; // Solo backend
    }
    
    // === COMPANIES ===
    match /tenants/{tid}/companies/{cid} {
      allow read: if sameTenant(tid) && (isManagerOrVerifier() || inCompany(cid));
      allow create, update, delete: if sameTenant(tid) && isManager();
    }
    
    // === INVITES ===
    // Lettura pubblica per inviti pending (necessario per accept-invite)
    match /tenants/{tid}/invites/{iid} {
      allow read: if (sameTenant(tid) && isManager()) 
                  || resource.data.status == 'pending';
      allow create, update, delete: if sameTenant(tid) && isManager();
    }
    
    // === MESSAGES ===
    match /tenants/{tid}/companies/{cid}/messages/{msgId} {
      allow read: if sameTenant(tid) && (isManagerOrVerifier() || inCompany(cid));
      allow create: if sameTenant(tid) && (isManagerOrVerifier() || inCompany(cid));
      allow update, delete: if sameTenant(tid) && (isManager() 
                            || resource.data.senderUid == request.auth.uid);
    }
    
    // === MAIL (Trigger Email Extension) ===
    match /mail/{mid} {
      allow read: if false;
      allow create: if isAuthed() && isManager();
      allow update, delete: if false;
    }
  }
}
```

---

## 15. Servizi Esterni e Estensioni

### Firebase Extension: Trigger Email from Firestore

Invia email automaticamente quando viene scritto un documento nella collezione `mail`.

**Configurazione:**

| Parametro | Valore |
|-----------|--------|
| SMTP URI | `smtps://email:password@smtp.gmail.com:465` |
| Collection | `mail` |
| FROM | Email mittente |
| Region | Multi-region Europe (eur3) |

**Utilizzo:**

```typescript
await addDoc(collection(db, 'mail'), {
  to: ['destinatario@email.com'],
  message: {
    subject: 'Oggetto',
    html: '<h1>Contenuto HTML</h1>',
    text: 'Contenuto testo'
  }
});
```

### Google Workspace SMTP

Limiti:
- **2.000 email/giorno** per account Workspace
- Richiede **App Password** (con 2FA attivo)
- URL: `smtps://email:apppassword@smtp.gmail.com:465`

### Vertex AI (Gemini)

Utilizzato per la validazione intelligente dei documenti:
- Modello: Gemini Pro
- Region: europe-west1
- Funzione: Analisi semantica e validazione contenuto

---

## 16. Troubleshooting

### Errore: "Missing or insufficient permissions"

**Causa**: L'utente sta cercando di accedere a dati non autorizzati.

**Soluzioni**:
1. Verifica che le claims siano impostate correttamente
2. Controlla le Firestore Rules
3. Per uploader: assicurati che la query filtri solo per `company_ids`
4. Per inviti: verifica che lo status sia "pending"

### Errore: "React error #310" (Hooks)

**Causa**: Hook chiamato dopo un return condizionale.

**Soluzione**: Sposta tutti gli hook PRIMA di qualsiasi `if (...) return`.

```typescript
// ❌ SBAGLIATO
if (loading) return <Spinner />;
const data = useMemo(() => {...}, [deps]);

// ✅ CORRETTO
const data = useMemo(() => {...}, [deps]);
if (loading) return <Spinner />;
```

### Claims non aggiornate dopo invito

**Causa**: Il token non è stato refreshato.

**Soluzione**: 
```typescript
await user.getIdToken(true); // Forza refresh
window.location.assign('/dashboard/'); // Hard navigation
```

### Email invito non arriva

**Cause possibili**:
1. Extension "Trigger Email" non configurata
2. Credenziali SMTP errate
3. Email in spam
4. Limite giornaliero raggiunto (2000/giorno per Google Workspace)

**Verifica**:
1. Controlla la collezione `mail` in Firestore
2. Verifica il campo `delivery.state`
3. Controlla i log dell'extension in Firebase Console

### Messaggi non letti non scompaiono

**Causa**: Clock skew tra client e server.

**Fix implementato**: `markChatAsRead` usa `Math.max(Date.now(), latestMessageTimestamp + 1)`.

### Build fallisce con errori TypeScript

```bash
# Verifica errori
npm run build

# Problemi comuni:
# 1. Import mancanti
# 2. Tipi non definiti
# 3. Props non tipizzate
```

---

## Contatti e Risorse

- **Repository GitHub**: https://github.com/MassimilianoSC/REPOSITORY-AI
- **Firebase Console**: https://console.firebase.google.com/project/repository-ai-477311
- **Documentazione Next.js**: https://nextjs.org/docs
- **Documentazione Firebase**: https://firebase.google.com/docs
- **Extension Trigger Email**: https://extensions.dev/extensions/firebase/firestore-send-email

---

## Changelog Recenti

### Dicembre 2025

- ✅ **Migrazione autenticazione**: Da Magic Link a Google Sign-In + Email/Password
- ✅ **Sistema email SMTP**: Integrazione Firebase Extension "Trigger Email"
- ✅ **Consolidamento pagine**: "Verifica" integrata in "Scadenze" (tab "Da Verificare")
- ✅ **Password dimenticata**: Funzionalità aggiunta alla pagina login
- ✅ **Eliminazione inviti**: Possibilità di eliminare inviti revocati/scaduti
- ✅ **Timeline upload**: Messaggi più user-friendly durante l'elaborazione
- ✅ **Fix badge messaggi**: Gestione clock skew client/server
- ✅ **Fix UI**: Rimossi icone dai campi input (aziende, inviti)
- ✅ **Regole Firestore**: Aggiornate per inviti pending e collezione mail

---

*Ultimo aggiornamento: 7 Dicembre 2025*
