# ✅ Implementazione Dashboard Azienda + ATECO Mapping

**Data**: 17 Novembre 2024
**Implementato da**: AI Assistant
**Proposte da**: Developer esterno

---

## 📋 File Creati (5 nuovi)

### **Backend (2 file)**
1. ✅ `functions/src/rulebook/ateco_risk_map.json`
   - Mappa ATECO → classe rischio (basso/medio/alto)
   - Supporta match su prefissi (47.11.10 → 47.11 → basso)
   - Estendibile con nuovi codici ATECO

2. ✅ `functions/src/lib/ateco.ts`
   - Funzione `getRiskClassByAteco(code)`
   - Logica match più lungo → più corto
   - Cache in memoria del file JSON

### **Frontend (3 file)**
3. ✅ `components/CompanyTrafficLight.tsx`
   - Componente semaforo azienda
   - Logica: rosso (≥1 non idoneo), arancione (≥1 scadenza ≤10gg), verde (tutti ok)

4. ✅ `app/(app)/dashboard/[companyId]/page.tsx`
   - Pagina dashboard aziendale aggregata
   - Real-time listener documenti azienda
   - Rollup stati (ok/notOk/expiring)
   - Tabella documenti richiesti con filtro risk class
   - Note normative (DM 16/01/1997, ASR preposti)

5. ✅ `public/rulebook-v1.json`
   - Copia del rulebook per uso frontend
   - Evita call backend inutili

---

## 🔧 File Modificati (2 esistenti)

### **1. functions/src/index.ts**

**Modifiche**:
- ✅ Import `getRiskClassByAteco` da `./lib/ateco`
- ✅ Lookup ATECO e risk class azienda (Step 1.5)
- ✅ Campi aggiunti al payload: `companyAteco`, `companyRiskClass`

**Codice aggiunto**:
```typescript
// Step 1.5: Get company ATECO and risk class
const companyRef = getFirestore().doc(`tenants/${tid}/companies/${cid}`);
const companySnap = await companyRef.get();
const companyData = companySnap.exists ? companySnap.data() : null;
const companyAteco: string | null = companyData?.ateco ?? null;
const companyRiskClass = companyData?.riskClass ?? getRiskClassByAteco(companyAteco) ?? null;

// Nel payload
companyAteco: companyAteco ?? null,
companyRiskClass: companyRiskClass ?? null,
```

### **2. firestore.indexes.json**

**Modifiche**:
- ✅ 2 nuovi indici COLLECTION per dashboard:
  1. `companyId + docType` (per query documenti azienda)
  2. `companyId + expiresAt` (per query scadenze)

---

## 🎯 Cosa Fa il Sistema Ora

### **Backend**
1. Quando viene caricato un documento:
   - Legge il campo `ateco` dalla company
   - Se `riskClass` non è settato manualmente → lookup da ATECO
   - Salva entrambi (`companyAteco`, `companyRiskClass`) nel documento

### **Frontend**
1. Dashboard `/dashboard/[companyId]`:
   - Mostra semaforo aggregato (verde/rosso/arancione)
   - Lista documenti richiesti filtrati per `riskClass`
   - Statistiche: totali, idonei, in scadenza, non idonei
   - Link "Apri" (se esistente) o "Carica" (se mancante)

---

## 🧪 Exit Tests (da eseguire)

### **Test 1: ATECO → Rischio**
```bash
# Setup: imposta ATECO azienda
firebase firestore:set tenants/tenant-demo/companies/acme '{"ateco":"47.11.10"}'

# Carica documento
# Verifica: documento ha companyRiskClass = "basso"
```

### **Test 2: Prefisso ATECO**
```bash
# Setup: ATECO non mappato esatto, ma prefisso sì
firebase firestore:set tenants/tenant-demo/companies/beta '{"ateco":"47.11.99"}'

# Verifica: match su prefisso "47.11" → rischio "basso"
```

### **Test 3: Semaforo Rosso**
```bash
# Setup: marca un documento come red
# Vai su /dashboard/acme
# Verifica: semaforo aziendale = rosso
```

### **Test 4: Semaforo Arancione**
```bash
# Setup: documento con expiresAt tra 1-10 giorni
# Vai su /dashboard/acme
# Verifica: semaforo aziendale = arancione
```

### **Test 5: Semaforo Verde**
```bash
# Setup: tutti documenti richiesti idonei
# Vai su /dashboard/acme
# Verifica: semaforo aziendale = verde
```

### **Test 6: Documenti Filtrati per Risk Class**
```bash
# Setup: azienda rischio "basso"
# Vai su /upload
# Verifica: checklist mostra solo doc per rischio basso
```

---

## 🚀 Deploy

### **Sequenza Corretta**

#### **1. Deploy Indici Firestore** (PRIMA!)
```bash
firebase deploy --only firestore:indexes --project repository-ai-477311
# Attendi completamento (può richiedere 5-10 minuti)
```

#### **2. Deploy Functions**
```bash
cd functions
npm run build
cd ..
firebase deploy --only functions --project repository-ai-477311
```

#### **3. Deploy Hosting (SSR)**
```bash
npm run build
firebase deploy --only hosting --project repository-ai-477311
```

#### **4. Verifica Deploy**
```bash
# Testa URL produzione
https://repository-ai-477311.web.app/dashboard/acme

# Se non funziona, controlla logs
firebase functions:log --project repository-ai-477311
```

---

## 📊 Mappa ATECO Iniziale

**File**: `functions/src/rulebook/ateco_risk_map.json`

```json
{
  "version": "2025-11-16",
  "map": {
    "47.11.10": "basso",
    "47.11": "basso",
    "25.11.00": "alto",
    "25.11": "alto",
    "43.21": "medio",
    "43": "medio"
  }
}
```

**Per aggiungere nuovi codici**:
1. Modifica il file JSON
2. Aggiungi entry tipo: `"CODICE_ATECO": "basso|medio|alto"`
3. Redeploy functions

---

## 🔧 Configurazione Aziende Demo

### **Setup Manuale (per MVP)**

```bash
# Azienda 1: rischio BASSO
firebase firestore:set tenants/tenant-demo/companies/acme '{"name":"Acme Corp","ateco":"47.11.10"}'

# Azienda 2: rischio MEDIO  
firebase firestore:set tenants/tenant-demo/companies/beta '{"name":"Beta Inc","ateco":"43.21"}'

# Azienda 3: rischio ALTO
firebase firestore:set tenants/tenant-demo/companies/gamma '{"name":"Gamma LLC","ateco":"25.11.00"}'
```

**O via Console Firebase**:
1. Vai su Firestore
2. Naviga a `tenants/tenant-demo/companies/{companyId}`
3. Aggiungi campo: `ateco: "47.11.10"`

---

## 📚 Riferimenti Normativi Implementati

### **DM 16/01/1997**
- Contenuti minimi formazione lavoratori, RLS, datori di lavoro
- Citato nei tooltip dashboard
- Usato per check formazione nel rulebook

### **Nuovo Accordo Stato-Regioni**
- Preposti: 12 ore (regime transitorio 8h fino 31/12/2025)
- Aggiornamento biennale
- Citato nei tooltip dashboard

---

## ⚠️ Note Importanti

### **Tenant Hardcoded**
La dashboard usa `tenant-demo` hardcoded:
```typescript
const tenantId = 'tenant-demo'; // TODO: da auth context
```

**Per produzione**: prendere da auth context utente.

### **ATECO Mancante**
Se l'azienda NON ha campo `ateco`:
- `getRiskClassByAteco(null)` → restituisce `null`
- Dashboard mostra TUTTI i documenti (nessun filtro risk class)

### **Risk Class Manuale**
Se imposti manualmente `riskClass` sull'azienda:
```bash
firebase firestore:update tenants/tenant-demo/companies/acme '{"riskClass":"alto"}'
```
→ Il sistema usa quello (ignora ATECO lookup)

---

## 🐛 Troubleshooting

### **Dashboard non carica documenti**
```bash
# Verifica indici Firestore deployati
firebase firestore:indexes --project repository-ai-477311

# Verifica path tenant corretto (tenant-demo non demo)
```

### **Semaforo sempre "N/D"**
```bash
# Verifica rulebook caricato
curl https://repository-ai-477311.web.app/rulebook-v1.json

# Controlla console browser per errori fetch
```

### **Documenti non hanno companyRiskClass**
```bash
# Ri-processa documento (carica di nuovo)
# O aggiungi campo manualmente via Firestore Console
```

---

## 📈 Metriche di Successo

- ✅ Dashboard carica in < 2 secondi
- ✅ Semaforo si aggiorna real-time (< 5 sec dopo modifica doc)
- ✅ ATECO lookup funziona su prefissi
- ✅ Filtro risk class mostra documenti corretti
- ✅ Citazioni normative visualizzate

---

## 🎯 Prossimi Step (Dopo Dashboard)

1. **Email Extension** (30 min)
   - Installare Firebase Trigger Email
   - Template: doc_non_idoneo, new_doc_for_verifier

2. **Hardening Security Rules** (45 min)
   - Da permissive a restrictive
   - ABAC multi-tenant

3. **Collegare Dati Reali** (30 min)
   - Pagina Scadenze → query Firestore
   - Notifiche → decommentare listener

4. **Badge Deroghe** (15 min)
   - Nel dettaglio documento
   - Se check ha deroghe applicate

---

**Implementazione completata**: 17 Novembre 2024, ore 01:00
**Tempo impiegato**: ~20 minuti
**File creati**: 5 nuovi + 2 modificati
**Test da eseguire**: 6 exit tests
**Deploy**: 3 step (indici → functions → hosting)

