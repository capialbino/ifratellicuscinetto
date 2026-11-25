# I Fratelli Cuscinetto

Sito editoriale di divulgazione tecnica su ingegneria meccanica, intelligenza artificiale e sistemi.
Costruito con **Astro** come sito **100% statico** (costo hosting €0/mese, zero database, supporto nativo a Markdown, formule LaTeX/KaTeX e syntax highlighting).

## Sviluppo locale

```bash
npm install
npm run dev
```

Poi apri `http://localhost:4321`.

## Come aggiungere un nuovo articolo

1. Crea un file `.md` o `.mdx` in `src/content/articles/` (es. `mio-articolo.md`).
2. Inserisci il frontmatter in testa al file:

```yaml
---
title: "Titolo dell'articolo"
description: "Breve riassunto per la card e la SEO."
pubDate: 2026-12-01
author: "alessandro" # marco | luca | alessandro
category: "Meccatronica & Hybrid" # Meccanica | AI & Software | Meccatronica & Hybrid
tags: ["tag1", "tag2"]
level: "Intermedio" # Divulgativo | Intermedio | Tecnico / Avanzato
draft: false
---
```

3. Scrivi in Markdown usando formule LaTeX inline (`$E = mc^2$`) o a blocco (`$$ ... $$`) e blocchi di codice.

## Versione inglese

Il selettore **EN / IT** nell'intestazione permette di passare tra le versioni del sito. La homepage e la pagina team sono disponibili anche in inglese; le traduzioni degli articoli si trovano in `src/content/articles/en/` e mantengono lo stesso nome file dell'originale. Quando aggiungi un articolo in inglese, usa `language: "en"` nel frontmatter e crea la relativa versione nella cartella `en`; gli articoli senza questo campo sono considerati italiani.

## Personalizzare i 3 autori

Modifica `src/data/authors.ts` inserendo i vostri nomi reali, bio e link.

## Condividere una preview temporanea

Per far vedere il sito a qualcuno su Internet senza pubblicarlo in modo permanente, avvia Astro e apri un secondo terminale. Astro consente i domini Quick Tunnel tramite `vite.server.allowedHosts` in `astro.config.mjs`; dopo aver modificato questa configurazione, riavvia il server:

```bash
npm run dev -- --host 0.0.0.0
cloudflared tunnel --url http://localhost:4321
```

Il secondo comando stampa un URL temporaneo `trycloudflare.com`: chiunque abbia quell'indirizzo può raggiungere la preview. L'URL smette di funzionare quando chiudi `cloudflared` e cambia alla prossima esecuzione. È una soluzione per test, non per produzione; non esporre così dati o funzioni private.

## Pubblicare gratuitamente con GitHub Pages

Il workflow in `.github/workflows/deploy.yml` compila e pubblica il sito su GitHub Pages a ogni push sul branch `main`.

1. Crea un repository GitHub e carica il progetto sul branch `main`.
2. Nel repository vai su **Settings → Pages** e scegli **GitHub Actions** come fonte di pubblicazione.
3. Attendi il workflow **Deploy Astro site to GitHub Pages** nella scheda **Actions**.
4. Condividi l'URL mostrato nel workflow: se il repository si chiama `ifratellicuscinetto`, sarà `https://capialbino.github.io/ifratellicuscinetto/`.

La configurazione Astro ricava automaticamente l'utente e il nome del repository dalle variabili di GitHub Actions e aggiunge il percorso base corretto a pagine, risorse e link interni. Dopo il primo deploy il sito è indipendente da VS Code e dal tuo PC; ogni successivo push su `main` pubblica gli aggiornamenti. GitHub Pages pubblica il sito su un URL pubblico.

Anche **Cloudflare Pages**, **Netlify** e **Vercel** offrono piani gratuiti per siti statici.

Quando vorrete passare a `ifratellicuscinetto.com`, basterà acquistare il dominio (~10 €/anno su Cloudflare Registrar o Porkbun) e collegarlo al progetto.
