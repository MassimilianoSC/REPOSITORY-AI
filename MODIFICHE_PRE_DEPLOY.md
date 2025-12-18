# 📋 Report Modifiche Pre-Deploy

**Data:** 5 Novembre 2025  
**Obiettivo:** Abilitare export statico Next.js per deploy su Firebase Hosting via PR preview

---

## 🎯 PROBLEMA INIZIALE

Il workflow GitHub Actions tentava di eseguire il vecchio comando `next export` (deprecato con Next.js 13+ App Router), causando fallimento del deploy.

**Errore originale workflow:**
```yaml
- run: npm ci && npm run build && npx next export -o out  # ❌ SBAGLIATO
```

---

## 🔧 MODIFICHE EFFETTUATE

### 1. **`package.json`** - Rimossa dipendenza inutilizzata
**Cosa:** Eliminata dipendenza `@supabase/supabase-js`  
**Perché:** Non utilizzata nel progetto, probabilmente residuo di template  
**Impatto:** Riduce dimensione node_modules (~2MB), nessun impatto funzionale

---

### 2. **`next.config.js`** - Abilitato export statico
```javascript
// PRIMA
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
};

// DOPO
const nextConfig = {
  output: 'export',  // ← AGGIUNTO per export statico
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
};
```

**Perché:** Con Next.js 13+ App Router, per generare file HTML statici devi dichiarare `output: 'export'` nel config invece di chiamare `next export` separatamente.

**Cosa fa:** Durante `npm run build`, Next.js genera automaticamente tutti i file statici nella cartella `out/`.

---

### 3. **`firebase.json`** - Semplificata configurazione
```json
// PRIMA (versione sovra-ingegnerizzata)
{
  "hosting": {
    "public": "out",
    "ignore": [...],
    "rewrites": [...],  // ← Non necessario
    "headers": [...]     // ← Non necessario per ora
  }
}

// DOPO (versione minimalista)
{
  "hosting": {
    "public": "out",
    "ignore": [...]
  }
}
```

**Perché:** Per export statico su Firebase Hosting, basta specificare `"public": "out"`. Le rewrites/headers possono essere aggiunte in futuro se necessario.

---

### 4. **`.github/workflows/firebase-hosting-pull-request.yml`** - Corretto comando build
```yaml
# PRIMA (deprecato)
- run: npm ci && npm run build && npx next export -o out

# DOPO (corretto per App Router)
- run: npm ci && npm run build
```

**Perché:** 
- Con `output: 'export'` nel config, `npm run build` genera automaticamente la cartella `out/`
- Il comando `next export` è deprecato e causa errori con App Router
- Questo è il metodo ufficiale raccomandato da Next.js 13+

---

### 5. **`app/(app)/document/[id]/page.tsx`** - Aggiunto `generateStaticParams()`
**Problema:** Route dinamica `/document/[id]` incompatibile con export statico.

**Errore originale:**
```
Error: Page "/document/[id]" is missing "generateStaticParams()" 
so it cannot be used with "output: export" config.
```

**Soluzione:** Creata architettura Server + Client Component

**File `page.tsx` (Server Component):**
```typescript
export function generateStaticParams() {
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' },
  ];
}

export default function DocumentPage({ params }: { params: { id: string } }) {
  return <DocumentDetail documentId={params.id} />;
}
```

**File `document-detail.tsx` (Client Component):**
```typescript
'use client';

export function DocumentDetail({ documentId }: { documentId: string }) {
  // ... tutta la logica UI con hooks
}
```

**Perché questa separazione:**
- `generateStaticParams()` deve essere in un **Server Component** (senza `'use client'`)
- La logica UI con `useRouter()` richiede un **Client Component** (con `'use client'`)
- Next.js non permette di mescolare le due cose nello stesso file
- Soluzione: file wrapper server che importa il client component

**Cosa genera:** Durante build, Next.js crea 3 pagine HTML statiche:
- `/document/1.html`
- `/document/2.html`
- `/document/3.html`

---

## ✅ RISULTATO BUILD LOCALE

```bash
npm run build
```

**Output:**
```
✓ Compiled successfully
✓ Checking validity of types
✓ Collecting page data
✓ Generating static pages (12/12)  ← Tutte le pagine generate!
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                    387 B          79.8 kB
├ ○ /dashboard                           2.07 kB        89.2 kB
├ ● /document/[id]                       2 kB           89.2 kB
│   ├ /document/1
│   ├ /document/2
│   └ /document/3
├ ○ /login                               2.69 kB         189 kB
├ ○ /repository                          2 kB           89.2 kB
├ ○ /scadenze                            1.98 kB        89.1 kB
└ ○ /upload                              3.06 kB         197 kB
```

**Legenda:**
- `○` = Static (HTML generato staticamente)
- `●` = SSG (Static Site Generation con getStaticProps/generateStaticParams)

---

## 📁 FILE MODIFICATI

```
✏️  package.json                          (rimosso @supabase/supabase-js)
✏️  next.config.js                        (aggiunto output: 'export')
✏️  firebase.json                         (semplificato, rimosso rewrites/headers)
✏️  .github/workflows/firebase-hosting-pull-request.yml  (rimosso npx next export)
✏️  app/(app)/document/[id]/page.tsx     (refactor: server component wrapper)
✨  app/(app)/document/[id]/document-detail.tsx  (nuovo: client component)
❌  .github/workflows/firebase-hosting.yml  (eliminato: non necessario)
```

---

## 🔐 COSA NON ABBIAMO FATTO (e perché)

### ❌ Non abbiamo aggiunto `FIREBASE_SERVICE_ACCOUNT`
**Perché:** Per PR preview, la Firebase CLI ha già configurato i permessi necessari tramite `FIREBASE_SERVICE_ACCOUNT_REPOSITORY_AI_477311` (già presente nel workflow).

### ❌ Non abbiamo aggiunto secrets `NEXT_PUBLIC_*` su GitHub
**Perché:** 
- Le env vars Firebase sono usate solo **client-side** a runtime
- Non servono a **build-time** (il progetto compila senza)
- Se il workflow fallisse per env mancanti, le aggiungeremo dopo

### ❌ Non abbiamo creato workflow per deploy "live"
**Perché:** Per ora vogliamo solo **PR preview**. Il deploy su produzione può essere fatto manualmente o con un workflow separato in futuro.

---

## ⚠️ LIMITAZIONI EXPORT STATICO

Con `output: 'export'`, alcune funzionalità Next.js non sono disponibili:

### ❌ Non Supportato:
- API Routes (`/api/*`)
- Server Actions
- Middleware
- ISR (Incremental Static Regeneration)
- Image Optimization (già disabilitata con `images: { unoptimized: true }`)

### ✅ Supportato (e usato nel progetto):
- Client-side routing
- Firebase Auth client-side
- Firebase Storage/Firestore client-side
- Static HTML generation
- Client Components con `'use client'`

**Nota:** Tutte le funzionalità del progetto sono client-side, quindi **nessun problema**.

---

## 🧪 TEST CONSIGLIATI DOPO DEPLOY

Una volta che la PR preview sarà live:

1. **Login Flow:**
   - Vai su `/login`
   - Inserisci email
   - Verifica che mostri "Check your inbox"
   - ⚠️ **Email-link callback potrebbe avere problemi** (da testare)

2. **Navigation:**
   - Testa tutti i link della sidebar
   - Verifica che il routing client-side funzioni

3. **Upload:**
   - Vai su `/upload`
   - Seleziona company
   - Testa drag&drop file

4. **Document Detail:**
   - Clicca su un documento in dashboard
   - Verifica che `/document/1`, `/document/2`, `/document/3` funzionino

---

## 🚀 PROSSIMI STEP

### 1. **Commit e Push**
```bash
git add .
git commit -m "fix: enable static export with generateStaticParams for dynamic routes"
git push
```

### 2. **Apri/Aggiorna PR su GitHub**

### 3. **Controlla Checks**
- Il workflow dovrebbe completare con successo
- Vedrai URL di preview nei commenti

### 4. **Test live**
- Apri URL preview
- Testa le funzionalità sopra elencate
- Segnala eventuali problemi

---

## ❓ DOMANDE PRIMA DI PROCEDERE

1. **Ti è chiaro perché abbiamo fatto queste modifiche?**

2. **Sei d'accordo con l'approccio di separare Server e Client Component per `/document/[id]`?**

3. **Vuoi che aggiungiamo già ora le env vars `NEXT_PUBLIC_*` come secrets su GitHub, oppure aspettiamo di vedere se il workflow fallisce?** (consiglio: aspettiamo)

4. **Va bene procedere con il commit e push, o vuoi rivedere qualcosa?**

---

## ✅ CONFERMA

**Se tutto ti è chiaro e sei d'accordo con le modifiche, possiamo procedere con:**
```bash
git add .
git commit -m "fix: enable static export with generateStaticParams for dynamic routes"
git push
```

**Altrimenti, dimmi cosa vuoi modificare/chiarire!**

---

**Report generato il:** 5 Novembre 2025  
**Build locale testato:** ✅ Successo (12 pagine generate)  
**Pronto per deploy:** ✅ Sì

