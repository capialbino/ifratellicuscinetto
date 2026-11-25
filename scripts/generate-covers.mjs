import fs from 'node:fs/promises';
import path from 'node:path';
import { generateFastJson } from '../lib/gemini-fast.js';

const ARTICLES_DIR = path.resolve('src/content/articles');
const COVERS_DIR = path.resolve('public/covers');
const FORCE = process.argv.includes('--force');

const CATEGORY_COLORS = {
  Meccanica: '#c85a17',
  'AI & Software': '#0071e3',
  'Meccatronica & Hybrid': '#0f766e',
};

function stripInlineComment(val) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < val.length; i++) {
    const ch = val[i];
    if (ch === '\\' && inDouble) {
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(val[i - 1])) {
        return val.slice(0, i).trim();
      }
    }
  }
  return val.trim();
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = stripInlineComment(line.slice(idx + 1));
    if (val === 'true') {
      fm[key] = true;
    } else if (val === 'false') {
      fm[key] = false;
    } else if (val.startsWith('"') && val.endsWith('"')) {
      try {
        fm[key] = JSON.parse(val);
      } catch {
        fm[key] = val.slice(1, -1);
      }
    } else {
      fm[key] = val.replace(/^'|'$/g, '');
    }
  }
  return { frontmatter: fm, body: match[2].trim() };
}

function sanitizeSvg(rawSvg) {
  let svg = String(rawSvg || '').trim();
  const match = svg.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  svg = match[0];

  const forbiddenTags =
    'script|foreignObject|iframe|object|embed|style|image|animate|set|use|a';
  const pairedTagRe = new RegExp(`<(${forbiddenTags})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi');
  const singleTagRe = new RegExp(`<\\/?(${forbiddenTags})\\b[^>]*\\/?>`, 'gi');

  // Rimozione severa e iterativa fino a convergenza di qualsiasi tag/attributo eseguibile o risorsa esterna
  let prev;
  do {
    prev = svg;
    svg = svg
      .replace(pairedTagRe, '')
      .replace(singleTagRe, '')
      .replace(/[\s/]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
      .replace(
        /[\s/](?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (full, dq, sq, uq) => {
          const val = (dq ?? sq ?? uq ?? '').trim();
          return /^#[a-zA-Z0-9_-]+$/.test(val) ? full : ' ';
        }
      )
      .replace(/javascript:/gi, '')
      .replace(/https?:\/\/(?!www\.w3\.org\/2000\/svg(?=["'\s>]))[^\s"'<>]+/gi, '');
  } while (svg !== prev);

  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg viewBox="0 0 640 360"');
  }
  if (!/xmlns=/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg.length >= 120 && svg.length <= 24000 ? svg : null;
}

async function generateCoverForArticle(slug, frontmatter, body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const accent = CATEGORY_COLORS[frontmatter.category] || '#0071e3';
  const prompt = [
    'You are an industrial & scientific graphic designer (Jony Ive / LoveFrom / Distill.pub minimalist aesthetic).',
    'Create a clean, bespoke vector technical illustration in SVG specifically depicting the engineering concept of this article.',
    'Strict rules:',
    '- Exact root tag: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" fill="none">',
    '- Use a transparent background with a subtle soft radial glow using the accent color.',
    `- Palette: accent "${accent}" plus neutral slate "#6e6e73" with varied stroke-opacity (0.12 to 0.75) and thin precision lines (stroke-width 1 to 2.2).`,
    '- Depict a recognizable, geometrically accurate technical diagram of the article topic (e.g. bearing contact ellipse, turbine impeller, heat wave + neural mesh, shaft-hub cross section, control loop).',
    '- NO <text> elements (pure geometry & vector curves only, so it stays ultra-clean at any size).',
    '- NO <script>, NO <style>, NO external URLs, NO <image>.',
    '- Return JSON: {"svg": "<svg ...>...</svg>"}.',
    '',
    `TITLE: ${frontmatter.title || slug}`,
    `CATEGORY: ${frontmatter.category || 'Meccatronica & Hybrid'}`,
    `DESCRIPTION: ${frontmatter.description || ''}`,
    'EXCERPT:',
    body.slice(0, 1800),
  ].join('\n');

  const { model, parsed } = await generateFastJson({
    apiKey,
    envModel: process.env.GEMINI_MODEL,
    tier: 'flash',
    prompt,
    temperature: 0.35,
  });

  const cleanSvg = sanitizeSvg(parsed?.svg);
  if (!cleanSvg) {
    throw new Error(`SVG non valido ricevuto da ${model}`);
  }
  return { svg: cleanSvg, model };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[covers] GEMINI_API_KEY non impostata: salto la generazione cover automatiche.');
    return;
  }

  await fs.mkdir(COVERS_DIR, { recursive: true });
  const entries = await fs.readdir(ARTICLES_DIR, { withFileTypes: true });
  const italianFiles = entries.filter((e) => e.isFile() && /\.mdx?$/.test(e.name));

  let generated = 0;

  for (const entry of italianFiles) {
    const slug = entry.name.replace(/\.mdx?$/, '');
    const itPath = path.join(ARTICLES_DIR, entry.name);
    const outPath = path.join(COVERS_DIR, `${slug}.svg`);

    const raw = await fs.readFile(itPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);

    if (frontmatter.draft === true) {
      console.log(`[skip] ${slug} (bozza, nessuna cover generata)`);
      continue;
    }

    if (frontmatter.coverImage) {
      console.log(`[skip] ${slug} (usa copertina manuale)`);
      continue;
    }

    if (!FORCE) {
      try {
        await fs.access(outPath);
        console.log(`[skip] ${slug} (cover già presente)`);
        continue;
      } catch {
        // Procede a generare
      }
    }

    console.log(`[cover] Generazione SVG tecnico per ${slug}...`);
    try {
      const res = await generateCoverForArticle(slug, frontmatter, body);
      if (res) {
        await fs.writeFile(outPath, `${res.svg}\n`, 'utf8');
        generated++;
        console.log(`[done] public/covers/${slug}.svg (${res.model})`);
      }
    } catch (err) {
      console.log(`::warning::Cover non generata per ${slug}: ${String(err.message || err).replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }

  console.log(`Cover generate: ${generated}`);
}

main();
