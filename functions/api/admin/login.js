import {
  createSessionCookie,
  isBackendConfigured,
  jsonResponse,
  normalizeAuthorId,
  verifyCredentials,
} from '../../../lib/admin-server.js';

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

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const author = normalizeAuthorId(body?.author);
  const password = String(body?.password || '');

  if (!verifyCredentials(env, author, password)) {
    return jsonResponse({ error: 'Utente o password non corretti.' }, 401);
  }

  const cookie = await createSessionCookie(request, env, author);
  return jsonResponse(
    { ok: true, author },
    200,
    { 'Set-Cookie': cookie }
  );
}
