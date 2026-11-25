import {
  getAuthenticatedSession,
  isBackendConfigured,
  jsonResponse,
} from '../../../lib/admin-server.js';

export async function onRequestGet({ request, env }) {
  const configured = isBackendConfigured(env);
  const session = configured ? await getAuthenticatedSession(request, env) : null;

  return jsonResponse({
    mode: 'cloudflare',
    configured,
    authenticated: Boolean(session),
    author: session?.author ?? null,
  });
}
