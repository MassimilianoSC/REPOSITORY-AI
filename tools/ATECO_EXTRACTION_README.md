# 📊 Estrazione Mapping ATECO→Rischio

## 🎯 Obiettivo

Estrarre il mapping tra codici ATECO e livelli di rischio (basso/medio/alto) dal PDF `classificazione-ateco-rischi.pdf` per le regole deterministiche.

---

## 🔧 **METODO 1: Script pdfplumber (Raccomandato)**

### **Installazione:**
```bash
pip install pdfplumber
```

### **Esecuzione:**
```bash
cd tools
python extract_ateco_mapping.py
```

### **Output:**
- File: `tools/ateco_risk_mapping.csv`
- Formato:
  ```csv
  ateco_code,risk_level,description
  01.11,basso,"Coltivazione di cereali..."
  45.20,alto,"Manutenzione e riparazione..."
  ```

---

## 🔧 **METODO 2: Script tabula-py (Layout complesso)**

Se il PDF ha tabelle complesse, usa `tabula-py` (richiede Java):

### **Installazione:**
```bash
pip install tabula-py
# Richiede anche Java Runtime Environment (JRE)
```

### **Script alternativo:**

```python
import tabula
import pandas as pd
from pathlib import Path

PDF = Path("../documenti utili per l'individuazione dell'idoneità di un documento/classificazione-ateco-rischi.pdf")
OUT = Path("ateco_risk_mapping.csv")

# Estrai tutte le tabelle
dfs = tabula.read_pdf(str(PDF), pages="all", multiple_tables=True)

# Concatena e normalizza
all_data = []
for df in dfs:
    # Adatta i nomi colonne al tuo PDF
    # Es: df.columns = ['codice', 'descrizione', 'rischio']
    if 'codice' in df.columns and 'rischio' in df.columns:
        for _, row in df.iterrows():
            code = str(row['codice']).strip()
            risk = str(row['rischio']).strip().lower()
            desc = str(row.get('descrizione', '')).strip()
            
            if code and risk in ['basso', 'medio', 'alto']:
                all_data.append([code, risk, desc])

# Salva CSV
result_df = pd.DataFrame(all_data, columns=['ateco_code', 'risk_level', 'description'])
result_df.drop_duplicates().to_csv(OUT, index=False, encoding='utf-8')
print(f"✅ Salvato: {OUT} ({len(result_df)} righe)")
```

---

## 📤 **STEP SUCCESSIVI:**

Dopo aver generato `ateco_risk_mapping.csv`:

### **1. Verifica il CSV:**
```bash
head ateco_risk_mapping.csv
```

### **2. Carica su Firestore:**

Opzioni:
- **A) Storage:** Carica in Firebase Storage come `configs/ateco_risk/v1/mapping.csv`
- **B) Firestore:** Importa come collection `ateco_mappings`

### **3. Usa nel backend:**

```typescript
// functions/src/lib/atecoRisk.ts
import atecoMapping from '../configs/ateco_risk_mapping.json';

export function getRiskLevel(atecoCode: string): 'low' | 'medium' | 'high' | null {
  const entry = atecoMapping.find(m => m.ateco_code === atecoCode);
  return entry ? entry.risk_level : null;
}
```

---

## 🧪 **Test:**

```typescript
// Test con codici noti
getRiskLevel('01.11') // → 'basso'
getRiskLevel('45.20') // → 'alto'
getRiskLevel('99.99') // → null (non trovato)
```

---

## ❓ **Troubleshooting:**

### **Errore: PDF non trovato**
```bash
cd tools
python extract_ateco_mapping.py
```
Verifica il path relativo nel script.

### **Poche righe estratte**
Prova il METODO 2 con `tabula-py` se il layout è complesso.

### **Java non trovato (tabula)**
Installa Java Runtime Environment (JRE):
- Windows: https://www.java.com/download/
- Mac: `brew install java`
- Linux: `sudo apt install default-jre`

