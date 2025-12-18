# 📚 Guida Popolamento Knowledge Base RAG

## 🎯 Obiettivo
Popolare la Knowledge Base con documenti normativi per abilitare il RAG (Retrieval-Augmented Generation) durante la validazione documenti.

---

## 📋 PREREQUISITI

### ✅ Documenti normativi necessari:

Scarica/procurati questi PDF:

1. **DURC_DLGS50_2016.pdf** - D.Lgs. 50/2016 (estratti rilevanti su DURC, art. 80)
2. **ASR_2025_n59_preposti.pdf** - Accordo Stato-Regioni 2025 N.59 (preposti, 12 ore)
3. **ASR_2011_preposti.pdf** - Accordo Stato-Regioni 2011 (formazione preposti)
4. **DM_1997_01_16_antincendio.pdf** - DM 16/01/1997 (contenuti minimi formazione antincendio)
5. **DM_2021_09_01_antincendio.pdf** - DM 01/09/2021 (nuove norme antincendio)
6. **DLGS81_2008_sicurezza.pdf** - D.Lgs. 81/2008 (estratti su DVR, formazione, sicurezza)
7. **ATECO_classi_rischio.pdf** - Tabella classificazione ATECO e classi di rischio

**Dove trovarli:**
- Gazzetta Ufficiale: https://www.gazzettaufficiale.it
- INAIL: https://www.inail.it
- Committente (Ottavio) li ha forniti via email

**Formato consigliato:** PDF **nativi** (non scansioni). Se hai scansioni, attiva OCR in `.env` (`KB_OCR_ENABLED=true`).

---

## 🚀 PROCEDURA COMPLETA (30 minuti)

### **STEP 1: Upload PDF in Firebase Storage**

1. Vai su **Firebase Console → Storage**:
   👉 https://console.firebase.google.com/project/repository-ai-477311/storage

2. **Crea la struttura** (se non esiste):
   ```
   kb/
     tenant-demo/
       norme/
   ```

3. **Carica i PDF** uno per uno nella cartella `kb/tenant-demo/norme/`:
   - `DURC_DLGS50_2016.pdf`
   - `ASR_2025_n59_preposti.pdf`
   - `ASR_2011_preposti.pdf`
   - `DM_1997_01_16_antincendio.pdf`
   - `DM_2021_09_01_antincendio.pdf`
   - `DLGS81_2008_sicurezza.pdf`
   - `ATECO_classi_rischio.pdf`

---

### **STEP 2: Esegui script di ingestion**

**Dal terminale, nella root del progetto:**

```bash
node scripts/ingest-kb-docs.js
```

**Cosa fa lo script:**
- Chiama `kbIngestFromStorage` per ogni PDF
- Estrae il testo (con OCR se necessario)
- Divide in chunks (1000 token, overlap 150)
- Genera embeddings vettoriali (768 dimensioni)
- Salva in Firestore `kb_chunks`

**Output atteso:**
```
🚀 Starting KB ingestion...
📄 Processing: DURC_DLGS50_2016.pdf (DURC)
   ✅ Success: Ingested 45 chunks from kb/tenant-demo/norme/DURC_DLGS50_2016.pdf
📄 Processing: ASR_2025_n59_preposti.pdf (ATTESTATO_PREPOSTO)
   ✅ Success: Ingested 32 chunks from kb/tenant-demo/norme/ASR_2025_n59_preposti.pdf
...
📊 RIEPILOGO INGESTION:
✅ Successi: 7
❌ Falliti: 0
```

**Tempo stimato:** 5-10 minuti (dipende dalla dimensione dei PDF)

---

### **STEP 3: Verifica Firestore**

1. Vai su **Firestore Console**:
   👉 https://console.firebase.google.com/project/repository-ai-477311/firestore/data/~2Ftenants~2Ftenant-demo~2Fkb_chunks

2. **Dovresti vedere** decine/centinaia di documenti (chunk):
   - Ogni chunk ha: `text`, `source`, `page`, `embedding`, `tenantId`
   - `embedding` deve essere un vettore di **768 elementi**

3. **Se la collezione è vuota:**
   - Controlla i **log delle Functions** (Cloud Logging)
   - Cerca errori in `kbIngestFromStorage`
   - Verifica che i PDF siano caricati correttamente in Storage

---

### **STEP 4: Verifica Vector Index**

1. Vai su **Firestore → Indexes → Vector indexes**:
   👉 https://console.firebase.google.com/project/repository-ai-477311/firestore/indexes?create_composite=

2. **Deve esserci un indice per `kb_chunks`**:
   - Collection: `kb_chunks`
   - Field: `embedding`
   - Dimensions: **768**
   - Status: **Ready** (verde)

3. **Se l'indice non è Ready:**
   - Aspetta 1-2 minuti (indicizzazione in corso)
   - Se persiste "Building", controlla Cloud Logging per errori

---

### **STEP 5: Test RAG query**

**Dal terminale:**

```bash
node scripts/test-rag-query.js
```

**Cosa fa:**
- Esegue query di test per DURC, Preposti, Antincendio
- Verifica che il RAG recuperi chunks pertinenti
- Mostra top 3 risultati per ogni query

**Output atteso:**
```
🧪 Testing RAG queries...
🔍 Query: "Qual è la validità del DURC? Quanti giorni?"
   DocType: DURC
   ✅ Chunks trovati: 5
   📄 Top 3 risultati:
      1. D.Lgs. 50/2016 - DURC (pagina 12) - Score: 0.847
         "Il DURC ha validità di 120 giorni dalla data di emissione..."
      ...
   ✅ Keywords trovate: 120, giorni, D.Lgs, 50/2016

📊 RIEPILOGO TEST RAG:
✅ Query con risultati: 3
🎉 RAG FUNZIONA PERFETTAMENTE!
```

---

### **STEP 6: Test end-to-end con upload reale**

1. Vai su **https://repository-ai-477311.web.app/upload**
2. **Carica un DURC** reale
3. **Osserva la timeline** (dovrebbe completarsi in ~15 secondi)
4. **Verifica il dettaglio documento**:
   - Semaforo corretto (verde/rosso)
   - **Citazioni** (sezione "Riferimenti normativi") con fonte, pagina, estratto
   - **RAG hits > 0** nei log backend

5. **Apri Developer Tools → Console** e cerca:
   ```
   [RAG] Retrieved 5/6 chunks in 450ms (minScore=0.25)
   ```

---

## 🔧 TROUBLESHOOTING

### ❌ "Ingested 0 chunks"
**Causa:** PDF vuoto o testo non estratto
**Fix:**
1. Verifica che il PDF sia leggibile (aprilo manualmente)
2. Se è scansionato, attiva OCR: aggiungi `&forceOcr=1` all'URL di ingest
3. Controlla Cloud Logging per errori di parsing

### ❌ "0 chunks trovati" nel test RAG
**Causa:** KB vuota o Vector Index non Ready
**Fix:**
1. Verifica Firestore `kb_chunks` (deve avere documenti)
2. Verifica Vector Index = Ready
3. Prova a ridurre `minScore` a 0.20 nello script di test
4. Verifica che `docType` in ingest corrisponda a quello in query

### ❌ "embedding must be 768 dimensions"
**Causa:** Modello embedding sbagliato
**Fix:**
1. Verifica in `functions/src/rag/embed.ts`: `MODEL = "text-embedding-004"`
2. Rideploya le functions se hai cambiato il modello
3. Cancella `kb_chunks` e reingerisci i documenti

### ❌ RAG funziona ma chunks non pertinenti
**Causa:** Chunking/scoring non ottimali
**Fix:**
1. Aumenta `topK` a 8 in `processUpload`
2. Riduci `minScore` a 0.20
3. Migliora la qualità dei PDF sorgente (più dettagliati)

---

## 📊 METRICHE DI SUCCESSO

Dopo aver popolato la KB, verifica:

- [ ] **Firestore `kb_chunks`**: 100+ documenti (chunk)
- [ ] **Vector Index**: Status = Ready (verde)
- [ ] **Test RAG query**: Almeno 3/3 query con risultati
- [ ] **Upload DURC reale**: RAG hits > 0, citazioni presenti
- [ ] **Semafori corretti**: Verde per documenti validi, rosso per non validi
- [ ] **Performance**: Validazione completa < 20 secondi

---

## 🎯 PARAMETRI RAG CONSIGLIATI

**In `functions/src/index.ts` (`processUpload`):**
```typescript
const contextChunks = await retrieveKBChunks(tid, ragQuery, apiKey, {
  topK: 6,        // Aumenta a 8 per documenti lunghi
  minScore: 0.25, // Riduci a 0.20 se recupera poco
});
```

**In `functions/src/rag/ingest.ts`:**
```typescript
CHUNK_SIZE_TOKENS=1000    // OK per norme italiane
CHUNK_OVERLAP_TOKENS=150  // Buon compromesso
KB_OCR_ENABLED=true       // Se hai PDF scansionati
```

---

## 📚 RISORSE UTILI

- **Gazzetta Ufficiale**: https://www.gazzettaufficiale.it
- **INAIL Normativa**: https://www.inail.it/cs/internet/attivita/prevenzione-e-sicurezza.html
- **Firebase Console Storage**: https://console.firebase.google.com/project/repository-ai-477311/storage
- **Firestore Console**: https://console.firebase.google.com/project/repository-ai-477311/firestore
- **Cloud Logging**: https://console.firebase.google.com/project/repository-ai-477311/logs

---

## ✅ CHECKLIST FINALE

Prima di considerare la KB completa:

- [ ] 7 PDF caricati in Storage (`kb/tenant-demo/norme/`)
- [ ] Script `ingest-kb-docs.js` eseguito con successo (7/7)
- [ ] Firestore `kb_chunks` popolato (100+ documenti)
- [ ] Vector Index Ready
- [ ] Test RAG query passati (3/3)
- [ ] Upload DURC reale con RAG hits > 0
- [ ] Citazioni visibili nel dettaglio documento
- [ ] Performance < 20 secondi per validazione completa

---

**🎉 Una volta completati tutti gli step, il RAG sarà operativo e migliorerà notevolmente l'accuratezza delle validazioni!**

