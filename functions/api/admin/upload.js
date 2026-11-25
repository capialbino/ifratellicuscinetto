import {
  getAuthenticatedSession,
  getRepoConfig,
  githubRequest,
  jsonResponse,
  sanitizeFilename,
  sanitizeSlug,
} from '../../../lib/admin-server.js';

const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
// Solo immagini raster sicure + modelli 3D binari glTF (.glb) + video MP4/WebM con verifica magic bytes
const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const ALLOWED_MODEL_EXTS = new Set(['.glb']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm']);

function decodeHeaderBytes(contentBase64) {
  if (contentBase64.length < 16) return null;
  try {
    const binary = atob(contentBase64.slice(0, 16));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function hasValidMagicBytes(ext, contentBase64) {
  const b = decodeHeaderBytes(contentBase64);
  if (!b || b.length < 12) return false;
  const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));

  if (ext === '.png') {
    return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  if (ext === '.gif') {
    return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  }
  if (ext === '.webp') {
    return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  }
  if (ext === '.avif') {
    const box = ascii(4, 12);
    return box === 'ftypavif' || box === 'ftypavis';
  }
  if (ext === '.glb') {
    return ascii(0, 4) === 'glTF';
  }
  if (ext === '.mp4') {
    return ascii(4, 8) === 'ftyp';
  }
  if (ext === '.webm') {
    return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  }
  return false;
}

export async function onRequestPost({ request, env }) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Non autenticato.' }, 401);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'Richiesta troppo grande (massimo 15 MB).' }, 413);
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
  const isVideo = ALLOWED_VIDEO_EXTS.has(ext);

  if (!isImage && !isModel && !isVideo) {
    return jsonResponse(
      { error: 'Formato non consentito. Usa PNG, JPG, WebP, GIF, AVIF, video .mp4/.webm o modelli 3D .glb.' },
      400
    );
  }

  const contentBase64 = String(body?.contentBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');

  if (!contentBase64 || !/^[A-Za-z0-9+/=]+$/.test(contentBase64)) {
    return jsonResponse({ error: 'File vuoto o non valido.' }, 400);
  }

  if (!hasValidMagicBytes(ext, contentBase64)) {
    return jsonResponse(
      {
        error: isModel
          ? 'File .glb non valido (header glTF binario mancante).'
          : isVideo
            ? 'File video non valido (header MP4/WebM mancante).'
            : 'Contenuto file non valido per il formato dichiarato.',
      },
      400
    );
  }

  const approxBytes = Math.floor((contentBase64.length * 3) / 4);
  const maxBytes = isModel ? MAX_MODEL_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (approxBytes > maxBytes) {
    return jsonResponse(
      { error: `File troppo grande (massimo ${isImage ? '4' : '10'} MB).` },
      413
    );
  }

  const { branch } = getRepoConfig(env);
  const stamp = Date.now();
  const repoPath = `public/uploads/${slug}/${stamp}-${filename}`;
  const kindLabel = isModel ? 'modello 3D' : isVideo ? 'video' : 'immagine';

  const putRes = await githubRequest(env, `/contents/${repoPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `carica ${kindLabel} ${filename} per ${slug} (via admin: ${session.author})`,
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
