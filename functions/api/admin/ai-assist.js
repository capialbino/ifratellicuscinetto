import { getAuthenticatedSession, jsonResponse } from '../../../lib/admin-server.js';

let cachedModel = null;

async function resolveGeminiModel(apiKey, envModel) {
  if (envModel) return String(envModel).replace(/^models\//, '');
  if (cachedModel) return cachedModel;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
  );
  if (!res.ok) {
    throw new Error(`Impossibile interrogare i modelli Gemini (${res.status}).`);
  }
  const data = await res.json();
  const candidates = (data.models || [])
    .filter(
      (m) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        typeof m.name === 'string'
    )
    .map((m) => m.name.replace(/^models\//, ''))
    .filter(
      (id) =>
        id.startsWith('gemini-') &&
        !/(image|audio|tts|live|veo|embedding|aqa|vision|robotics|computer-use|omni)/i.test(id)
    );

  const picked =
    candidates.find((id) => id === 'gemini-flash-latest') ||
    candidates
      .filter((id) => /flash/i.test(id) && !/lite/i.test(id))
      .sort()
      .at(-1) ||
    candidates
      .filter((id) => /flash/i.test(id))
      .sort()
      .at(-1) ||
    candidates.sort().at(-1);

  if (!picked) {
    throw new Error('Nessun modello Gemini compatibile trovato per questa API key.');
  }
  cachedModel = picked;
  return picked;
}

export async function onRequestPost({ request, env }) {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Non autenticato.' }, 401);
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY non configurata nei Secrets di Cloudflare Workers (aggiungila in Settings → Variables and Secrets).',
      },
      503
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  }

  const mode = payload?.mode === 'seo' ? 'seo' : 'format';
  const title = String(payload?.title || '').trim().slice(0, 200);
  const body = String(payload?.body || '').trim();

  if (!body || body.length < 20) {
    return jsonResponse(
      { error: 'Scrivi almeno qualche riga di testo prima di usare l’assistente AI.' },
      400
    );
  }
  if (body.length > 40000) {
    return jsonResponse({ error: 'Testo troppo lungo (massimo 40.000 caratteri).' }, 413);
  }

  try {
    const model = await resolveGeminiModel(apiKey, env.GEMINI_MODEL);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const prompt =
      mode === 'seo'
        ? [
            'Sei il redattore tecnico della rivista italiana di ingegneria "I Fratelli Cuscinetto" (meccanica, AI, sistemi).',
            'Analizza questo articolo italiano e restituisci SOLO un JSON con:',
            '- "title": titolo rifinito (se il titolo attuale è già buono o presente, miglioralo leggermente o mantienilo).',
            '- "description": riassunto SEO elegante di 1-2 frasi in italiano (max 160 caratteri).',
            '- "tags": array di 3-5 tag italiani in minuscolo con trattini (es. ["cuscinetti", "tribologia"]).',
            '- "category": una tra "Meccanica", "AI & Software", "Meccatronica & Hybrid".',
            '- "level": uno tra "Divulgativo", "Intermedio", "Tecnico / Avanzato".',
            '',
            `TITOLO ATTUALE: ${title || '(vuoto)'}`,
            'TESTO:',
            body,
          ].join('\n')
        : [
            'Sei il redattore tecnico della rivista italiana di ingegneria "I Fratelli Cuscinetto" (meccanica, AI, sistemi).',
            'Il tuo compito è impaginare e rifinire questo testo grezzo in Markdown tecnico pulito SENZA inventare dati, formule o concetti non presenti.',
            'Regole ferree:',
            '- Mantieni la voce e il contenuto tecnico dell’autore; correggi solo refusi, punteggiatura e struttura.',
            '- Organizza le sezioni con titoli Markdown (##, ###), elenchi puliti e note (> **Nota:**) dove utile.',
            '- Converti eventuali formule scritte in testo piano (es. p0 = 3F / (2*pi*a*b), alpha_Fe, Delta T) in LaTeX pulito ($...$ inline o $$...$$ a blocco).',
            '- Preserva intatti eventuali link, immagini (![...](...)) e blocchi di codice (```...```).',
            '- Restituisci SOLO un JSON con chiavi: "title" (string), "description" (string max 160 caratteri), "tags" (array di 3-5 tag minuscoli con trattini), "category" ("Meccanica" | "AI & Software" | "Meccatronica & Hybrid"), "level" ("Divulgativo" | "Intermedio" | "Tecnico / Avanzato"), "body" (string Markdown italiano).',
            '',
            `TITOLO ATTUALE: ${title || '(vuoto)'}`,
            'TESTO GREZZO:',
            body,
          ].join('\n');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      return jsonResponse({ error: `Errore Gemini API (${res.status}).` }, 502);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return jsonResponse({ error: 'Risposta vuota da Gemini.' }, 502);
    }

    const parsed = JSON.parse(rawText);
    return jsonResponse({
      ok: true,
      model,
      result: {
        title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
        description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((t) => String(t).trim()).filter(Boolean)
          : undefined,
        category: typeof parsed.category === 'string' ? parsed.category : undefined,
        level: typeof parsed.level === 'string' ? parsed.level : undefined,
        body: mode === 'format' && typeof parsed.body === 'string' ? parsed.body.trim() : undefined,
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: err?.message || 'Errore durante l’elaborazione AI.' },
      500
    );
  }
}
