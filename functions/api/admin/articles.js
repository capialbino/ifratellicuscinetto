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
import { generateFastJson } from '../../../lib/gemini-fast.js';

async function requireAuth(request, env) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return { error: jsonResponse({ error: 'Non autenticato.' }, 401) };
  }
  return { session };
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
      const prompt = [
        'SEO engineer per blog tecnico italiano (meccanica & AI).',
        'Genera JSON compatto: {"description":"meta description SEO 120-158 caratteri","tags":["3-5 tag italiani minuscoli con trattini"]}.',
        `TITOLO: ${payload.title}`,
        `CATEGORIA: ${payload.category}`,
        'ESTRATTO:',
        payload.body.slice(0, 3500),
      ].join('\n');

      const { parsed } = await generateFastJson({
        apiKey,
        envModel: env.GEMINI_MODEL,
        tier: 'lite',
        prompt,
        temperature: 0.15,
        maxOutputTokens: 256,
      });

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
    } catch {
      // Fallback silenzioso per non bloccare mai la pubblicazione
    }
  }

  return {
    description: payload.description || fallbackDescription(payload.body, payload.title),
    tags: payload.tags.length > 0 ? payload.tags : [payload.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
  };
}

async function fetchArticlesViaGraphQL(env, repo, branch) {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;

  const query = `
    query($owner: String!, $name: String!, $itExpr: String!, $enExpr: String!) {
      repository(owner: $owner, name: $name) {
        itDir: object(expression: $itExpr) {
          ... on Tree {
            entries {
              name
              type
              oid
              object {
                ... on Blob {
                  text
                }
              }
            }
          }
        }
        enDir: object(expression: $enExpr) {
          ... on Tree {
            entries {
              name
              type
            }
          }
        }
      }
    }
  `;

  let res;
  let json;
  try {
    res = await githubRequest(env, 'https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          name,
          itExpr: `${branch}:src/content/articles`,
          enExpr: `${branch}:src/content/articles/en`,
        },
      }),
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }
  if (json?.errors || !json?.data?.repository?.itDir?.entries) return null;

  const enSlugs = new Set(
    (json.data.repository.enDir?.entries || [])
      .filter((e) => e.type === 'blob' && /\.mdx?$/.test(e.name))
      .map((e) => e.name.replace(/\.mdx?$/, ''))
  );

  return json.data.repository.itDir.entries
    .filter((e) => e.type === 'blob' && /\.mdx?$/.test(e.name) && typeof e.object?.text === 'string')
    .map((entry) => {
      const { frontmatter, body } = parseMarkdownDocument(entry.object.text);
      const slug = entry.name.replace(/\.mdx?$/, '');
      return {
        slug,
        path: `src/content/articles/${entry.name}`,
        sha: entry.oid,
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
    });
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const { repo, branch } = getRepoConfig(env);

  // Singola query GraphQL (evita il limite di 50 subrequest su Cloudflare Workers Free)
  const graphqlArticles = await fetchArticlesViaGraphQL(env, repo, branch);
  if (graphqlArticles) {
    graphqlArticles.sort((a, b) => (b.frontmatter.pubDate || '').localeCompare(a.frontmatter.pubDate || ''));
    return jsonResponse({ articles: graphqlArticles });
  }

  // Fallback REST se GraphQL non risponde
  const [itListRes, enListRes] = await Promise.all([
    githubRequest(env, `/contents/src/content/articles?ref=${encodeURIComponent(branch)}`),
    githubRequest(env, `/contents/src/content/articles/en?ref=${encodeURIComponent(branch)}`),
  ]);

  if (!itListRes.ok) {
    return jsonResponse({ error: 'Errore nel caricamento degli articoli da GitHub.' }, itListRes.status);
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
    payload = validateArticlePayload(raw, auth.session.author);
  } catch (err) {
    return jsonResponse({ error: err.message || 'Dati articolo non validi.' }, 400);
  }

  const { branch } = getRepoConfig(env);
  let path = `src/content/articles/${payload.slug}.md`;

  const currentSha = payload.sha;
  if (!currentSha) {
    const [checkMd, checkMdx] = await Promise.all([
      githubRequest(env, `/contents/src/content/articles/${payload.slug}.md?ref=${encodeURIComponent(branch)}`),
      githubRequest(env, `/contents/src/content/articles/${payload.slug}.mdx?ref=${encodeURIComponent(branch)}`),
    ]);
    if (checkMd.ok || checkMdx.ok) {
      return jsonResponse(
        { error: 'Esiste già un articolo con questo titolo/slug. Modifica quello esistente oppure cambia titolo.' },
        409
      );
    }
  } else {
    // Se stiamo aggiornando un .mdx esistente, mantieni l'estensione originale invece di creare un duplicato .md
    const checkMdx = await githubRequest(
      env,
      `/contents/src/content/articles/${payload.slug}.mdx?ref=${encodeURIComponent(branch)}`
    );
    if (checkMdx.ok) {
      path = `src/content/articles/${payload.slug}.mdx`;
    }
  }

  const seo = await generateAutoSeoAndTags(env, payload);
  payload.description = seo.description;
  payload.tags = seo.tags;

  const markdown = serializeArticleMarkdown(payload);
  const commitBody = {
    message: currentSha
      ? `aggiorna articolo: ${payload.slug} (admin: ${auth.session.author})`
      : `pubblica articolo: ${payload.slug} (admin: ${auth.session.author})`,
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
    return jsonResponse({ error: 'Errore durante il salvataggio su GitHub.' }, putRes.status);
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
  let itPath = `src/content/articles/${slug}.md`;
  let itGet = await githubRequest(env, `/contents/${itPath}?ref=${encodeURIComponent(branch)}`);
  if (!itGet.ok) {
    itPath = `src/content/articles/${slug}.mdx`;
    itGet = await githubRequest(env, `/contents/${itPath}?ref=${encodeURIComponent(branch)}`);
  }
  if (!itGet.ok) {
    return jsonResponse({ error: 'Articolo non trovato su GitHub.' }, 404);
  }
  const itData = await itGet.json();
  const enPath = `src/content/articles/en/${slug}.md`;

  const delIt = await githubRequest(env, `/contents/${itPath}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `elimina articolo: ${slug} (admin: ${auth.session.author})`,
      sha: itData.sha,
      branch,
    }),
  });

  if (!delIt.ok) {
    return jsonResponse({ error: 'Errore durante l\'eliminazione su GitHub.' }, delIt.status);
  }

  // Elimina anche eventuale traduzione inglese associata (.md o .mdx)
  for (const enCandidate of [
    `src/content/articles/en/${slug}.md`,
    `src/content/articles/en/${slug}.mdx`,
  ]) {
    const enGet = await githubRequest(env, `/contents/${enCandidate}?ref=${encodeURIComponent(branch)}`);
    if (enGet.ok) {
      const enData = await enGet.json();
      await githubRequest(env, `/contents/${enCandidate}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `elimina traduzione EN: ${slug} (admin: ${auth.session.author})`,
          sha: enData.sha,
          branch,
        }),
      });
    }
  }

  // Elimina anche eventuale cover SVG associata
  const coverPath = `public/covers/${slug}.svg`;
  const coverGet = await githubRequest(env, `/contents/${coverPath}?ref=${encodeURIComponent(branch)}`);
  if (coverGet.ok) {
    const coverData = await coverGet.json();
    await githubRequest(env, `/contents/${coverPath}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `elimina cover SVG: ${slug} (admin: ${auth.session.author})`,
        sha: coverData.sha,
        branch,
      }),
    });
  }

  return jsonResponse({ ok: true, slug });
}
