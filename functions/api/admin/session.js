import {
  createSessionCookie,
  getAuthenticatedSession,
  isBackendConfigured,
  jsonResponse,
} from '../../../lib/admin-server.js';

export async function onRequestGet({ request, env }) {
  const configured = isBackendConfigured(env);
  const session = configured ? await getAuthenticatedSession(request, env) : null;

  const extraHeaders = {};
  if (session) {
    // Rinnova automaticamente la scadenza (sliding session) entro il limite massimo assoluto
    extraHeaders['Set-Cookie'] = await createSessionCookie(request, env, session.author, session.iat);
  }

  return jsonResponse(
    {
      mode: 'cloudflare',
      configured,
      authenticated: Boolean(session),
      author: session?.author ?? null,
    },
    200,
    extraHeaders
  );
}
