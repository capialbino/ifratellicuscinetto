import {
  createSessionCookie,
  isBackendConfigured,
  jsonResponse,
  normalizeAuthorId,
  verifyCredentials,
} from '../../../lib/admin-server.js';

const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000; // 5 minuti
const MAX_TRACKED_IPS = 200;
const failedByIp = new Map();

function getClientIp(request) {
  const ip = request.headers.get('CF-Connecting-IP');
  return ip ? ip.trim() : null;
}

function evictRateStates(now) {
  if (failedByIp.size <= MAX_TRACKED_IPS) return;
  for (const [key, rec] of failedByIp.entries()) {
    if (now - rec.firstAt > WINDOW_MS) {
      failedByIp.delete(key);
    }
  }
  while (failedByIp.size > MAX_TRACKED_IPS) {
    const oldestKey = failedByIp.keys().next().value;
    if (oldestKey === undefined) break;
    failedByIp.delete(oldestKey);
  }
}

function getRateState(ip, now) {
  if (!ip) return { count: 0, firstAt: now };
  const rec = failedByIp.get(ip);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    return { count: 0, firstAt: now };
  }
  return rec;
}

function recordFailedAttempt(ip, state, now) {
  if (!ip) return;
  failedByIp.delete(ip);
  failedByIp.set(ip, { count: state.count + 1, firstAt: state.firstAt });
  evictRateStates(now);
}

export async function onRequestPost({ request, env }) {
  if (!isBackendConfigured(env)) {
    return jsonResponse(
      {
        error:
          'Configurazione server incompleta (verifica i secrets GITHUB_TOKEN, ADMIN_SESSION_SECRET e ADMIN_PASSWORD / ADMIN_PASSWORDS).',
      },
      503
    );
  }

  const now = Date.now();
  evictRateStates(now);
  const ip = getClientIp(request);
  const state = getRateState(ip, now);

  if (ip && state.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((state.firstAt + WINDOW_MS - now) / 1000));
    return jsonResponse(
      { error: `Troppi tentativi falliti. Riprova tra ${Math.ceil(retryAfterSec / 60)} minuti.` },
      429,
      { 'Retry-After': String(retryAfterSec) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const author = normalizeAuthorId(body?.author);
  const password = String(body?.password || '');

  if (!(await verifyCredentials(env, author, password))) {
    recordFailedAttempt(ip, state, now);
    // Piccola pausa anti brute-force
    await new Promise((r) => setTimeout(r, 400));
    return jsonResponse({ error: 'Username o password non corretti.' }, 401);
  }

  if (ip) failedByIp.delete(ip);
  const cookie = await createSessionCookie(request, env, author);
  return jsonResponse(
    { ok: true, author },
    200,
    { 'Set-Cookie': cookie }
  );
}
