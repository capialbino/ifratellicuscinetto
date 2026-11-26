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
    console.error(`GitHub site-config GET error (${res.status}):`, errText);
    return jsonResponse(
      { error: 'Errore durante la lettura della configurazione da GitHub.' },
      res.status
    );
  }

  const file = await res.json();
  const config = JSON.parse(base64ToUtf8(file.content || '{}'));
  return jsonResponse({ config, sha: file.sha });
}

const VALID_PRESETS = new Set(['alabaster', 'ceramic', 'graphite', 'obsidian']);
const VALID_FONTS = new Set(['sans', 'serif']);
const VALID_RADII = new Set(['sharp', 'ive', 'soft']);
const VALID_SPACING = new Set(['airy', 'balanced', 'compact']);
const VALID_ALIGN = new Set(['center', 'left']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function sanitizeConfig(raw) {
  const cleanStr = (v, max = 300) => String(v || '').trim().slice(0, max);
  const t = raw.theme || {};
  const b = raw.brand || {};
  const h = raw.hero || {};
  const f = raw.footer || {};

  return {
    brand: {
      name: cleanStr(b.name, 80) || 'I Fratelli Cuscinetto',
      subtitleIt: cleanStr(b.subtitleIt, 120),
      subtitleEn: cleanStr(b.subtitleEn, 120),
    },
    theme: {
      preset: VALID_PRESETS.has(t.preset) ? t.preset : 'alabaster',
      accentLight: HEX_COLOR.test(t.accentLight) ? t.accentLight : '#0071e3',
      accentDark: HEX_COLOR.test(t.accentDark) ? t.accentDark : '#2997ff',
      headingFont: VALID_FONTS.has(t.headingFont) ? t.headingFont : 'sans',
      proseFont: VALID_FONTS.has(t.proseFont) ? t.proseFont : 'sans',
      radius: VALID_RADII.has(t.radius) ? t.radius : 'ive',
      spacing: VALID_SPACING.has(t.spacing) ? t.spacing : 'airy',
      heroAlign: VALID_ALIGN.has(t.heroAlign) ? t.heroAlign : 'center',
      showBearingMark: Boolean(t.showBearingMark),
    },
    hero: {
      kickerIt: cleanStr(h.kickerIt, 160),
      kickerEn: cleanStr(h.kickerEn, 160),
      titleIt: cleanStr(h.titleIt, 160),
      titleEn: cleanStr(h.titleEn, 160),
      leadIt: cleanStr(h.leadIt, 400),
      leadEn: cleanStr(h.leadEn, 400),
      showPillars: Boolean(h.showPillars),
      pillars: Array.isArray(h.pillars)
        ? h.pillars.slice(0, 6).map((p) => ({
            codeIt: cleanStr(p?.codeIt, 60),
            codeEn: cleanStr(p?.codeEn, 60),
            textIt: cleanStr(p?.textIt, 200),
            textEn: cleanStr(p?.textEn, 200),
          }))
        : [],
    },
    footer: {
      taglineIt: cleanStr(f.taglineIt, 200),
      taglineEn: cleanStr(f.taglineEn, 200),
    },
  };
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

  const rawConfig = body?.config;
  if (!rawConfig || typeof rawConfig !== 'object' || !rawConfig.theme || !rawConfig.hero || !rawConfig.brand) {
    return jsonResponse({ error: 'Struttura configurazione non valida.' }, 400);
  }

  const config = sanitizeConfig(rawConfig);

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
      message: `style: aggiorna design e testi sito (via admin: ${auth.session.author})`,
      content: utf8ToBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    console.error(`GitHub site-config PUT error (${putRes.status}):`, errText);
    return jsonResponse(
      { error: 'Errore durante il salvataggio della configurazione su GitHub.' },
      putRes.status
    );
  }

  const result = await putRes.json();
  return jsonResponse({ ok: true, sha: result?.content?.sha });
}
