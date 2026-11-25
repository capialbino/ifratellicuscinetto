const VALID_AUTHORS = new Set(['federico-pappafava', 'alessandro-rossi', 'alessandro-capialbi']);
const VALID_CATEGORIES = new Set(['Meccanica', 'AI & Software', 'Meccatronica & Hybrid']);
const VALID_LEVELS = new Set(['Divulgativo', 'Intermedio', 'Tecnico / Avanzato']);
const SESSION_COOKIE = 'ifc_admin_session';
// 400 giorni (massimo consentito dai browser moderni) con rinnovo automatico a ogni accesso
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 400;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function utf8ToBase64(text) {
  const bytes = encoder.encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToUtf8(base64) {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return decoder.decode(bytes);
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function getSessionSecret(env) {
  if (env.ADMIN_SESSION_SECRET) return env.ADMIN_SESSION_SECRET;
  const fallback = `${env.ADMIN_PASSWORDS || env.ADMIN_PASSWORD || ''}:${env.GITHUB_TOKEN || ''}`;
  return fallback.length > 4 ? fallback : '';
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSessionCookie(request, env, author) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('ADMIN_SESSION_SECRET or ADMIN_PASSWORD not configured.');

  const payload = {
    author,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;

  const isHttps = new URL(request.url).protocol === 'https:';
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

export async function getAuthenticatedSession(request, env) {
  const secret = getSessionSecret(env);
  const token = getCookie(request, SESSION_COOKIE);
  if (!secret || !token) return null;

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encodedPayload = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  const expectedSig = await hmacSign(encodedPayload, secret);
  if (!constantTimeEqual(providedSig, expectedSig)) return null;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));
    if (!payload || !VALID_AUTHORS.has(payload.author)) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { author: payload.author };
  } catch {
    return null;
  }
}

export function isBackendConfigured(env) {
  return Boolean(env.GITHUB_TOKEN && (env.ADMIN_PASSWORD || env.ADMIN_PASSWORDS));
}

export function normalizeAuthorId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return VALID_AUTHORS.has(cleaned) ? cleaned : '';
}

export function verifyCredentials(env, rawAuthor, password) {
  const author = normalizeAuthorId(rawAuthor);
  if (!author || typeof password !== 'string' || !password) {
    return false;
  }
  if (env.ADMIN_PASSWORDS) {
    try {
      const map = JSON.parse(env.ADMIN_PASSWORDS);
      const expected = map?.[author];
      if (typeof expected === 'string' && expected.length > 0) {
        return constantTimeEqual(password, expected);
      }
      return false;
    } catch {
      return false;
    }
  }
  if (env.ADMIN_PASSWORD) {
    return constantTimeEqual(password, env.ADMIN_PASSWORD);
  }
  return false;
}

export function getRepoConfig(env) {
  const repo = env.GITHUB_REPO || 'capialbino/ifratellicuscinetto';
  const branch = env.GITHUB_BRANCH || 'main';
  return { repo, branch };
}

export async function githubRequest(env, apiPath, init = {}) {
  const { repo } = getRepoConfig(env);
  const url = apiPath.startsWith('https://')
    ? apiPath
    : `https://api.github.com/repos/${repo}${apiPath}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'ifratellicuscinetto-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });

  return response;
}

export function sanitizeSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function sanitizeFilename(raw) {
  const cleaned = String(raw || 'image.png')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'image.png';
}

export function validateArticlePayload(input) {
  const slug = sanitizeSlug(input.slug || input.title);
  if (!slug) throw new Error('Slug o titolo non valido.');

  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const body = String(input.body || '').trim();
  if (!title || !description || !body) {
    throw new Error('Titolo, descrizione e contenuto sono obbligatori.');
  }

  const author = VALID_AUTHORS.has(input.author) ? input.author : 'alessandro-capialbi';
  const category = VALID_CATEGORIES.has(input.category) ? input.category : 'Meccatronica & Hybrid';
  const level = VALID_LEVELS.has(input.level) ? input.level : 'Intermedio';

  const pubDateRaw = String(input.pubDate || '').trim();
  const pubDate = /^\d{4}-\d{2}-\d{2}$/.test(pubDateRaw)
    ? pubDateRaw
    : new Date().toISOString().slice(0, 10);

  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(input.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  const draft = Boolean(input.draft);
  const sha = typeof input.sha === 'string' && input.sha ? input.sha : undefined;

  return { slug, title, description, pubDate, author, category, tags, level, draft, body, sha };
}

export function serializeArticleMarkdown(article) {
  const tagsYaml = JSON.stringify(article.tags);
  const lines = [
    '---',
    'language: "it"',
    `title: ${JSON.stringify(article.title)}`,
    `description: ${JSON.stringify(article.description)}`,
    `pubDate: ${article.pubDate}`,
    `author: ${JSON.stringify(article.author)}`,
    `category: ${JSON.stringify(article.category)}`,
    `tags: ${tagsYaml}`,
    `level: ${JSON.stringify(article.level)}`,
    `draft: ${article.draft ? 'true' : 'false'}`,
    '---',
    '',
    article.body.trim(),
    '',
  ];
  return lines.join('\n');
}

function unquoteYaml(val) {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseMarkdownDocument(rawText) {
  const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: rawText };
  }
  const yamlBlock = match[1];
  const body = match[2].replace(/^\r?\n/, '');
  const frontmatter = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const rawVal = line.slice(idx + 1).trim();
    if (rawVal === 'true') {
      frontmatter[key] = true;
    } else if (rawVal === 'false') {
      frontmatter[key] = false;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      try {
        frontmatter[key] = JSON.parse(rawVal);
      } catch {
        frontmatter[key] = rawVal
          .slice(1, -1)
          .split(',')
          .map((s) => unquoteYaml(s))
          .filter(Boolean);
      }
    } else {
      frontmatter[key] = unquoteYaml(rawVal);
    }
  }

  return { frontmatter, body };
}
