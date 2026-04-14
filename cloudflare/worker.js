const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const state = {
  modelName: '',
  modelResolvedAt: 0,
};

function corsHeaders(origin, allowedOrigin = '*') {
  const allowOrigin = allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : 'null');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body, status = 200, origin = '*', allowedOrigin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, allowedOrigin),
  });
}

async function resolveModel(apiKey) {
  const now = Date.now();
  if (state.modelName && now - state.modelResolvedAt < 10 * 60 * 1000) {
    return state.modelName;
  }

  const response = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao listar modelos: ${text}`);
  }

  const data = await response.json();
  const models = (data.models || []).filter((m) =>
    Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')
  );

  if (!models.length) {
    throw new Error('Nenhum modelo compativel com generateContent encontrado.');
  }

  const preferred = [
    'models/gemini-2.0-flash',
    'models/gemini-2.0-flash-lite',
    'models/gemini-1.5-flash-latest',
    'models/gemini-1.5-flash',
  ];

  let chosen = models[0].name;
  for (const candidate of preferred) {
    const match = models.find((m) => m.name === candidate);
    if (match) {
      chosen = match.name;
      break;
    }
  }

  state.modelName = chosen;
  state.modelResolvedAt = now;
  return chosen;
}

async function generateText(prompt, isJson, apiKey) {
  const modelName = await resolveModel(apiKey);
  const url = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;

  const generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 8192,
  };
  if (isJson) generationConfig.responseMimeType = 'application/json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    let message = `Erro ${response.status} no Gemini.`;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch (e) {}
    throw new Error(message);
  }

  const data = JSON.parse(raw);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text, modelName: modelName.replace('models/', '') };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin, allowedOrigin) });
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ ok: false, message: 'GEMINI_API_KEY nao configurada no Worker.' }, 500, origin, allowedOrigin);
    }

    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/api/health') {
      try {
        const modelName = await resolveModel(env.GEMINI_API_KEY);
        return jsonResponse({ ok: true, model: modelName.replace('models/', ''), message: 'IA disponivel' }, 200, origin, allowedOrigin);
      } catch (e) {
        return jsonResponse({ ok: false, message: String(e?.message || 'Falha no health check de IA') }, 503, origin, allowedOrigin);
      }
    }

    if (request.method === 'POST' && pathname === '/api/gemini') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        const isJson = Boolean(body?.isJson);

        if (!prompt) {
          return jsonResponse({ ok: false, error: 'Prompt vazio.' }, 400, origin, allowedOrigin);
        }

        const result = await generateText(prompt, isJson, env.GEMINI_API_KEY);
        return jsonResponse({ ok: true, text: result.text, model: result.modelName }, 200, origin, allowedOrigin);
      } catch (e) {
        return jsonResponse({ ok: false, error: String(e?.message || 'Falha ao processar IA.') }, 502, origin, allowedOrigin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rota nao encontrada.' }, 404, origin, allowedOrigin);
  },
};
