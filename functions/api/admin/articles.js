import {
  base64ToUtf8,
  getAuthenticatedSession,
  getRepoConfig,
  githubRequest,
  jsonResponse,
  parseMarkdownDocument,
  sanitizeSlug,
  serializeArticleMarkdown,
  utf8ToBase64,
  validateArticlePayload,
} from '../../../lib/admin-server.js';

async function requireAuth(request, env) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return { error: jsonResponse({ error: 'Non autenticato.' }, 401) };
  }
  return { session };
}

let cachedSeoModel = null;

async function resolveSeoGeminiModel(apiKey, envModel) {
  if (envModel) return String(envModel).replace(/^models\//, '');
  if (cachedSeoModel) return cachedSeoModel;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
  );
  if (!res.ok) return null;
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
  const picked =
    candidates.find((id) => id === 'gemini-flash-latest') ||
    candidates.filter((id) => /flash/i.test(id) && !/lite/i.test(id)).sort().at(-1) ||
    candidates.filter((id) => /flash/i.test(id)).sort().at(-1) ||
    candidates.sort().at(-1) ||
    null;
  cachedSeoModel = picked;
  return picked;
}

function fallbackDescription(body, title) {
  const plain = String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return title;
  return plain.length > 155 ? `${plain.slice(0, 152).trim()}...` : plain;
}

async function generateAutoSeoAndTags(env, payload) {
  const apiKey = env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const model = await resolveSeoGeminiModel(apiKey, env.GEMINI_MODEL);
      if (model) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const prompt = [
          'Sei un SEO engineer specializzato in divulgazione tecnica di ingegneria meccanica e intelligenza artificiale.',
          'Dato questo articolo italiano, genera SOLO un JSON con:',
          '- "description": meta description SEO autorevole e chiara in italiano (120-158 caratteri, nessuna virgoletta superflua).',
          '- "tags": array di 3-5 tag tecnici italiani in minuscolo con trattini (es. ["cuscinetti", "tribologia", "manutenzione-predittiva"]).',
          '',
          `TITOLO: ${payload.title}`,
          `CATEGORIA: ${payload.category}`,
          'TESTO:',
          payload.body.slice(0, 12000),
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

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            const desc = typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 180) : '';
            const tags = Array.isArray(parsed.tags)
              ? parsed.tags
                  .map((t) =>
                    String(t)
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                  )
                  .filter(Boolean)
                  .slice(0, 5)
              : [];
            return {
              description: desc || payload.description || fallbackDescription(payload.body, payload.title),
              tags: tags.length > 0 ? tags : payload.tags,
            };
          }
        }
      }
    } catch {
      // Fallback silenzioso per non bloccare mai la pubblicazione
    }
  }

  return {
    description: payload.description || fallbackDescription(payload.body, payload.title),
    tags: payload.tags.length > 0 ? payload.tags : [payload.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
  };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const { branch } = getRepoConfig(env);

  const [itListRes, enListRes] = await Promise.all([
    githubRequest(env, `/contents/src/content/articles?ref=${encodeURIComponent(branch)}`),
    githubRequest(env, `/contents/src/content/articles/en?ref=${encodeURIComponent(branch)}`),
  ]);

  if (!itListRes.ok) {
    const errText = await itListRes.text();
    return jsonResponse({ error: `Errore GitHub: ${errText}` }, itListRes.status);
  }

  const itEntries = await itListRes.json();
  const enEntries = enListRes.ok ? await enListRes.json() : [];

  const enSlugs = new Set(
    (Array.isArray(enEntries) ? enEntries : [])
      .filter((f) => f.type === 'file' && /\.mdx?$/.test(f.name))
      .map((f) => f.name.replace(/\.mdx?$/, ''))
  );

  const mdFiles = (Array.isArray(itEntries) ? itEntries : []).filter(
    (f) => f.type === 'file' && /\.mdx?$/.test(f.name)
  );

  const articles = await Promise.all(
    mdFiles.map(async (file) => {
      const fileRes = await githubRequest(
        env,
        `/contents/${file.path}?ref=${encodeURIComponent(branch)}`
      );
      if (!fileRes.ok) return null;
      const fileJson = await fileRes.json();
      const raw = base64ToUtf8(fileJson.content || '');
      const { frontmatter, body } = parseMarkdownDocument(raw);
      const slug = file.name.replace(/\.mdx?$/, '');
      return {
        slug,
        path: file.path,
        sha: fileJson.sha,
        hasEnglish: enSlugs.has(slug),
        frontmatter: {
          title: frontmatter.title || slug,
          description: frontmatter.description || '',
          pubDate: String(frontmatter.pubDate || '').slice(0, 10),
          author: frontmatter.author || 'alessandro-capialbi',
          category: frontmatter.category || 'Meccatronica & Hybrid',
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          level: frontmatter.level || 'Intermedio',
          draft: Boolean(frontmatter.draft),
          coverImage: frontmatter.coverImage || '',
        },
        body,
      };
    })
  );

  const valid = articles
    .filter(Boolean)
    .sort((a, b) => (b.frontmatter.pubDate || '').localeCompare(a.frontmatter.pubDate || ''));

  return jsonResponse({ articles: valid });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  let payload;
  try {
    const raw = await request.json();
    payload = validateArticlePayload(raw);
  } catch (err) {
    return jsonResponse({ error: err.message || 'Dati articolo non validi.' }, 400);
  }

  const { branch } = getRepoConfig(env);
  const path = `src/content/articles/${payload.slug}.md`;

  let currentSha = payload.sha;
  if (!currentSha) {
    const checkRes = await githubRequest(
      env,
      `/contents/${path}?ref=${encodeURIComponent(branch)}`
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      currentSha = existing.sha;
    }
  }

  const seo = await generateAutoSeoAndTags(env, payload);
  payload.description = seo.description;
  payload.tags = seo.tags;

  const markdown = serializeArticleMarkdown(payload);
  const commitBody = {
    message: currentSha
      ? `aggiorna articolo: ${payload.slug} (via admin)`
      : `pubblica articolo: ${payload.slug} (via admin)`,
    content: utf8ToBase64(markdown),
    branch,
    ...(currentSha ? { sha: currentSha } : {}),
  };

  const putRes = await githubRequest(env, `/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commitBody),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return jsonResponse({ error: `Errore salvataggio GitHub: ${errText}` }, putRes.status);
  }

  const result = await putRes.json();
  return jsonResponse({
    ok: true,
    slug: payload.slug,
    sha: result?.content?.sha,
    path,
  });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const slug = sanitizeSlug(body?.slug);
  if (!slug) return jsonResponse({ error: 'Slug non valido.' }, 400);

  const { branch } = getRepoConfig(env);
  const itPath = `src/content/articles/${slug}.md`;
  const enPath = `src/content/articles/en/${slug}.md`;

  const itGet = await githubRequest(env, `/contents/${itPath}?ref=${encodeURIComponent(branch)}`);
  if (!itGet.ok) {
    return jsonResponse({ error: 'Articolo non trovato su GitHub.' }, 404);
  }
  const itData = await itGet.json();

  const delIt = await githubRequest(env, `/contents/${itPath}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `elimina articolo: ${slug} (via admin)`,
      sha: itData.sha,
      branch,
    }),
  });

  if (!delIt.ok) {
    const errText = await delIt.text();
    return jsonResponse({ error: `Errore eliminazione: ${errText}` }, delIt.status);
  }

  // Elimina anche eventuale traduzione inglese associata
  const enGet = await githubRequest(env, `/contents/${enPath}?ref=${encodeURIComponent(branch)}`);
  if (enGet.ok) {
    const enData = await enGet.json();
    await githubRequest(env, `/contents/${enPath}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `elimina traduzione EN: ${slug} (via admin)`,
        sha: enData.sha,
        branch,
      }),
    });
  }

  return jsonResponse({ ok: true, slug });
}
