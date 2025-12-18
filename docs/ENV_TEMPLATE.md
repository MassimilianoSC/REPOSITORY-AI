# 🔧 Environment Variables Template

Questo file contiene tutte le variabili d'ambiente necessarie per Firebase Functions.

## 📝 Setup

1. Copia il contenuto qui sotto in `functions/.env.stg` (staging) o `functions/.env.prod` (produzione)
2. Compila i valori con le tue credenziali reali
3. **NON committare mai i file `.env` reali** (sono in `.gitignore`)

---

## 📋 Template `.env`

```bash
# =====================================
# VERTEX AI (LLM)
# =====================================
VERTEX_PROJECT_ID=repository-ai-477311
VERTEX_LOCATION=europe-west1
VALIDATION_MODEL=gemini-2.5-flash
USE_VERTEX=true

# =====================================
# DOCUMENT AI (OCR)
# =====================================
DOC_AI_PROCESSOR_ID=<YOUR_PROCESSOR_ID>
# Trova il processor ID su: https://console.cloud.google.com/ai/document-ai/processors
DOC_AI_LOCATION=eu
DOC_AI_PROJECT_ID=repository-ai-477311

# =====================================
# PDF GATING (Soglie per OCR)
# =====================================
GATING_TOTAL_CHARS_MIN=50
GATING_MIN_CHARS_PER_PAGE=30
GATING_LOG_SAMPLES=0
GATING_TEST_PARAMS=1
# Set GATING_TEST_PARAMS=1 per abilitare forceOcr/skipOcr via metadata

# =====================================
# VERSIONING
# =====================================
ENABLE_VERSIONING=true

# =====================================
# EMAIL & NOTIFICHE
# =====================================
MAIL_COLLECTION=mail
MAIL_FROM=noreply@repository-ai-477311.firebaseapp.com
MAIL_TO_OVERRIDE=m.scardovellicrac@gmail.com
# In staging, tutte le email vanno a MAIL_TO_OVERRIDE per test
ALERTS_ENABLED=false
# Set true per abilitare alert scadenze schedulati

# =====================================
# ALERT SCADENZE (giorni prima)
# =====================================
ALERT_BUCKETS_DAYS=30,15,7,1

# =====================================
# FIREBASE PROJECT
# =====================================
GCLOUD_PROJECT=repository-ai-477311
FIREBASE_CONFIG={"projectId":"repository-ai-477311","storageBucket":"repository-ai-477311.firebasestorage.app"}

# =====================================
# TEST & DEBUG
# =====================================
SKIP_OCR=0
# Set 1 per saltare OCR completamente (testing)
```

---

## 🔐 Secrets (via Secret Manager)

I seguenti secret sono gestiti tramite **Firebase Secret Manager** (NON nel file `.env`):

### **1. GEMINI_API_KEY**
Chiave API per Vertex AI / Gemini

**Settare il secret:**
```bash
echo "YOUR_API_KEY" | firebase functions:secrets:set GEMINI_API_KEY
```

**Accedere al secret (per debug):**
```bash
firebase functions:secrets:access GEMINI_API_KEY
```

### **2. DOC_AI_PROCESSOR_ID**
ID del processore Document AI (se gestito come secret)

```bash
firebase functions:secrets:set DOC_AI_PROCESSOR_ID
```

---

## 🚀 Deploy con Environment Variables

### **Deploy Staging**
```bash
firebase deploy --only functions --env-vars-file functions/.env.stg
```

### **Deploy Production**
```bash
firebase deploy --only functions --env-vars-file functions/.env.prod
```

---

## 📍 Dove Trovare i Valori

### **DOC_AI_PROCESSOR_ID**
1. Vai su https://console.cloud.google.com/ai/document-ai/processors
2. Seleziona il tuo processor
3. Copia l'ID dalla URL o dalla pagina dettagli

### **VERTEX_PROJECT_ID**
- Usa: `repository-ai-477311` (project ID Firebase)

### **GEMINI_API_KEY**
1. Vai su https://console.cloud.google.com/apis/credentials
2. Crea una **API Key** se non esiste
3. Limita la key solo a "Vertex AI API"

---

## ⚠️ Note di Sicurezza

### ✅ **Sicuro**
- File `.env` in `.gitignore` ✅
- Secrets in Secret Manager ✅
- API key con restrizioni IP/API ✅

### ❌ **NON Sicuro**
- ❌ Committare file `.env` in Git
- ❌ Hardcodare secret nel codice
- ❌ Usare API key senza restrizioni

---

## 🧪 Test Setup

Per verificare che le variabili siano caricate correttamente:

```bash
# Deploy health function
firebase deploy --only functions:health --env-vars-file functions/.env.stg

# Test
curl https://europe-west1-repository-ai-477311.cloudfunctions.net/health
# Output: "ok"
```

---

## 📚 Risorse

- [Firebase Environment Configuration](https://firebase.google.com/docs/functions/config-env)
- [Secret Manager](https://firebase.google.com/docs/functions/config-env#secret-manager)
- [Document AI Setup](https://cloud.google.com/document-ai/docs/setup)

---

**Ultimo aggiornamento**: 16 Novembre 2024

