# 🚀 SETUP AUTOMATICO KNOWLEDGE BASE RAG

Questo script **automatizza completamente** il processo di popolamento della Knowledge Base per il sistema RAG.

---

## ✅ PREREQUISITI

1. **Node.js** installato (v18+)
2. **Firebase Admin SDK** configurato
3. **File normativi** nella cartella `documenti utili per l'individuazione dell'idoneità di un documento`
4. **Cloud Function** `kbIngestFromStorage` deployata

---

## 📋 COSA FA LO SCRIPT

```
1. 📁 Copia e rinomina i file con nomenclatura standard
2. 📤 Carica tutti i file in Firebase Storage (kb/tenant-demo/norme/)
3. 🧠 Esegue ingest automatico (vettorializzazione + chunking)
4. ✅ Verifica chunks creati in Firestore
```

---

## 🎯 ESECUZIONE RAPIDA

### **1. Posizionati nella directory del progetto**

```powershell
cd C:\Users\mcracchiolo\Desktop\SIKURO_MEGLIO\project
```

### **2. Installa dipendenze (se non già fatto)**

```powershell
cd scripts
npm install
```

### **3. Esegui lo script**

```powershell
node setup-kb-complete.js
```

---

## 📊 OUTPUT ATTESO

```
🚀 AVVIO SETUP KNOWLEDGE BASE RAG

═══════════════════════════════════════════════════════
STEP 1: Preparazione cartella temporanea
═══════════════════════════════════════════════════════
✅ Creata cartella temporanea: temp-kb-upload

═══════════════════════════════════════════════════════
STEP 2: Copia e rinominazione file
═══════════════════════════════════════════════════════
✅ Copiato: Accordo_Stato_Regioni_21-12-2011... → ASR_2011_formazione.pdf
✅ Copiato: Nuovo ASR n°59... → ASR_2025_n59_preposti.pdf
...

✅ File preparati: 10/10

═══════════════════════════════════════════════════════
STEP 3: Upload in Firebase Storage
═══════════════════════════════════════════════════════
📤 Caricato in Storage: kb/tenant-demo/norme/ASR_2011_formazione.pdf
📤 Caricato in Storage: kb/tenant-demo/norme/ASR_2025_n59_preposti.pdf
...

✅ File caricati: 10/10

═══════════════════════════════════════════════════════
STEP 4: Ingest documenti (vettorializzazione)
═══════════════════════════════════════════════════════
⚠️  NOTA: Questa fase può richiedere diversi minuti...

✅ Ingest completato: 127 chunks creati
✅ Ingest completato: 89 chunks creati
...

═══════════════════════════════════════════════════════
RIEPILOGO FINALE
═══════════════════════════════════════════════════════
✅ Ingest completati: 10
❌ Ingest falliti: 0

🔍 Verifica chunks nel database...
📊 Chunks totali trovati: 850+

🎉 SETUP COMPLETATO!

📋 PROSSIMI PASSI:
1. Verifica chunks in Firestore: kb_chunks collection
2. Testa il RAG: node scripts/test-rag-query.js
3. Carica un documento di test nell'app e verifica che il RAG recuperi chunks
```

---

## 🗂️ FILE CHE VERRANNO PROCESSATI

| File Originale | Nome Standardizzato | Categoria |
|---|---|---|
| `Accordo_Stato_Regioni_21-12-2011...pdf` | `ASR_2011_formazione.pdf` | formazione |
| `Nuovo ASR n°59 del 17042025...pdf` | `ASR_2025_n59_preposti.pdf` | formazione |
| `DM_16_01_97.pdf` | `DM_1997_01_16_antincendio.pdf` | antincendio |
| `Decreto-1-settembre-2021.pdf` | `DM_2021_09_01_controlli_antincendio.pdf` | antincendio |
| `classificazione-ateco-rischi.pdf` | `ATECO_classi_rischio.pdf` | classificazione |
| `06_Agg. Generale e Specifica_Borruto.pdf` | `POLICY_interna_Borruto.pdf` | policy |
| `nuovi_documenti/DECRETO LEGISLATIVO 9 aprile 2008...txt` | `DLGS_81_2008_testo_unico_sicurezza.txt` | sicurezza |
| `nuovi_documenti/Semplificazione in materia di documento unico...txt` | `DM_2015_01_30_DURC_online.txt` | durc |
| `nuovi_documenti/MINISTERO DELL'INTERNO_DECRETO 2 settembre 2021.txt` | `DM_2021_09_02_GSA_antincendio.txt` | antincendio |
| `nuovi_documenti/Criteri generali di progettazione...txt` | `DM_2021_09_03_minicodice_antincendio.txt` | antincendio |

**Totale: 10 documenti normativi** (6 PDF + 4 TXT)

---

## ⚠️ TROUBLESHOOTING

### **Errore: "File non trovato"**

Verifica che i file siano nella cartella corretta:
```
project/
├── documenti utili per l'individuazione dell'idoneità di un documento/
│   ├── Accordo_Stato_Regioni_21-12-2011...pdf
│   ├── Nuovo ASR n°59...pdf
│   ├── nuovi_documenti/
│   │   ├── DECRETO LEGISLATIVO 9 aprile 2008...txt
│   │   └── ...
```

### **Errore: "Cloud Function non trovata"**

Verifica che la Cloud Function `kbIngestFromStorage` sia deployata:
```powershell
cd functions
firebase deploy --only functions:kbIngestFromStorage
```

### **Errore: "Permission denied" in Storage**

Verifica le Firebase Storage Rules per la cartella `kb/`:
```javascript
match /kb/{tenantId}/{allPaths=**} {
  allow read, write: if request.auth != null;
}
```

---

## 🧪 TEST POST-SETUP

### **1. Verifica chunks in Firestore Console**

Apri [Firebase Console](https://console.firebase.google.com/) → Firestore → `kb_chunks`

Cerca documenti con:
- `tenantId` = `tenant-demo`
- `category` = `formazione`, `antincendio`, `durc`, etc.

### **2. Test RAG con query**

```powershell
node scripts/test-rag-query.js
```

Query di test:
- "Quante ore di formazione servono per i preposti?"
- "Qual è la validità del DURC?"
- "Quali sono gli obblighi per i controlli antincendio?"

### **3. Test end-to-end nell'app**

1. Accedi all'app come manager
2. Carica un documento DURC o attestato formazione
3. Controlla i log della Cloud Function `processUpload`
4. Verifica che il log mostri: `[RAG] Retrieved X/6 chunks` (con X > 0)

---

## 📚 DOCUMENTAZIONE AGGIUNTIVA

- **Architettura RAG**: `docs/RAG-ARCHITECTURE.md`
- **Ingest Pipeline**: `functions/src/rag/ingestion.ts`
- **Vector Search**: `functions/src/rag/retrieval.ts`

---

## 🆘 SUPPORTO

In caso di problemi:

1. **Controlla i log Cloud Functions**: [Firebase Console](https://console.firebase.google.com/) → Functions → Logs
2. **Verifica chunks creati**: Firestore → `kb_chunks` collection
3. **Test RAG manuale**: `node scripts/test-rag-query.js`

---

**✅ Setup completato con successo? Procedi con il test del RAG end-to-end!** 🚀

