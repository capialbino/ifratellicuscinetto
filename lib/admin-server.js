export const VALID_AUTHORS = new Set(['federico-pappafava', 'alessandro-rossi', 'alessandro-capialbi']);
export const VALID_CATEGORIES = new Set(['Meccanica', 'AI & Software', 'Meccatronica & Hybrid']);
export const VALID_LEVELS = new Set(['Divulgativo', 'Intermedio', 'Tecnico / Avanzato']);
const SESSION_COOKIE = 'ifc_admin_session';
// Finestra sliding di 14 giorni con durata massima assoluta di 30 giorni dal login
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const SESSION_MAX_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

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

export async function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const aBytes = new Uint8Array(aHash);
  const bBytes = new Uint8Array(bHash);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function getSessionSecret(env) {
  if (typeof env.ADMIN_SESSION_SECRET === 'string' && env.ADMIN_SESSION_SECRET.length >= 16) {
    return env.ADMIN_SESSION_SECRET;
  }
  return null;
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

export async function createSessionCookie(request, env, author, existingIat) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('ADMIN_SESSION_SECRET non configurato (minimo 16 caratteri).');

  const nowSec = Math.floor(Date.now() / 1000);
  const iat =
    typeof existingIat === 'number' && Number.isFinite(existingIat) && existingIat <= nowSec
      ? existingIat
      : nowSec;
  const maxExp = iat + SESSION_MAX_LIFETIME_SECONDS;
  const exp = Math.min(nowSec + SESSION_TTL_SECONDS, maxExp);
  const maxAge = Math.max(0, exp - nowSec);

  const payload = {
    author,
    iat,
    exp,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;

  const isHttps = new URL(request.url).protocol === 'https:';
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const parts = [`${SESSION_COOKIE}=`, 'Path=/api/admin', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
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
  if (!(await constantTimeEqual(providedSig, expectedSig))) return null;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload)));
    if (!payload || !VALID_AUTHORS.has(payload.author)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < nowSec) {
      return null;
    }
    if (typeof payload.iat === 'number') {
      if (!Number.isFinite(payload.iat) || nowSec - payload.iat > SESSION_MAX_LIFETIME_SECONDS) {
        return null;
      }
      return { author: payload.author, iat: payload.iat };
    }
    // Retrocompatibilità per cookie emessi prima dell'introduzione di iat
    return { author: payload.author, iat: nowSec };
  } catch {
    return null;
  }
}

export function isBackendConfigured(env) {
  return Boolean(
    env.GITHUB_TOKEN &&
      (env.ADMIN_PASSWORD || env.ADMIN_PASSWORDS) &&
      getSessionSecret(env)
  );
}

export function normalizeAuthorId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return VALID_AUTHORS.has(cleaned) ? cleaned : '';
}

export async function verifyCredentials(env, rawAuthor, password) {
  const author = normalizeAuthorId(rawAuthor);
  if (!author || typeof password !== 'string' || !password) {
    return false;
  }
  if (env.ADMIN_PASSWORDS) {
    try {
      const map = JSON.parse(env.ADMIN_PASSWORDS);
      const expected = map?.[author];
      if (typeof expected === 'string' && expected.length > 0) {
        return await constantTimeEqual(password, expected);
      }
      return false;
    } catch {
      return false;
    }
  }
  if (env.ADMIN_PASSWORD) {
    return await constantTimeEqual(password, env.ADMIN_PASSWORD);
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
    .replace(/\.{2,}/g, '.')
    .replace(/^-+|-+$/g, '')
    .replace(/^\.+/, '');
  if (!cleaned) return 'image.png';
  if (cleaned.length <= 100) return cleaned;
  const extMatch = cleaned.match(/(\.[a-z0-9]{1,10})$/);
  const ext = extMatch ? extMatch[1] : '';
  const base = cleaned.slice(0, Math.max(1, 100 - ext.length)).replace(/-+$/, '');
  return `${base || 'file'}${ext}`;
}

export function validateArticlePayload(input, defaultAuthor = '') {
  if (!input || typeof input !== 'object') {
    throw new Error('Dati articolo non validi.');
  }
  const slug = sanitizeSlug(input.slug || input.title);
  if (!slug) throw new Error('Slug o titolo non valido.');

  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const body = String(input.body || '').trim();
  if (!title || !body) {
    throw new Error('Titolo e contenuto sono obbligatori.');
  }
  if (body.length > 100000) {
    throw new Error('Contenuto troppo lungo (massimo 100.000 caratteri).');
  }

  const author = VALID_AUTHORS.has(input.author)
    ? input.author
    : VALID_AUTHORS.has(defaultAuthor)
      ? defaultAuthor
      : '';
  if (!author) {
    throw new Error('Autore non valido.');
  }
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
  const rawCover = String(input.coverImage || '').trim();
  const coverImage =
    rawCover &&
    !rawCover.includes('..') &&
    /^\/(uploads|covers)\/[a-zA-Z0-9._/-]+$/.test(rawCover)
      ? rawCover
      : '';
  const sha = typeof input.sha === 'string' && input.sha ? input.sha : undefined;

  return { slug, title, description, pubDate, author, category, tags, level, draft, coverImage, body, sha };
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
    ...(article.coverImage ? [`coverImage: ${JSON.stringify(article.coverImage)}`] : []),
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

export function parseMarkdownDocument(rawText) {
  const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: rawText };
  }
  const yamlBlock = match[1];
  const body = match[2].replace(/^\r?\n/, '');
  const frontmatter = {};
  let currentListKey = null;

  for (const line of yamlBlock.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      if (!Array.isArray(frontmatter[currentListKey])) {
        frontmatter[currentListKey] = [];
      }
      const itemVal = stripInlineComment(listMatch[1]);
      if (itemVal) {
        frontmatter[currentListKey].push(unquoteYaml(itemVal));
      }
      continue;
    }

    currentListKey = null;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const rawVal = stripInlineComment(line.slice(idx + 1));
    if (rawVal === '') {
      frontmatter[key] = '';
      currentListKey = key;
    } else if (rawVal === 'true') {
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
