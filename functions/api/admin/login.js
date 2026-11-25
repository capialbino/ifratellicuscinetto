import {
  createSessionCookie,
  isBackendConfigured,
  jsonResponse,
  verifyCredentials,
} from '../../../lib/admin-server.js';

export async function onRequestPost({ request, env }) {
  if (!isBackendConfigured(env)) {
    return jsonResponse(
      {
        error:
          'Variabili ambiente mancanti su Cloudflare Pages (servono GITHUB_TOKEN e ADMIN_PASSWORD o ADMIN_PASSWORDS).',
      },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const author = String(body?.author || '').trim();
  const password = String(body?.password || '');

  if (!verifyCredentials(env, author, password)) {
    return jsonResponse({ error: 'Autore o password non corretti.' }, 401);
  }

  const cookie = await createSessionCookie(request, env, author);
  return jsonResponse(
    { ok: true, author },
    200,
    { 'Set-Cookie': cookie }
  );
}
