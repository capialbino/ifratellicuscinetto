# I Fratelli Cuscinetto

Sito editoriale bilingue (IT / EN) di divulgazione tecnica su ingegneria meccanica, intelligenza artificiale e sistemi.
Costruito con **Astro** (output statico, costo **0 €/mese**), pannello di redazione **`/admin`** via browser e **traduzione automatica in inglese** su GitHub Actions.

---

## 1. Pannello `/admin` per pubblicare dal frontend

Il sito include una sezione editoriale su `/admin` pensata per scrivere e pubblicare senza toccare Git o codice:
- Toolbar visuale (titoli, grassetto, formule `$...$` / `$$...$$`, blocchi di codice, tabelle, **upload immagini**).
- Anteprima live con rendering **Markdown + KaTeX**.
- Supporto **bozze**, modifica ed eliminazione articoli.

### Opzione consigliata (€0/mese): Cloudflare Pages + Login con Password
Con **Cloudflare Pages** i tuoi co-autori non devono avere un account GitHub: fanno login su `/admin` con il loro nome e una password. Le **Cloudflare Pages Functions** (`functions/api/admin/*`) salvano gli articoli su GitHub usando il tuo token lato server.

1. Collega il repository `capialbino/ifratellicuscinetto` su **Cloudflare Pages**:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
2. In **Settings → Environment variables** imposta:
   - `GITHUB_TOKEN`: GitHub Fine-grained PAT con permesso **Contents: Read and write** sul repo `capialbino/ifratellicuscinetto`.
   - `ADMIN_PASSWORD`: password condivisa della redazione (oppure `ADMIN_PASSWORDS` in JSON per password diverse, es. `{"federico-pappafava":"pw1","alessandro-rossi":"pw2","alessandro-capialbi":"pw3"}`).
   - `ADMIN_SESSION_SECRET`: stringa casuale lunga per firmare i cookie di sessione.
3. Opzionali: `GITHUB_REPO` (default `capialbino/ifratellicuscinetto`), `GITHUB_BRANCH` (default `main`).

### Opzione GitHub Pages (€0/mese)
Su **GitHub Pages** puro non c'è backend per verificare password:
- La stessa pagina `/admin` rileva automaticamente che `/api/admin/session` non esiste e permette l'accesso con un **GitHub Fine-Grained Token** personale nel browser.
- In alternativa è già presente `.pages.yml` per usare **Pages CMS** (`https://app.pagescms.org`) facendo login con GitHub.

---

## 2. Traduzione automatica Italiano → Inglese

Ogni volta che pubblichi o aggiorni un articolo italiano in `src/content/articles/*.md`, il workflow `.github/workflows/deploy.yml` esegue automaticamente `scripts/translate-articles.mjs` prima della build:
- Rileva nuovi articoli o modifiche tramite `sourceHash` SHA-256.
- Traduce titolo, descrizione, tag e corpo preservando **formule LaTeX**, **blocchi di codice** e **link/immagini**, salvando in `src/content/articles/en/<slug>.md`.
- Esegue il commit della traduzione e pubblica il sito aggiornato.

### Qualità di traduzione (configurazione GitHub Secrets)
In **GitHub → Settings → Secrets and variables → Actions** puoi aggiungere uno di questi secret gratuiti:
- `GEMINI_API_KEY` *(consigliato — free tier Google AI Studio, qualità ottima su terminologia tecnica meccanica/AI e LaTeX)*.
- `DEEPL_API_KEY` *(alternativa — piano Free da 500.000 caratteri/mese)*.
- Se non imposti nessuna chiave, lo script usa automaticamente un fallback gratuito senza chiave per garantire comunque il funzionamento a 0 €.

---

## Sviluppo locale

```bash
npm install
npm run dev
```

Per testare in locale anche le Cloudflare Pages Functions (`/api/admin/*`):

```bash
npm run build
npx wrangler pages dev dist --binding ADMIN_PASSWORD=test GITHUB_TOKEN=ghp_xxx
```
