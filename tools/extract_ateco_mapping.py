#!/usr/bin/env python3
"""
Script per estrarre il mapping ATECO→rischio dal PDF classificazione-ateco-rischi.pdf

Requisiti:
  pip install pdfplumber

Uso:
  python extract_ateco_mapping.py

Output:
  ateco_risk_mapping.csv
"""

import re
import csv
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("❌ Errore: pdfplumber non installato")
    print("Installa con: pip install pdfplumber")
    sys.exit(1)

# Paths
PDF_PATH = Path("../documenti utili per l'individuazione dell'idoneità di un documento/classificazione-ateco-rischi.pdf")
OUTPUT_PATH = Path("ateco_risk_mapping.csv")

# Regex patterns
code_re = re.compile(r"\b\d{2}(?:\.\d{1,2}){0,2}\b")
risk_re = re.compile(r"\b(basso|medio|alto)\b", re.IGNORECASE)

def extract_mapping():
    """Estrae il mapping ATECO→rischio dal PDF"""
    
    if not PDF_PATH.exists():
        print(f"❌ Errore: PDF non trovato: {PDF_PATH}")
        print(f"Path corrente: {Path.cwd()}")
        sys.exit(1)
    
    print(f"📄 Processando: {PDF_PATH}")
    rows = []
    
    try:
        with pdfplumber.open(str(PDF_PATH)) as pdf:
            total_pages = len(pdf.pages)
            print(f"📑 Totale pagine: {total_pages}")
            
            for page_num, page in enumerate(pdf.pages, 1):
                if page_num % 10 == 0:
                    print(f"   Elaborando pagina {page_num}/{total_pages}...")
                
                text = page.extract_text() or ""
                
                for ln in text.splitlines():
                    ln = re.sub(r"\s+", " ", ln).strip()
                    
                    # Euristica: cerca codice e rischio sulla stessa riga
                    code_m = code_re.search(ln)
                    risk_m = risk_re.search(ln)
                    
                    if code_m and risk_m:
                        code = code_m.group(0)
                        risk = risk_m.group(1).lower()
                        desc = ln
                        
                        # Ripulisci descrizione togliendo il codice e la parola rischio
                        desc = desc.replace(code, "").strip(" -:;")
                        desc = risk_re.sub("", desc).strip(" -:;")
                        
                        rows.append((code, risk, desc))
    
    except Exception as e:
        print(f"❌ Errore durante l'estrazione: {e}")
        sys.exit(1)
    
    print(f"✅ Estratte {len(rows)} righe grezze")
    
    # De-dup preferendo descrizioni più lunghe per la stessa (code,risk)
    dedup = {}
    for code, risk, desc in rows:
        key = (code, risk)
        if key not in dedup or len(desc) > len(dedup[key]):
            dedup[key] = desc
    
    print(f"✅ Dopo de-dup: {len(dedup)} mappings unici")
    
    # Salva CSV
    try:
        with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["ateco_code", "risk_level", "description"])
            
            for (code, risk), desc in sorted(dedup.items()):
                w.writerow([code, risk, desc])
        
        print(f"✅ File salvato: {OUTPUT_PATH}")
        print(f"📊 Totale mapping: {len(dedup)}")
        
        # Stats
        stats = {}
        for (_, risk), _ in dedup.items():
            stats[risk] = stats.get(risk, 0) + 1
        
        print("\n📈 Distribuzione rischi:")
        for risk, count in sorted(stats.items()):
            print(f"   {risk}: {count}")
        
    except Exception as e:
        print(f"❌ Errore durante il salvataggio: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("🚀 Estrazione mapping ATECO→rischio")
    print("=" * 50)
    extract_mapping()
    print("=" * 50)
    print("✅ Completato!")

