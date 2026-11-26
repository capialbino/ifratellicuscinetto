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

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
]);

const ALLOWED_SVG_ATTRS = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
  'id',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'clip-path',
  'mask',
]);

function isSafeSvgAttrValue(name, value) {
  const v = String(value || '').trim();
  if (/javascript:|data:|vbscript:|expression\s*\(/i.test(v)) return false;
  if (name === 'xmlns') return v === 'http://www.w3.org/2000/svg';
  if (/https?:\/\//i.test(v)) return false;
  if (/url\s*\(/i.test(v)) {
    return /^url\(\s*#[a-zA-Z0-9_-]+\s*\)$/.test(v);
  }
  return v.length <= 2000;
}

function sanitizeSvg(rawSvg) {
  let svg = String(rawSvg || '').trim();
  const match = svg.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  svg = match[0]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '');

  // Strict allowlist tag & attribute rebuilder (rejects all unknown/namespaced tags, on*, style, href, text)
  const out = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^<>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(svg)) !== null) {
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    if (rawTag.includes(':')) continue;
    if (!ALLOWED_SVG_TAGS.has(rawTag)) continue;
    if (closing) {
      out.push(`</${rawTag}>`);
      continue;
    }
    const cleanAttrs = [];
    const attrRe = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am;
    while ((am = attrRe.exec(rawAttrs)) !== null) {
      const attrName = am[1];
      const attrVal = am[2] ?? am[3] ?? '';
      if (!ALLOWED_SVG_ATTRS.has(attrName)) continue;
      if (!isSafeSvgAttrValue(attrName, attrVal)) continue;
      cleanAttrs.push(`${attrName}="${attrVal.replace(/"/g, '&quot;')}"`);
    }
    const attrStr = cleanAttrs.length > 0 ? ` ${cleanAttrs.join(' ')}` : '';
    out.push(`<${rawTag}${attrStr}${selfClose ? '/' : ''}>`);
  }

  let rebuilt = out.join('');
  if (!rebuilt.startsWith('<svg') || !rebuilt.endsWith('</svg>')) return null;

  if (!/viewBox=/i.test(rebuilt)) {
    rebuilt = rebuilt.replace(/<svg/i, '<svg viewBox="0 0 640 360"');
  }
  if (!/xmlns=/i.test(rebuilt)) {
    rebuilt = rebuilt.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return rebuilt.length >= 120 && rebuilt.length <= 24000 ? rebuilt : null;
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
