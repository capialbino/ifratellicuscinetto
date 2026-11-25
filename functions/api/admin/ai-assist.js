import { getAuthenticatedSession, jsonResponse } from '../../../lib/admin-server.js';
import { generateFastJson } from '../../../lib/gemini-fast.js';

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
    const prompt = [
      'Sei il redattore tecnico di "I Fratelli Cuscinetto" (meccanica, AI, sistemi).',
      'Impamina questo testo grezzo in Markdown tecnico pulito SENZA inventare dati o concetti.',
      'Regole: mantieni voce e contenuto; correggi solo refusi/struttura; usa titoli ##/###, elenchi e note (> **Nota:**); converti formule in LaTeX ($...$ o $$...$$); preserva intatti link, immagini e blocchi di codice.',
      'Restituisci JSON: {"title":string,"description":string,"tags":string[],"category":"Meccanica"|"AI & Software"|"Meccatronica & Hybrid","level":"Divulgativo"|"Intermedio"|"Tecnico / Avanzato","body":string}.',
      '',
      `TITOLO: ${title || '(vuoto)'}`,
      'TESTO:',
      body,
    ].join('\n');

    const { model, parsed } = await generateFastJson({
      apiKey,
      envModel: env.GEMINI_MODEL,
      tier: 'flash',
      prompt,
      temperature: 0.2,
    });

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
        body: typeof parsed.body === 'string' ? parsed.body.trim() : undefined,
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: err?.message || 'Errore durante l’elaborazione AI.' },
      500
    );
  }
}
