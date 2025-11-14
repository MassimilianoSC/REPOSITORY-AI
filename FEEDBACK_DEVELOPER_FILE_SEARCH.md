# Report: Feedback su Proposta File Search + RAG a Monte

**Data:** 14 Novembre 2024  
**A:** Developer  
**Da:** Massimiliano  
**Re:** Implementazione File Search per RAG a Monte - Chiarimenti Operativi

---

## Executive Summary

Ho letto attentamente la tua proposta per integrare **Gemini File Search** e spostare il RAG "a monte" dell'LLM. Il piano **strategico è ottimo** (9/10), ma ho bisogno di chiarimenti su alcuni aspetti **operativi critici** prima di procedere.

**Nota Importante:** Se durante l'implementazione emergono dubbi o problemi con la nuova API File Search, **possiamo tranquillamente tornare indietro** e usare il RAG precedente (non lo abbiamo ancora modificato). Resta comunque il lavoro necessario per **spostare il RAG a monte** così da permettere all'LLM di avere il contesto necessario per identificare i documenti validi - questo è indipendente dalla scelta File Search vs. RAG Firestore.

---

## Priorità da Chiarire

### 🚨 PRIORITÀ 1: Compliance EU/GDPR (CRITICO - NO-GO se non risolto)

**Problema identificato:**

Hai scritto:
> "Gemini/File Search Developer API non espone EU-only garantito"

Questo è **potenzialmente bloccante** per produzione. Ottavio lavora con dati aziendali sensibili (documenti con CF, P.IVA, dati societari) e richiede compliance GDPR stretta.

**Domande obbligatorie:**

1. La **File Search store** con i PDF normativi (regole pubbliche) è sicuramente OK.

2. Ma la chiamata `generateContent` con il **testo estratto dal documento utente** (che contiene PII):
   - Viene processata in datacenter EU?
   - O può andare negli USA/altri paesi?

3. Se NON è EU-guaranteed:
   - Dobbiamo passare a **Vertex AI File Search** (che ha EU-guarantee)?
   - Questo cambia timeline/costi/complessità?
   - È fattibile nel nostro scenario?

4. Alternative:
   - Possiamo fare **redaction aggressiva** di PII prima di inviare a Gemini?
   - Serve **Data Processing Agreement** specifico con Google?

**Richiesta:** Conferma data residency **PRIMA** di procedere con l'implementazione. È decisione no-go per produzione se non risolto.

---

### 🚨 PRIORITÀ 2: Git Workflow (Manca Completamente)

**Problema identificato:**

Il tuo piano (Step 1-5) non menziona gestione Git. Per un progetto professionale questo è critico.

**Domande operative:**

1. **Branch strategy:**
   - Crei branch dedicato? (es. `feature/file-search-rag-upstream`)
   - Oppure lavori direttamente su `main`? (sconsigliato)

2. **Commit frequency:**
   - Commit dopo ogni step completato?
   - O push unico alla fine di tutto?
   - Quali convenzioni commit message usi?

3. **Push su GitHub:**
   - Quando fai push sul remote?
   - Chi fa code review prima del merge?

4. **Backup pre-modifica:**
   - Crei tag git dello stato attuale? (es. `git tag pre-file-search-v1.0`)
   - Fai backup file critici? (`processUpload`, `index.ts`)

**Richiesta:** Specificami il workflow Git completo, step-by-step.

---

### 🚨 PRIORITÀ 3: Gestione RAG Vecchio (Non Specificata)

**Problema identificato:**

Hai detto "meno codice da mantenere" ma non hai specificato **COSA facciamo concretamente** con il RAG esistente (Firestore-based).

**Componenti da gestire:**

**A) Functions vecchie:**
- `kbIngestFromStorage` (functions/src/rag/ingest.ts)
- `kbSearch` (functions/src/rag/query.ts)

**Opzioni:**
1. Le **elimini** subito dal codice?
2. Le **commenti** nell'export (functions/src/index.ts) ma mantieni file come paracadute?
3. Le **tieni deployate** ma non chiamate?

**B) Collezione Firestore `kb_chunks`:**

**Opzioni:**
1. La **elimini**?
2. La **archivi** rinominandola (es. `kb_chunks_OLD`)?
3. La **lasci** così (ignorata, occupa pochi KB)?

**C) Indici Firestore vettoriali:**
- Campo `embedding` con vector index

**Opzioni:**
1. Li **elimini** da `firestore.indexes.json`?
2. Li **lasci** deployati (non costano se non usati)?

**D) File sorgenti:**
- `functions/src/rag/*.ts` (chunk.ts, embed.ts, ingest.ts, ocr.ts, query.ts)

**Opzioni:**
1. Li **elimini**?
2. Li **rinomini** (es. `rag_deprecated/`)?
3. Li **lasci** così?

**Raccomandazione personale:**
- Commentare export functions in `index.ts` (paracadute per rollback rapido)
- Lasciare file `rag/*` nel repository (non deployati)
- Lasciare collezione `kb_chunks` (ignorata, costo storage trascurabile)
- Lasciare indici Firestore (non costano se non usati)
- **Cleanup completo dopo 30 giorni** se File Search risulta stabile

**Richiesta:** Conferma strategia preferita o proponi alternativa.

---

### ⚠️ PRIORITÀ 4: Feature Flag Implementation (Vaga)

**Problema identificato:**

Hai menzionato "mitigazione" con feature flag ma senza codice concreto.

**Domande tecniche:**

1. **Dove va la variabile?**
   - File `.env.stg` e `.env.prod`?
   - Nome variabile: `USE_FILE_SEARCH=true/false`?
   - Valore default?

2. **Come si implementa lo switch?**

Dammi pseudocodice concreto tipo:

```typescript
// functions/src/index.ts o functions/src/lib/validation.ts
const USE_FILE_SEARCH = process.env.USE_FILE_SEARCH === 'true';

async function validateDocument(fullText: string, docType: string) {
  if (USE_FILE_SEARCH) {
    // Nuovo: File Search
    return await validateWithFileSearch(fullText, docType);
  } else {
    // Fallback: RAG Firestore vecchio
    return await validateWithFirestoreRAG(fullText, docType);
  }
}
```

3. **Rollback rapido:**
   - Basta cambiare env var e re-deploy?
   - O serve altro?

**Richiesta:** Conferma implementazione e dove posizionare il codice.

---

### ⚠️ PRIORITÀ 5: Parsing Excel → Rulebook JSON

**Problema identificato:**

Hai detto "converto Excel in Rulebook v1" ma non hai specificato **COME** tecnicamente.

**Domande:**

1. **Approccio:**
   - **Manuale:** Export Excel → CSV → Scrivo JSON a mano (veloce per 5 documenti)
   - **Automatico:** Script Node.js con libreria `xlsx` (più robusto ma più tempo)

   Quale usi?

2. **Struttura JSON esatta:**

Dammi lo schema PRECISO del Rulebook v1. Esempio:

```json
{
  "version": "1.0",
  "lastUpdated": "2024-11-14T10:00:00Z",
  "documents": [
    {
      "docType": "DURC",
      "checksRequired": [
        {
          "id": "durc_validity",
          "description": "Validità massima 120 giorni",
          "normativeReference": "D.Lgs 81/2008"
        },
        {
          "id": "durc_issuer",
          "description": "Intestazione corretta",
          "normativeReference": ""
        }
      ],
      "deroghe": [],
      "notes": "Verificare regolarità contributiva"
    },
    {
      "docType": "Visura Camerale",
      "checksRequired": [...],
      "deroghe": [],
      "notes": ""
    }
  ]
}
```

È così? O struttura diversa? Specificami esattamente.

3. **Mappatura colonne Excel:**
   - Colonna 1 (Documento) → `docType`
   - Colonna 2 (Cosa controllare) → `checksRequired[].description`
   - Colonna 3 (Riferimento normativo) → `normativeReference`
   - Colonna 4 (Deroghe) → `deroghe[]`
   - Colonna 5 (Note) → `notes`

Confermi?

**Richiesta:** Approccio scelto + schema JSON finale.

---

### ⚠️ PRIORITÀ 6: Error Handling Strategy (Assente)

**Problema identificato:**

Nessuna menzione di gestione errori. Serve strategia chiara.

**Scenari critici:**

1. **File Search API fallisce/timeout:**
   - Fallback automatico a RAG Firestore?
   - Retry con backoff?
   - Errore hard (documento marcato `status: "error"`)?

2. **Gemini generateContent timeout:**
   - Retry automatico (quante volte)?
   - Exponential backoff?
   - Dopo N tentativi → fail?

3. **Structured Output JSON malformato:**
   - Come parsifichi?
   - Se parsing fallisce → log ERROR + `status: "error"`?
   - O retry con prompt diverso?

4. **Rulebook v1 non trovato nella File Search store:**
   - Errore critico (blocca tutto)?
   - Fallback a logica semplificata?
   - Notifica amministratore?

**Richiesta:** Strategia error handling per questi 4 casi + logging approach.

---

### ⚠️ PRIORITÀ 7: Redaction PII (Implementazione Vaga)

**Problema identificato:**

Hai scritto:
> "redaction di CF/P.IVA se non servono al controllo"

Ma non hai specificato **COME** implementarlo.

**Domande tecniche:**

1. **Chi fa la redaction:**
   - Regex lato server (prima di chiamare Gemini)?
   - Gemini built-in redaction feature?
   - Manuale?

2. **Pattern da redact:**

Se regex, dammi pattern esatti:

```typescript
// Codice Fiscale italiano
const CF_PATTERN = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/g;

// Partita IVA italiana
const PIVA_PATTERN = /\d{11}/g;

// Redaction
text = text.replace(CF_PATTERN, '[CF_REDACTED]');
text = text.replace(PIVA_PATTERN, '[PIVA_REDACTED]');
```

Confermi questi pattern? O approccio diverso?

3. **Quando serve CF/PIVA:**
   - Per alcuni controlli (es. Visura Camerale) il CF/PIVA **serve**
   - Per altri (es. Attestato Formazione) **NON serve**
   
   Come decidi quando redact e quando no?

**Richiesta:** Implementazione tecnica precisa + logica decisionale.

---

### ⚠️ PRIORITÀ 8: Exit Test - Dati Demo Disponibili?

**Problema identificato:**

Per eseguire exit test (Step 5) servono PDF demo specifici.

**PDF necessari:**

1. **DURC:**
   - 1 valido (emesso < 120 giorni fa)
   - 1 scaduto (emesso > 120 giorni fa)

2. **Attestato Formazione Preposto:**
   - 1 con 8 ore (regime transitorio)
   - 1 con 12 ore (nuovo regime)

3. **Registro Controlli Antincendio:**
   - 1 completo e aggiornato
   - 1 mancante o non conforme

4. **Altri documenti:**
   - Visura Camerale
   - POS
   - DVR

**Domande:**

1. Hai già questi PDF demo?
2. Li devo procurare io?
3. Possiamo usare PDF "fittizi" creati ad hoc per test?
4. Serve supporto per creazione dataset test?

**Richiesta:** Conferma disponibilità dati test o supporto necessario.

---

## Piano Proposto (Senza Timeline Rigide)

### Fase 0: Chiarimenti Pre-Implementazione

**Obiettivo:** Risolvere le 8 priorità sopra prima di toccare codice.

**Output atteso:**
- ✅ Compliance EU confermata (o piano Vertex AI)
- ✅ Git workflow definito
- ✅ Strategia cleanup RAG vecchio decisa
- ✅ Feature flag implementazione chiara
- ✅ Schema Rulebook JSON finale
- ✅ Error handling strategy definita
- ✅ Redaction PII implementata
- ✅ Dataset test disponibile

**Tempo stimato:** 1-2 ore di allineamento (call o email dettagliata)

---

### Fase 1: Preparazione Store File Search

**Step 1.1:** Parsing Excel → Rulebook JSON v1
- Approccio concordato (manuale o automatico)
- Schema JSON validato
- Output: `rulebook-v1.json`

**Step 1.2:** Setup File Search Store
- Creazione store `regole-validazione-v1`
- Upload PDF normativi (DM 1/9/2021, DM 16/1/1997, ASR)
- Upload Rulebook JSON
- Configurazione metadata

**Step 1.3:** Git preparation
- Branch: `feature/file-search-rag-upstream`
- Tag current state: `git tag pre-file-search-v1.0`
- Backup file critici

**Output atteso:**
- ✅ File Search store operativa
- ✅ Git branch pronto
- ✅ Backup sicurezza fatto

---

### Fase 2: Implementazione Feature Flag + Validation

**Step 2.1:** Feature flag setup
- Variabile `USE_FILE_SEARCH` in `.env.stg` e `.env.prod`
- Implementazione switch in codice
- Test locale switch on/off

**Step 2.2:** Implementazione `validateWithFileSearch()`
- Chiamata `generateContent` con tool `file_search`
- Structured Output schema
- Error handling implementato
- Redaction PII se necessaria

**Step 2.3:** Mantenimento fallback RAG vecchio
- Commentare export functions (non eliminare)
- Verificare fallback funzionante
- Logging per confronto risultati

**Output atteso:**
- ✅ Dual-path funzionante (File Search + fallback)
- ✅ Error handling robusto
- ✅ Rollback possibile in 5 minuti

---

### Fase 3: UI Aggiornamenti

**Step 3.1:** Vista Verificatore
- Pannello "Regole e Fonti" con citazioni
- Pulsante "Non pertinente (quindi idoneo)"
- Audit log override

**Step 3.2:** Vista Caricatore
- Feedback processing con nuovo sistema
- Anteprima motivazioni con citazioni

**Output atteso:**
- ✅ UI allineata a nuovo sistema validazione
- ✅ Citations visualizzate correttamente

---

### Fase 4: Exit Test & Validation

**Step 4.1:** Test funzionali
- Eseguire batteria 6+ test con PDF demo
- Verificare output Structured JSON
- Verificare citations corrette
- Verificare compliance EU (no data leak)

**Step 4.2:** Test performance
- Latenza query File Search
- Confronto accuracy vs RAG vecchio
- Test idempotenza

**Step 4.3:** Test edge cases
- Documenti ambigui
- PDF scansionati pessimi
- Timeout/retry

**Output atteso:**
- ✅ Report exit test completo
- ✅ Confronto File Search vs RAG vecchio
- ✅ GO/NO-GO decision

---

### Fase 5: Deploy Staging & Monitoring

**Step 5.1:** Deploy staging
- `USE_FILE_SEARCH=true` solo staging
- Deploy con feature flag
- Monitoring attivo

**Step 5.2:** Shadow testing (opzionale)
- Eseguire entrambi sistemi in parallelo
- Confrontare risultati su documenti reali
- Validare accuracy

**Step 5.3:** Decisione finale
- Se File Search OK → deploy production
- Se problemi → rollback a RAG vecchio + analisi issue

**Output atteso:**
- ✅ Sistema validato in staging
- ✅ Decisione GO production o NO-GO

---

## Ricapitolo: Cosa Mi Serve da Te Ora

**Prima di procedere con qualsiasi implementazione, ho bisogno che tu risponda alle 8 priorità:**

1. ✅ **Compliance EU:** Conferma data residency o piano Vertex AI
2. ✅ **Git workflow:** Workflow completo step-by-step
3. ✅ **Cleanup RAG vecchio:** Strategia scelta
4. ✅ **Feature flag:** Codice concreto + posizionamento
5. ✅ **Excel parsing:** Approccio + schema JSON esatto
6. ✅ **Error handling:** Strategia 4 casi critici
7. ✅ **Redaction PII:** Implementazione tecnica
8. ✅ **Dataset test:** Disponibilità PDF demo

**Formato risposta ideale:**

Puoi rispondere con un documento strutturato tipo:

```
PRIORITÀ 1 - Compliance EU:
Risposta: [...]

PRIORITÀ 2 - Git Workflow:
Risposta: [...]

[...]
```

Oppure, se preferisci, possiamo fare una call veloce (30 min) per allinearci su tutti i punti.

---

## Note Finali

**Approccio Low-Risk:**

Ricorda che se durante l'implementazione emergono problemi con File Search API, **possiamo tornare indietro senza perdere lavoro**. Il RAG Firestore è ancora lì, funzionante. L'unico lavoro "irrecuperabile" è lo spostamento del RAG "a monte" - ma questo è necessario **comunque**, indipendentemente da File Search vs Firestore.

**Flessibilità Timeline:**

Non ho messo scadenze rigide ("oggi step 1, domani step 2") perché voglio mantenere flessibilità. A seconda delle tue risposte alle 8 priorità, potremmo fare tutto in una sessione concentrata o spalmare su più giorni. Deciderò io la timeline in base a priorità e disponibilità.

**Qualità > Velocità:**

Preferisco impiegare 1 ora in più per chiarire questi aspetti operativi piuttosto che rifare 5 ore di lavoro dopo per fix/rework. Il tuo piano strategico è ottimo, voglio solo assicurarmi che l'esecuzione sia altrettanto solida.

---

**Aspetto tue risposte alle 8 priorità per procedere.**

Grazie,  
Massimiliano

