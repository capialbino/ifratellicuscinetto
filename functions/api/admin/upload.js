import {
  getAuthenticatedSession,
  getRepoConfig,
  githubRequest,
  jsonResponse,
  sanitizeFilename,
  sanitizeSlug,
} from '../../../lib/admin-server.js';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_BYTES = 10 * 1024 * 1024;
// Solo immagini raster sicure + modelli 3D binari glTF (.glb) con verifica magic bytes
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const ALLOWED_MODEL_EXTS = new Set(['.glb']);

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

  const isImage = ALLOWED_IMAGE_EXTS.has(ext);
  const isModel = ALLOWED_MODEL_EXTS.has(ext);

  if (!isImage && !isModel) {
    return jsonResponse(
      { error: 'Formato non consentito. Usa PNG, JPG, WebP, GIF, AVIF o modelli 3D .glb.' },
      400
    );
  }

  const contentBase64 = String(body?.contentBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');

  if (!contentBase64 || !/^[A-Za-z0-9+/=]+$/.test(contentBase64)) {
    return jsonResponse({ error: 'File vuoto o non valido.' }, 400);
  }

  // Verifica magic bytes "glTF" (base64: Z2xURg) per file .glb
  if (isModel && !contentBase64.startsWith('Z2xURg')) {
    return jsonResponse({ error: 'File .glb non valido (header glTF binario mancante).' }, 400);
  }

  const approxBytes = Math.floor((contentBase64.length * 3) / 4);
  const maxBytes = isModel ? MAX_MODEL_BYTES : MAX_IMAGE_BYTES;
  if (approxBytes > maxBytes) {
    return jsonResponse(
      { error: `File troppo grande (massimo ${isModel ? '10' : '4'} MB).` },
      413
    );
  }

  const { branch } = getRepoConfig(env);
  const stamp = Date.now();
  const repoPath = `public/uploads/${slug}/${stamp}-${filename}`;

  const putRes = await githubRequest(env, `/contents/${repoPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `carica ${isModel ? 'modello 3D' : 'immagine'} ${filename} per ${slug} (via admin)`,
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
