# Sistema di Regole - HQ Document AI

Questa cartella contiene una **copia di riferimento** dei file che definiscono il sistema di validazione documenti.

> ⚠️ **ATTENZIONE**: Questi sono snapshot per documentazione. I file originali sono in `functions/src/`.

---

## 📁 File in questa cartella

| File | Percorso Originale | Descrizione |
|------|-------------------|-------------|
| `rulebook-v1.json` | `functions/src/rulebook/` | Definizioni DocTypes + checks LLM/deterministici |
| `rulebook-v1-deterministic.json` | `functions/src/rulebook/` | Regole deterministiche con operatori |
| `deterministicEngine.ts` | `functions/src/lib/` | Engine che esegue le regole JSON |
| `rules.ts` | `functions/src/lib/` | Orchestrazione verdetti (computeVerdict) |

---

## 🏗️ Architettura del Sistema di Regole

```
┌─────────────────────────────────────────────────────────────────┐
│                        UPLOAD DOCUMENTO                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    1. OCR (Document AI)                          │
│                    Estrazione testo raw                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    2. RAG (Vector Search)                        │
│                    Recupero contesto normativo                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 3. LLM (Gemini 2.5 Flash)                        │
│    Input: testo + contesto RAG + rulebook-v1.json                │
│    Output: Normalized { docType, campi estratti, ... }           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              4. DETERMINISTIC ENGINE                             │
│    Input: Normalized + rulebook-v1-deterministic.json            │
│    Output: { passed: bool, failedRules: [...] }                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 5. COMPUTE VERDICT (rules.ts)                    │
│    Output: { status: green|yellow|red, reason, expiresAt }       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Struttura rulebook-v1.json

```json
{
  "documents": [
    {
      "docType": "NOME_DOCUMENTO",
      "displayName": "Nome Leggibile",
      "requiredForAll": false,
      "riskClass": ["basso", "medio", "alto"],
      "checks": [
        {
          "id": "check_id",
          "description": "Descrizione del controllo",
          "evaluation": "llm" | "deterministic",
          "field": "nomeCampo",
          "normativeReferences": [],
          "deroghe": [],
          "notes": "Note per LLM o dev"
        }
      ],
      "notes": "Note sul documento"
    }
  ]
}
```

---

## 📋 Struttura rulebook-v1-deterministic.json

```json
{
  "deterministicRules": {
    "NOME_DOCUMENTO": [
      {
        "ruleId": "rule_id",
        "evaluation": "det",
        "field": "nomeCampo",
        "op": "operatore",
        "value": "valore",
        "policy": false,
        "extra": { "when": { ... } }
      }
    ]
  },
  "parameters": {
    "PARAM_NAME": "value"
  }
}
```

---

## 🔧 Operatori Deterministici Supportati

| Operatore | Descrizione | Esempio |
|-----------|-------------|---------|
| `present` | Campo presente e non vuoto | `{ "op": "present", "value": true }` |
| `eq` | Uguaglianza esatta | `{ "op": "eq", "value": true }` |
| `equals` | Alias di eq | `{ "op": "equals", "value": "stringa" }` |
| `regex` | Match regex | `{ "op": "regex", "value": "^pattern$" }` |
| `gte` | Maggiore o uguale (numerico) | `{ "op": "gte", "value": 3 }` |
| `lte` | Minore o uguale (numerico) | `{ "op": "lte", "value": 10 }` |
| `age_days_lte` | Data non più vecchia di N giorni | `{ "op": "age_days_lte", "value": 120 }` |
| `age_months_lte` | Data non più vecchia di N mesi | `{ "op": "age_months_lte", "value": 60 }` |
| `date_gte_today` | Data >= oggi (non scaduto) | `{ "op": "date_gte_today" }` |
| `contains_any` | Contiene almeno uno dei valori | `{ "op": "contains_any", "value": ["a", "b"] }` |
| `gte_by_risk` | Soglia variabile per classe rischio | `{ "op": "gte_by_risk", "value": { "low": 8, "medium": 12, "high": 16 } }` |

> **Nota `gte_by_risk`**: Accetta riskClass sia in italiano (`basso`, `medio`, `alto`) che in inglese (`low`, `medium`, `high`). La mappatura è automatica.

---

## 🔀 Regole Condizionali (extra.when)

Permette di applicare una regola solo se una condizione è soddisfatta:

```json
{
  "ruleId": "esempio_condizionale",
  "field": "contractEndDate",
  "op": "date_gte_today",
  "extra": {
    "when": {
      "field": "contractType",
      "op": "equals",
      "value": "determinato"
    }
  }
}
```

**Operatori supportati in `when`**: 
- `equals` - Uguaglianza esatta
- `regex` - Match regex
- `present` - Campo presente/assente
- `in` - Valore in array
- `date_lte_param` - Data campo <= data parametro (es. regime transitorio)
- `date_gt_param` - Data campo > data parametro

**Esempio con parametro data (regime transitorio PREPOSTO)**:
```json
{
  "ruleId": "preposti_hours_min",
  "field": "hours",
  "op": "gte",
  "value": 12,
  "extra": {
    "when": {
      "field": "issuedAt",
      "op": "date_gt_param",
      "param": "PREPOSTI_CUTOFF"
    }
  }
}
```

---

## 🚦 Gestione Verdetti (GREEN/YELLOW/RED)

Il sistema `computeVerdict` produce tre stati:

| Stato | Condizione | Causa |
|-------|------------|-------|
| **RED** | `failedRules.length > 0` | Regole "hard" fallite |
| **YELLOW** | `unverifiableRules.length > 0` | Campi cross-doc mancanti (non verificabile) |
| **YELLOW** | `policyFailedRules.length > 0` | Regole con `policy: true` fallite |
| **YELLOW** | Scadenza entro 10 giorni | Documento in scadenza imminente |
| **GREEN** | Tutte le regole passate | Documento conforme |

### Campi "Non Verificabili" (YELLOW)

Per i controlli cross-documento (es. `matchesDeclaration`, `matchesLibretto`), se il campo è `null/undefined` perché il documento di riferimento manca, il verdetto è **YELLOW** ("non verificabile") invece di RED.

---

## 📊 DocTypes Implementati (52 totali)

### Documenti Lavoratori
- UNILAV
- LETTERA_DISTACCO
- IDONEITA_SANITARIA
- NOMINA_MEDICO_COMPETENTE
- NOMINA_PREPOSTO
- NOMINA_PRIMO_SOCCORSO
- NOMINA_EMERGENZE_ANTINCENDIO
- NOMINA_PES_PAV
- VERBALE_CONSEGNA_DPI
- FORMAZIONE_BASE_ART37
- FORMAZIONE_SPECIFICA_MEDIO_ALTO
- FORMAZIONE_PREPOSTO
- FORMAZIONE_LAVORI_IN_QUOTA_DPI3
- FORMAZIONE_PRIMO_SOCCORSO
- FORMAZIONE_SOCCORSO_IN_QUOTA
- FORMAZIONE_ANTINCENDIO
- FORMAZIONE_LAVORI_ELETTRICI_PES_PAV_PEI
- FORMAZIONE_CAMPI_ELETTROMAGNETICI
- FORMAZIONE_ALPINISTA
- FORMAZIONE_CONDUZIONE_PLE
- FORMAZIONE_CONDUZIONE_AUTOGRU
- FORMAZIONE_MOVIMENTO_TERRE
- FORMAZIONE_AMBIENTE_CONFINATO
- FORMAZIONE_SEGNALETICA_STRADALE
- ALTRI_DOCUMENTI_LAVORATORE

### Documentazione ITP
- DURC
- VISURA
- DVR
- PREPOSTO
- LAVORATORE
- REGISTRO_ANTINCENDIO
- PATENTE_A_CREDITI
- CERTIFICAZIONI_SOA_III_PLUS
- DOMA_INPS_INAIL
- AUTOCERTIFICAZIONE_IDONEITA_TECNICO_PROF_ART26
- DICHIARAZIONE_ANTIMAFIA_ART14
- NOMINA_RSPP
- ATTESTATO_FORMAZIONE_RSPP
- NOMINA_RLS
- ATTESTATO_FORMAZIONE_RLS
- CI_DATORE_LAVORO
- ALTRI_DOCUMENTI_ITP

### Documentazione Cantiere
- POS
- PROGETTO_ESECUTIVO
- PSC
- ACCETTAZIONE_PSC

### Documentazione Mezzi
- LIBRETTO_MEZZO
- ASSICURAZIONE_MEZZO
- MASSA_IN_SERVIZIO_MARCATURE_CE
- VERIFICA_ANNUALE_MEZZO
- VERIFICA_TRIMESTRALE_FUNI
- ALTRI_DOCUMENTI_MEZZI

---

## ⚠️ Logiche da Implementare nell'App

Alcune regole richiedono logica applicativa (non nel rulebook):

| Logica | DocType | Descrizione |
|--------|---------|-------------|
| `isPreviousYear` | DOMA_INPS_INAIL | Calcolare se `referenceYear == annoCorrente - 1` |
| `isCoverageActive` | ASSICURAZIONE_MEZZO | Calcolare se `startDate <= oggi <= endDate` |
| Bundle RSPP | NOMINA_RSPP + ATTESTATO_FORMAZIONE_RSPP | Se uno presente, richiedere entrambi |
| Bundle RLS | NOMINA_RLS + ATTESTATO_FORMAZIONE_RLS | Se uno presente, richiedere entrambi |
| Solo GRU | VERIFICA_TRIMESTRALE_FUNI | Richiedere solo se `mezzoType == "GRU"` |
| Cross-doc matching | Vari | Confronti tra documenti (medico, nominativi, ecc.) |

---

## 🔄 Aggiornamento

Per aggiornare questi file:

```bash
# Dalla root del progetto
Copy-Item "functions/src/rulebook/rulebook-v1.json" -Destination "docs/rules/"
Copy-Item "functions/src/rulebook/rulebook-v1-deterministic.json" -Destination "docs/rules/"
Copy-Item "functions/src/lib/deterministicEngine.ts" -Destination "docs/rules/"
Copy-Item "functions/src/lib/rules.ts" -Destination "docs/rules/"
```

---

*Ultimo aggiornamento: Dicembre 2025*
