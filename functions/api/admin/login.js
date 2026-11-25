import {
  createSessionCookie,
  isBackendConfigured,
  jsonResponse,
  normalizeAuthorId,
  verifyCredentials,
} from '../../../lib/admin-server.js';

const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000; // 5 minuti
const failedByIp = new Map();

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function evictExpiredRateStates(now) {
  if (failedByIp.size <= 200) return;
  for (const [key, rec] of failedByIp.entries()) {
    if (now - rec.firstAt > WINDOW_MS) {
      failedByIp.delete(key);
    }
  }
}

function getRateState(ip, now) {
  const rec = failedByIp.get(ip);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    return { count: 0, firstAt: now };
  }
  return rec;
}

export async function onRequestPost({ request, env }) {
  if (!isBackendConfigured(env)) {
    return jsonResponse(
      {
        error:
          'Configurazione server incompleta (verifica i secrets GITHUB_TOKEN e ADMIN_PASSWORD / ADMIN_PASSWORDS).',
      },
      503
    );
  }

  const now = Date.now();
  evictExpiredRateStates(now);
  const ip = getClientIp(request);
  const state = getRateState(ip, now);

  if (state.count >= MAX_FAILED_ATTEMPTS) {
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
    failedByIp.set(ip, { count: state.count + 1, firstAt: state.firstAt });
    // Piccola pausa anti brute-force
    await new Promise((r) => setTimeout(r, 400));
    return jsonResponse({ error: 'Username o password non corretti.' }, 401);
  }

  failedByIp.delete(ip);
  const cookie = await createSessionCookie(request, env, author);
  return jsonResponse(
    { ok: true, author },
    200,
    { 'Set-Cookie': cookie }
  );
}
