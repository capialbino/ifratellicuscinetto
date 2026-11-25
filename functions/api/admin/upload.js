import {
  getAuthenticatedSession,
  getRepoConfig,
  githubRequest,
  jsonResponse,
  sanitizeFilename,
  sanitizeSlug,
} from '../../../lib/admin-server.js';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// Solo immagini raster sicure (esclude SVG/HTML/JS per eliminare rischi di stored XSS)
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

export async function onRequestPost({ request, env }) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Non autenticato.' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const slug = sanitizeSlug(body?.slug || 'articoli') || 'articoli';
  const filename = sanitizeFilename(body?.filename || 'immagine.png');
  const extMatch = filename.match(/(\.[a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  if (!ALLOWED_EXTS.has(ext)) {
    return jsonResponse(
      { error: 'Formato non consentito. Usa solo PNG, JPG, WebP, GIF o AVIF.' },
      400
    );
  }

  const contentBase64 = String(body?.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');

  if (!contentBase64 || !/^[A-Za-z0-9+/=\s]+$/.test(contentBase64)) {
    return jsonResponse({ error: 'Immagine vuota o non valida.' }, 400);
  }

  const approxBytes = Math.floor((contentBase64.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'Immagine troppo grande (massimo 4 MB).' }, 413);
  }

  const { branch } = getRepoConfig(env);
  const stamp = Date.now();
  const repoPath = `public/uploads/${slug}/${stamp}-${filename}`;

  const putRes = await githubRequest(env, `/contents/${repoPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `carica immagine ${filename} per ${slug} (via admin)`,
      content: contentBase64,
      branch,
    }),
  });

  if (!putRes.ok) {
    return jsonResponse({ error: 'Errore durante il caricamento su GitHub.' }, putRes.status);
  }

  return jsonResponse({
    ok: true,
    url: `/uploads/${slug}/${stamp}-${filename}`,
    repoPath,
  });
}
