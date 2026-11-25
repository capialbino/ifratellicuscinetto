import {
  base64ToUtf8,
  getAuthenticatedSession,
  getRepoConfig,
  githubRequest,
  jsonResponse,
  utf8ToBase64,
} from '../../../lib/admin-server.js';

const CONFIG_PATH = 'src/data/site-config.json';

async function requireAuth(request, env) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return { error: jsonResponse({ error: 'Non autenticato.' }, 401) };
  }
  return { session };
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  const { branch } = getRepoConfig(env);
  const res = await githubRequest(
    env,
    `/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`
  );
  if (!res.ok) {
    const errText = await res.text();
    return jsonResponse({ error: `Errore lettura config: ${errText}` }, res.status);
  }

  const file = await res.json();
  const config = JSON.parse(base64ToUtf8(file.content || '{}'));
  return jsonResponse({ config, sha: file.sha });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'JSON non valido.' }, 400);
  }

  const config = body?.config;
  if (!config || typeof config !== 'object' || !config.theme || !config.hero || !config.brand) {
    return jsonResponse({ error: 'Struttura configurazione non valida.' }, 400);
  }

  const { branch } = getRepoConfig(env);
  let sha = body?.sha;
  if (!sha) {
    const check = await githubRequest(
      env,
      `/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`
    );
    if (check.ok) {
      sha = (await check.json()).sha;
    }
  }

  const content = `${JSON.stringify(config, null, 2)}\n`;
  const putRes = await githubRequest(env, `/contents/${CONFIG_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'style: aggiorna design e testi sito (via admin)',
      content: utf8ToBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return jsonResponse({ error: `Errore salvataggio config: ${errText}` }, putRes.status);
  }

  const result = await putRes.json();
  return jsonResponse({ ok: true, sha: result?.content?.sha });
}
