// Harness ottimizzato per latenza minima su Gemini API (single-shot, zero round-trip superflui, thinking disabilitato quando supportato)

const DEFAULT_FAST_MODELS = {
  lite: 'gemini-flash-lite-latest',
  flash: 'gemini-flash-latest',
};

const cachedResolved = { lite: null, flash: null };
const noThinkingBudgetModels = new Set();

const REQUEST_TIMEOUT_MS = 25000;

async function discoverModel(apiKey, tier) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
    {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini ListModels ${res.status}`);
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
    tier === 'lite'
      ? candidates.find((id) => id === 'gemini-flash-lite-latest') ||
        candidates.filter((id) => /flash-lite/i.test(id)).sort().at(-1) ||
        candidates.find((id) => id === 'gemini-flash-latest') ||
        candidates.filter((id) => /flash/i.test(id)).sort().at(-1)
      : candidates.find((id) => id === 'gemini-flash-latest') ||
        candidates.filter((id) => /flash/i.test(id) && !/lite/i.test(id)).sort().at(-1) ||
        candidates.filter((id) => /flash/i.test(id)).sort().at(-1);

  const finalModel = picked || candidates.sort().at(-1);
  if (!finalModel) {
    throw new Error('Nessun modello Gemini compatibile trovato.');
  }
  cachedResolved[tier] = finalModel;
  return finalModel;
}

async function callGenerateContent(apiKey, model, prompt, generationConfig) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function parseJsonResponse(rawText, model) {
  const trimmed = String(rawText || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Rimuove eventuali code fence Markdown (```json ... ```)
    const stripped = trimmed
      .replace(/^```(?:json)?\s*\r?\n?/i, '')
      .replace(/\r?\n?```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(stripped.slice(start, end + 1));
        } catch {
          // fallthrough
        }
      }
      throw new Error(`Risposta JSON non valida da Gemini (${model}).`);
    }
  }
}

export async function generateFastJson({
  apiKey,
  envModel,
  tier = 'flash',
  prompt,
  temperature = 0.2,
  maxOutputTokens,
  responseSchema,
}) {
  let model = envModel
    ? String(envModel).replace(/^models\//, '')
    : cachedResolved[tier] || DEFAULT_FAST_MODELS[tier];

  const buildConfig = (includeThinkingOff) => ({
    temperature,
    responseMimeType: 'application/json',
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(responseSchema ? { responseSchema } : {}),
    ...(includeThinkingOff && !noThinkingBudgetModels.has(model)
      ? { thinkingConfig: { thinkingBudget: 0 } }
      : {}),
  });

  let res = await callGenerateContent(apiKey, model, prompt, buildConfig(true));

  // Se l'alias default ritorna 404, scopre dinamicamente il modello attivo e ritenta una sola volta
  if (res.status === 404 && !envModel) {
    model = await discoverModel(apiKey, tier);
    res = await callGenerateContent(apiKey, model, prompt, buildConfig(true));
  }

  // Se questo specifico modello non accetta thinkingBudget: 0, memorizza e ritenta senza
  if (res.status === 400 && !noThinkingBudgetModels.has(model)) {
    const errBody = await res.text();
    if (/thinking/i.test(errBody)) {
      noThinkingBudgetModels.add(model);
      res = await callGenerateContent(apiKey, model, prompt, buildConfig(false));
    } else {
      throw new Error(`Gemini API 400 (${model}): ${errBody.replace(/\s+/g, ' ').slice(0, 240)}`);
    }
  }

  if (!res.ok) {
    const errBody = (await res.text()).replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`Gemini API ${res.status} (${model}): ${errBody}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error(`Risposta vuota da Gemini (${model}).`);
  }

  return { model, parsed: parseJsonResponse(rawText, model) };
}
