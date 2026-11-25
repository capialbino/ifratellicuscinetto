import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ARTICLES_DIR = path.resolve('src/content/articles');
const EN_DIR = path.join(ARTICLES_DIR, 'en');
const FORCE = process.argv.includes('--force');
const SEED_ONLY = process.argv.includes('--seed-hashes');

function sha256Short(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function unquoteYaml(val) {
  const trimmed = val.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const rawVal = line.slice(idx + 1).trim();
    if (rawVal === 'true') fm[key] = true;
    else if (rawVal === 'false') fm[key] = false;
    else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      try {
        fm[key] = JSON.parse(rawVal);
      } catch {
        fm[key] = rawVal
          .slice(1, -1)
          .split(',')
          .map((s) => unquoteYaml(s))
          .filter(Boolean);
      }
    } else {
      fm[key] = unquoteYaml(rawVal);
    }
  }
  return { frontmatter: fm, body: match[2].replace(/^\r?\n/, '') };
}

function serializeEnglishMarkdown({ frontmatter, translated, body, sourceHash }) {
  const lines = [
    '---',
    'language: "en"',
    `title: ${JSON.stringify(translated.title)}`,
    `description: ${JSON.stringify(translated.description)}`,
    `pubDate: ${String(frontmatter.pubDate || new Date().toISOString().slice(0, 10)).slice(0, 10)}`,
    ...(frontmatter.updatedDate
      ? [`updatedDate: ${String(frontmatter.updatedDate).slice(0, 10)}`]
      : []),
    `author: ${JSON.stringify(frontmatter.author || 'alessandro-capialbi')}`,
    `category: ${JSON.stringify(frontmatter.category || 'Meccatronica & Hybrid')}`,
    `tags: ${JSON.stringify(translated.tags)}`,
    `level: ${JSON.stringify(frontmatter.level || 'Intermedio')}`,
    ...(frontmatter.draft ? ['draft: true'] : ['draft: false']),
    `sourceHash: ${JSON.stringify(sourceHash)}`,
    '---',
    '',
    body.trim(),
    '',
  ];
  return lines.join('\n');
}

/** Protects fenced code blocks, inline code, LaTeX math, and URLs before machine translation. */
function protectTechnicalSegments(markdown, makeToken) {
  const tokens = [];
  const store = (segment) => {
    const idx = tokens.push(segment) - 1;
    return makeToken(idx);
  };

  let text = markdown;
  text = text.replace(/```[\s\S]*?```/g, store);
  text = text.replace(/\$\$[\s\S]*?\$\$/g, store);
  text = text.replace(/`[^`\n]+`/g, store);
  text = text.replace(/(^|[^\\$])(\$[^\n$]+?\$)/gm, (_, prefix, math) => `${prefix}${store(math)}`);
  text = text.replace(/(!?\[[^\]]*\])\(([^)]+)\)/g, (_, label, url) => `${label}(${store(url)})`);

  return { text, tokens };
}

function restoreTechnicalSegments(text, tokens, tokenPattern) {
  return text.replace(tokenPattern, (full, idx) => {
    const val = tokens[Number(idx)];
    return val !== undefined ? val : full;
  });
}

let cachedGeminiModel = null;

async function resolveGeminiModel(apiKey) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL.replace(/^models\//, '');
  if (cachedGeminiModel) return cachedGeminiModel;

  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`;
  const res = await fetch(listUrl);
  if (!res.ok) {
    const errText = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`Gemini ListModels ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidates = (data.models || [])
    .filter(
      (m) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        typeof m.name === 'string'
    )
    .map((m) => m.name.replace(/^models\//, ''))
    .filter(
      (id) =>
        id.startsWith('gemini-') &&
        !/(image|audio|tts|live|veo|embedding|aqa|vision|robotics|computer-use|omni)/i.test(id)
    );

  // Preferisce l'alias stabile `gemini-flash-latest` o il modello `flash` più recente
  const picked =
    candidates.find((id) => id === 'gemini-flash-latest') ||
    candidates
      .filter((id) => /flash/i.test(id) && !/lite/i.test(id))
      .sort()
      .at(-1) ||
    candidates
      .filter((id) => /flash/i.test(id))
      .sort()
      .at(-1) ||
    candidates.sort().at(-1);

  if (!picked) {
    throw new Error('Nessun modello Gemini compatibile con generateContent trovato per questa API key.');
  }

  cachedGeminiModel = picked;
  return picked;
}

async function translateWithGemini(article) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = await resolveGeminiModel(apiKey);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = [
    'Translate this Italian technical engineering article into clear, natural, idiomatic English.',
    'Rules:',
    '- Preserve ALL Markdown headings, lists, blockquotes, tables, image URLs, and code blocks verbatim.',
    '- Preserve ALL LaTeX formulas ($...$ and $$...$$) verbatim without changing symbols.',
    '- Translate technical terms accurately (e.g. tribologia -> tribology, accoppiamento con interferenza -> interference fit, cuscinetto volvente -> rolling-element bearing).',
    '- Return JSON with keys: "title" (string), "description" (string), "tags" (array of lowercase hyphenated English tag strings), "body" (string Markdown).',
    '',
    `TITLE: ${article.frontmatter.title}`,
    `DESCRIPTION: ${article.frontmatter.description}`,
    `TAGS: ${JSON.stringify(article.frontmatter.tags || [])}`,
    'BODY:',
    article.body,
  ].join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`Gemini API ${res.status} (${model}): ${errText}`);
  }

  const data = await res.json();
  const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) throw new Error(`Gemini (${model}) returned empty response`);
  const parsed = JSON.parse(rawJson);

  return {
    title: String(parsed.title || article.frontmatter.title).trim(),
    description: String(parsed.description || article.frontmatter.description).trim(),
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim()).filter(Boolean)
      : article.frontmatter.tags || [],
    body: String(parsed.body || article.body).trim(),
    model,
  };
}

async function translateWithDeepL(article) {
  const apiKey = process.env.DEEPL_API_KEY;
  const isFree = apiKey.endsWith(':fx');
  const endpoint = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const { text: protectedBody, tokens } = protectTechnicalSegments(
    article.body,
    (idx) => `<keep id="${idx}"/>`
  );

  const tagsList = Array.isArray(article.frontmatter.tags) ? article.frontmatter.tags : [];
  const payloadText = [
    article.frontmatter.title,
    article.frontmatter.description,
    protectedBody,
    ...tagsList,
  ];

  const params = new URLSearchParams();
  params.set('source_lang', 'IT');
  params.set('target_lang', 'EN');
  params.set('tag_handling', 'xml');
  params.set('ignore_tags', 'keep');
  for (const t of payloadText) params.append('text', t);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    throw new Error(`DeepL API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const translations = (data.translations || []).map((t) => t.text);
  const [titleEn, descEn, bodyProtectedEn, ...tagsEn] = translations;

  const body = restoreTechnicalSegments(
    bodyProtectedEn || protectedBody,
    tokens,
    /<keep\s+id="(\d+)"\s*\/?>/g
  );

  return {
    title: titleEn || article.frontmatter.title,
    description: descEn || article.frontmatter.description,
    tags: tagsEn.map((t) => t.toLowerCase().replace(/\s+/g, '-')),
    body,
  };
}

async function gtxTranslate(text) {
  if (!text.trim()) return text;
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=en&dt=t&q=' +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
  const data = await res.json();
  return (data?.[0] || []).map((chunk) => chunk?.[0] || '').join('');
}

async function translateWithGoogleFree(article) {
  const { text: protectedBody, tokens } = protectTechnicalSegments(
    article.body,
    (idx) => `[[KEEP_${idx}]]`
  );

  // Chunk body by paragraphs (~1400 chars max per request)
  const paragraphs = protectedBody.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > 1400 && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);

  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await gtxTranslate(chunk));
  }

  const [titleEn, descEn] = await Promise.all([
    gtxTranslate(article.frontmatter.title),
    gtxTranslate(article.frontmatter.description),
  ]);

  const tagsList = Array.isArray(article.frontmatter.tags) ? article.frontmatter.tags : [];
  const tagsEn = await Promise.all(
    tagsList.map(async (tag) =>
      (await gtxTranslate(tag.replace(/-/g, ' ')))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
  );

  const body = restoreTechnicalSegments(
    translatedChunks.join('\n\n'),
    tokens,
    /\[\[\s*KEEP_(\d+)\s*\]\]/g
  );

  return {
    title: titleEn,
    description: descEn,
    tags: tagsEn.filter(Boolean),
    body,
  };
}

async function translateArticle(article) {
  if (process.env.GEMINI_API_KEY) {
    console.log(`  -> Using Gemini API`);
    try {
      return await translateWithGemini(article);
    } catch (err) {
      console.log(`::warning::Gemini ha fallito (${err.message.slice(0, 200)}). Uso il traduttore di riserva.`);
    }
  }
  if (process.env.DEEPL_API_KEY) {
    console.log(`  -> Using DeepL API`);
    try {
      return await translateWithDeepL(article);
    } catch (err) {
      console.log(`::warning::DeepL ha fallito (${err.message.slice(0, 200)}). Uso il traduttore di riserva.`);
    }
  }
  console.log(`  -> Using zero-key Google Translate fallback (set GEMINI_API_KEY or DEEPL_API_KEY for higher technical quality)`);
  return translateWithGoogleFree(article);
}

/** Verifica che la GEMINI_API_KEY sia valida con una mini-traduzione, senza toccare gli articoli. */
async function checkProvider() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('::notice::GEMINI_API_KEY non impostata: verrà usato il traduttore gratuito di riserva.');
    return;
  }
  try {
    const result = await translateWithGemini({
      frontmatter: {
        title: 'Cuscinetto volvente',
        description: 'Accoppiamento con interferenza albero-mozzo',
        tags: ['tribologia'],
      },
      body: 'La pressione di contatto $p_0$ raggiunge valori di gigapascal.',
    });
    console.log(`✅ GEMINI_API_KEY FUNZIONA (modello ${result.model})`);
    console.log(`   "Cuscinetto volvente" -> "${result.title}"`);
    console.log(`   "Accoppiamento con interferenza albero-mozzo" -> "${result.description}"`);
    console.log(`   Corpo -> "${result.body}"`);
  } catch (err) {
    const cleanMsg = String(err.message || err).replace(/\s+/g, ' ').slice(0, 350);
    console.log(`::warning::❌ GEMINI_API_KEY NON FUNZIONA: ${cleanMsg}`);
  }
}

async function main() {
  if (process.argv.includes('--check')) {
    await checkProvider();
    return;
  }
  await fs.mkdir(EN_DIR, { recursive: true });
  const entries = await fs.readdir(ARTICLES_DIR, { withFileTypes: true });
  const italianFiles = entries.filter((e) => e.isFile() && /\.mdx?$/.test(e.name));

  let translatedCount = 0;

  for (const entry of italianFiles) {
    const itPath = path.join(ARTICLES_DIR, entry.name);
    const enPath = path.join(EN_DIR, entry.name);
    const itRaw = await fs.readFile(itPath, 'utf8');
    const sourceHash = sha256Short(itRaw);
    const parsedIt = parseFrontmatter(itRaw);

    if (parsedIt.frontmatter.language && parsedIt.frontmatter.language !== 'it') {
      continue;
    }

    let existingEnRaw = null;
    try {
      existingEnRaw = await fs.readFile(enPath, 'utf8');
    } catch {
      existingEnRaw = null;
    }

    if (existingEnRaw) {
      const parsedEn = parseFrontmatter(existingEnRaw);
      if (SEED_ONLY && !parsedEn.frontmatter.sourceHash) {
        const updatedEn = existingEnRaw.replace(
          /\n---\r?\n/,
          `\nsourceHash: ${JSON.stringify(sourceHash)}\n---\n`
        );
        await fs.writeFile(enPath, updatedEn, 'utf8');
        console.log(`[seed] ${entry.name} -> sourceHash=${sourceHash}`);
        continue;
      }
      if (!FORCE && parsedEn.frontmatter.sourceHash === sourceHash) {
        console.log(`[skip] ${entry.name} (EN già aggiornata)`);
        continue;
      }
    }

    if (SEED_ONLY) continue;

    console.log(`[translate] ${entry.name}...`);
    try {
      const translated = await translateArticle({
        slug: entry.name.replace(/\.mdx?$/, ''),
        frontmatter: parsedIt.frontmatter,
        body: parsedIt.body,
      });

      const outMd = serializeEnglishMarkdown({
        frontmatter: parsedIt.frontmatter,
        translated,
        body: translated.body,
        sourceHash,
      });

      await fs.writeFile(enPath, outMd, 'utf8');
      translatedCount++;
      console.log(`[done] ${enPath}`);
    } catch (err) {
      console.error(`[warn] Traduzione fallita per ${entry.name}: ${err.message}`);
    }
  }

  console.log(`Traduzioni completate: ${translatedCount}`);
}

main();
