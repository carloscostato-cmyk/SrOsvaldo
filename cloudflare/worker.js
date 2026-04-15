const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const state = {
  modelName: '',
  modelResolvedAt: 0,
  memoryCounters: new Map(),
  memoryDailyQuota: new Map(),
};

const DEFAULTS = {
  RATE_LIMIT_WINDOW_SECONDS: 0,
  RATE_LIMIT_MAX_REQUESTS: 0,
  DAILY_QUOTA_PER_IP: 0,
  MAX_PROMPT_CHARS: 40000,
};

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function getConfig(env) {
  return {
    rateWindowSeconds: toInt(env.RATE_LIMIT_WINDOW_SECONDS, DEFAULTS.RATE_LIMIT_WINDOW_SECONDS),
    rateMaxRequests: toInt(env.RATE_LIMIT_MAX_REQUESTS, DEFAULTS.RATE_LIMIT_MAX_REQUESTS),
    dailyQuotaPerIp: toInt(env.DAILY_QUOTA_PER_IP, DEFAULTS.DAILY_QUOTA_PER_IP),
    maxPromptChars: toInt(env.MAX_PROMPT_CHARS, DEFAULTS.MAX_PROMPT_CHARS),
    requireTurnstile: String(env.REQUIRE_TURNSTILE || '').toLowerCase() === 'true',
    hasKv: Boolean(env.AI_USAGE_KV),
  };
}

function getClientIp(request) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return '0.0.0.0';
}

async function hashText(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function currentDayKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function secondsUntilNextUtcDay() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return Math.max(60, Math.floor((next - now.getTime()) / 1000));
}

async function incrementWithKvOrMemory(storage, key, ttlSeconds) {
  if (storage?.get && storage?.put) {
    const current = Number((await storage.get(key)) || 0);
    const next = current + 1;
    await storage.put(key, String(next), { expirationTtl: ttlSeconds });
    return next;
  }

  const now = Date.now();
  const current = state.memoryCounters.get(key);
  if (!current || current.expiresAt <= now) {
    state.memoryCounters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  current.value += 1;
  state.memoryCounters.set(key, current);
  return current.value;
}

async function incrementDailyWithKvOrMemory(storage, key, ttlSeconds) {
  if (storage?.get && storage?.put) {
    const current = Number((await storage.get(key)) || 0);
    const next = current + 1;
    await storage.put(key, String(next), { expirationTtl: ttlSeconds });
    return next;
  }

  const now = Date.now();
  const current = state.memoryDailyQuota.get(key);
  if (!current || current.expiresAt <= now) {
    state.memoryDailyQuota.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }
  current.value += 1;
  state.memoryDailyQuota.set(key, current);
  return current.value;
}

async function enforceRateLimit(env, ip, config) {
  if (config.rateWindowSeconds <= 0 || config.rateMaxRequests <= 0) {
    return { ok: true, limit: 0, remaining: Infinity, retryAfter: 0 };
  }

  const bucket = Math.floor(Date.now() / (config.rateWindowSeconds * 1000));
  const key = `rl:${ip}:${bucket}`;
  const ttl = config.rateWindowSeconds + 5;
  const count = await incrementWithKvOrMemory(env.AI_USAGE_KV, key, ttl);
  const remaining = Math.max(0, config.rateMaxRequests - count);
  const retryAfter = Math.max(1, config.rateWindowSeconds - Math.floor((Date.now() / 1000) % config.rateWindowSeconds));

  if (count > config.rateMaxRequests) {
    return {
      ok: false,
      error: `Rate limit excedido. Tente novamente em ${retryAfter}s.`,
      limit: config.rateMaxRequests,
      remaining: 0,
      retryAfter,
    };
  }

  return { ok: true, limit: config.rateMaxRequests, remaining, retryAfter };
}

async function enforceDailyQuota(env, ip, config) {
  if (config.dailyQuotaPerIp <= 0) {
    return { ok: true, limit: 0, remaining: Infinity };
  }

  const dayKey = currentDayKey();
  const key = `dq:${ip}:${dayKey}`;
  const ttl = secondsUntilNextUtcDay() + 3600;
  const count = await incrementDailyWithKvOrMemory(env.AI_USAGE_KV, key, ttl);
  const remaining = Math.max(0, config.dailyQuotaPerIp - count);

  if (count > config.dailyQuotaPerIp) {
    return {
      ok: false,
      error: 'Quota diaria de IA excedida para este IP.',
      limit: config.dailyQuotaPerIp,
      remaining: 0,
    };
  }

  return { ok: true, limit: config.dailyQuotaPerIp, remaining };
}

async function verifyTurnstileIfRequired(request, env, config, body, ip) {
  if (!config.requireTurnstile) return { ok: true };
  if (!env.TURNSTILE_SECRET) {
    return { ok: false, error: 'TURNSTILE_SECRET nao configurado no Worker.' };
  }

  const token = String(body?.captchaToken || request.headers.get('x-captcha-token') || '').trim();
  if (!token) {
    return { ok: false, error: 'Captcha obrigatorio: token nao informado.' };
  }

  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  form.set('remoteip', ip);

  const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const verifyData = await verifyResponse.json();
  if (!verifyData?.success) {
    return { ok: false, error: 'Captcha invalido ou expirado.' };
  }
  return { ok: true };
}

function addSecurityHeaders(headers) {
  headers['X-Content-Type-Options'] = 'nosniff';
  headers['X-Frame-Options'] = 'DENY';
  headers['Referrer-Policy'] = 'no-referrer';
  return headers;
}

async function logEvent(env, payload) {
  const salt = String(env.LOG_SALT || 'sr-osvaldo');
  const ipHash = await hashText(`${salt}:${payload.ip}`);
  const logData = {
    ts: new Date().toISOString(),
    requestId: payload.requestId,
    route: payload.route,
    method: payload.method,
    status: payload.status,
    durationMs: payload.durationMs,
    ipHash,
    reason: payload.reason || '',
  };
  console.log(JSON.stringify(logData));
}

function corsHeaders(origin, allowedOrigin = '*') {
  const allowOrigin = allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : 'null');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-captcha-token',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body, status = 200, origin = '*', allowedOrigin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: addSecurityHeaders(corsHeaders(origin, allowedOrigin)),
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const cleanHex = String(hex || '').trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let index = 0; index < cleanHex.length; index += 2) {
    bytes[index / 2] = parseInt(cleanHex.slice(index, index + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function randomHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashPassword(password, saltHex, iterations = 120000) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations,
      hash: 'SHA-256',
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function verifyPassword(password, record) {
  if (!record?.hash || !record?.salt) return false;
  const derivedHash = await hashPassword(password, record.salt, Number(record.iterations || 120000));
  return constantTimeEqual(String(derivedHash), String(record.hash));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(name, email) {
  const value = String(name || '').trim();
  return value || String(email || '').trim();
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

async function getUserRecord(env, email) {
  if (!env.USERS_KV?.get) return null;
  const key = `user:${normalizeEmail(email)}`;
  const raw = await env.USERS_KV.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function verifyGoogleCredential(credential, expectedClientId) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error_description || data?.error || 'Falha ao validar credencial Google.');
  }

  if (expectedClientId && data?.aud !== expectedClientId) {
    throw new Error('A credencial Google nao pertence a este Client ID.');
  }

  if (String(data?.email_verified || '').toLowerCase() !== 'true') {
    throw new Error('E-mail Google nao verificado.');
  }

  return {
    sub: data?.sub || '',
    email: data?.email || '',
    name: data?.name || data?.email || '',
    picture: data?.picture || '',
    hd: data?.hd || '',
    email_verified: true,
  };
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
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const config = getConfig(env);
    const ip = getClientIp(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: addSecurityHeaders(corsHeaders(origin, allowedOrigin)) });
    }


    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/api/health') {
      try {
        const modelName = await resolveModel(env.GEMINI_API_KEY);
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          ip,
        });
        return jsonResponse(
          {
            ok: true,
            model: modelName.replace('models/', ''),
            message: 'IA disponivel',
            safeguards: {
              rateLimitPerMinute: config.rateMaxRequests,
              dailyQuotaPerIp: config.dailyQuotaPerIp,
              turnstileRequired: config.requireTurnstile,
              kvBacked: config.hasKv,
            },
          },
          200,
          origin,
          allowedOrigin
        );
      } catch (e) {
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 503,
          durationMs: Date.now() - startedAt,
          ip,
          reason: String(e?.message || ''),
        });
        return jsonResponse({ ok: false, message: String(e?.message || 'Falha no health check de IA') }, 503, origin, allowedOrigin);
      }
    }

    if (request.method === 'POST' && pathname === '/api/auth/register') {
      try {
        const body = await readJsonBody(request);
        const name = normalizeName(body?.name, body?.email);
        const email = normalizeEmail(body?.email);
        const password = String(body?.password || '');

        const rate = await enforceRateLimit(env, ip, config);
        if (!rate.ok) {
          return jsonResponse({ ok: false, error: rate.error }, 429, origin, allowedOrigin);
        }

        if (!email || !email.includes('@')) {
          return jsonResponse({ ok: false, error: 'E-mail invalido.' }, 400, origin, allowedOrigin);
        }
        if (!name) {
          return jsonResponse({ ok: false, error: 'Nome obrigatorio.' }, 400, origin, allowedOrigin);
        }
        if (password.length < 8) {
          return jsonResponse({ ok: false, error: 'Senha precisa ter pelo menos 8 caracteres.' }, 400, origin, allowedOrigin);
        }
        if (!env.USERS_KV?.get || !env.USERS_KV?.put) {
          return jsonResponse({ ok: false, error: 'USERS_KV nao configurado no Worker.' }, 500, origin, allowedOrigin);
        }

        const captcha = await verifyTurnstileIfRequired(request, env, config, body, ip);
        if (!captcha.ok) {
          return jsonResponse({ ok: false, error: captcha.error }, 403, origin, allowedOrigin);
        }

        const key = `user:${email}`;
        const exists = await env.USERS_KV.get(key);
        if (exists) {
          return jsonResponse({ ok: false, error: 'Ja existe uma conta com este e-mail.' }, 409, origin, allowedOrigin);
        }

        const salt = randomHex(16);
        const iterations = 120000;
        const hash = await hashPassword(password, salt, iterations);
        const record = {
          email,
          name,
          salt,
          iterations,
          hash,
          createdAt: new Date().toISOString(),
        };

        await env.USERS_KV.put(key, JSON.stringify(record));
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          ip,
        });
        return jsonResponse({ ok: true, user: { email, name, picture: '', provider: 'password' } }, 200, origin, allowedOrigin);
      } catch (e) {
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 500,
          durationMs: Date.now() - startedAt,
          ip,
          reason: String(e?.message || ''),
        });
        return jsonResponse({ ok: false, error: String(e?.message || 'Falha ao criar conta.') }, 500, origin, allowedOrigin);
      }
    }

    if (request.method === 'POST' && pathname === '/api/auth/password') {
      try {
        const body = await readJsonBody(request);
        const email = normalizeEmail(body?.email);
        const password = String(body?.password || '');

        const rate = await enforceRateLimit(env, ip, config);
        if (!rate.ok) {
          return jsonResponse({ ok: false, error: rate.error }, 429, origin, allowedOrigin);
        }

        if (!email || !email.includes('@')) {
          return jsonResponse({ ok: false, error: 'E-mail invalido.' }, 400, origin, allowedOrigin);
        }
        if (!password) {
          return jsonResponse({ ok: false, error: 'Senha obrigatoria.' }, 400, origin, allowedOrigin);
        }
        if (!env.USERS_KV?.get) {
          return jsonResponse({ ok: false, error: 'USERS_KV nao configurado no Worker.' }, 500, origin, allowedOrigin);
        }

        const record = await getUserRecord(env, email);
        if (!record) {
          return jsonResponse({ ok: false, error: 'Conta nao encontrada. Crie uma conta primeiro.' }, 401, origin, allowedOrigin);
        }

        const isValid = await verifyPassword(password, record);
        if (!isValid) {
          return jsonResponse({ ok: false, error: 'E-mail ou senha invalidos.' }, 401, origin, allowedOrigin);
        }

        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          ip,
        });
        return jsonResponse({ ok: true, user: { email: record.email, name: record.name, picture: '', provider: 'password' } }, 200, origin, allowedOrigin);
      } catch (e) {
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 401,
          durationMs: Date.now() - startedAt,
          ip,
          reason: String(e?.message || ''),
        });
        return jsonResponse({ ok: false, error: String(e?.message || 'Falha ao autenticar.') }, 401, origin, allowedOrigin);
      }
    }

    if (request.method === 'POST' && pathname === '/api/auth/google') {
      try {
        const body = await request.json();
        const credential = String(body?.credential || '').trim();

        if (!credential) {
          return jsonResponse({ ok: false, error: 'Credencial Google nao informada.' }, 400, origin, allowedOrigin);
        }

        if (!env.GOOGLE_CLIENT_ID) {
          return jsonResponse({ ok: false, error: 'GOOGLE_CLIENT_ID nao configurado no Worker.' }, 500, origin, allowedOrigin);
        }

        const user = await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID);
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          ip,
        });
        return jsonResponse({ ok: true, user }, 200, origin, allowedOrigin);
      } catch (e) {
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 401,
          durationMs: Date.now() - startedAt,
          ip,
          reason: String(e?.message || ''),
        });
        return jsonResponse({ ok: false, error: String(e?.message || 'Falha ao validar login Google.') }, 401, origin, allowedOrigin);
      }
    }

    if (request.method === 'POST' && pathname === '/api/gemini') {
      try {
        const body = await request.json();
        const prompt = String(body?.prompt || '').trim();
        const isJson = Boolean(body?.isJson);

        if (!prompt) {
          await logEvent(env, {
            requestId,
            route: pathname,
            method: request.method,
            status: 400,
            durationMs: Date.now() - startedAt,
            ip,
            reason: 'prompt-empty',
          });
          return jsonResponse({ ok: false, error: 'Prompt vazio.' }, 400, origin, allowedOrigin);
        }

        if (prompt.length > config.maxPromptChars) {
          await logEvent(env, {
            requestId,
            route: pathname,
            method: request.method,
            status: 413,
            durationMs: Date.now() - startedAt,
            ip,
            reason: 'prompt-too-large',
          });
          return jsonResponse({ ok: false, error: `Prompt excede limite de ${config.maxPromptChars} caracteres.` }, 413, origin, allowedOrigin);
        }

        const rate = await enforceRateLimit(env, ip, config);
        if (!rate.ok) {
          await logEvent(env, {
            requestId,
            route: pathname,
            method: request.method,
            status: 429,
            durationMs: Date.now() - startedAt,
            ip,
            reason: 'rate-limit',
          });
          const response = jsonResponse({
            ok: false,
            error: rate.error,
            retryAfterSeconds: rate.retryAfter,
          }, 429, origin, allowedOrigin);
          response.headers.set('Retry-After', String(rate.retryAfter));
          response.headers.set('X-RateLimit-Limit', String(rate.limit));
          response.headers.set('X-RateLimit-Remaining', String(rate.remaining));
          return response;
        }

        const quota = await enforceDailyQuota(env, ip, config);
        if (!quota.ok) {
          await logEvent(env, {
            requestId,
            route: pathname,
            method: request.method,
            status: 429,
            durationMs: Date.now() - startedAt,
            ip,
            reason: 'daily-quota',
          });
          const response = jsonResponse({ ok: false, error: quota.error }, 429, origin, allowedOrigin);
          response.headers.set('X-Daily-Quota-Limit', String(quota.limit));
          response.headers.set('X-Daily-Quota-Remaining', String(quota.remaining));
          return response;
        }

        const captcha = await verifyTurnstileIfRequired(request, env, config, body, ip);
        if (!captcha.ok) {
          await logEvent(env, {
            requestId,
            route: pathname,
            method: request.method,
            status: 403,
            durationMs: Date.now() - startedAt,
            ip,
            reason: 'captcha-failed',
          });
          return jsonResponse({ ok: false, error: captcha.error }, 403, origin, allowedOrigin);
        }

        const result = await generateText(prompt, isJson, env.GEMINI_API_KEY);
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          ip,
        });
        const response = jsonResponse({ ok: true, text: result.text, model: result.modelName }, 200, origin, allowedOrigin);
        response.headers.set('X-RateLimit-Limit', String(rate.limit));
        response.headers.set('X-RateLimit-Remaining', String(rate.remaining));
        response.headers.set('X-Daily-Quota-Limit', String(quota.limit));
        response.headers.set('X-Daily-Quota-Remaining', String(quota.remaining));
        return response;
      } catch (e) {
        await logEvent(env, {
          requestId,
          route: pathname,
          method: request.method,
          status: 502,
          durationMs: Date.now() - startedAt,
          ip,
          reason: String(e?.message || ''),
        });
        return jsonResponse({ ok: false, error: String(e?.message || 'Falha ao processar IA.') }, 502, origin, allowedOrigin);
      }
    }

    return jsonResponse({ ok: false, message: 'Rota nao encontrada.' }, 404, origin, allowedOrigin);
  },
};
