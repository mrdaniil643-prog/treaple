import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';

// Боевой режим: `npm start` (флаг --prod) или NODE_ENV=production.
const PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
// Сколько прокси стоит перед сервером (nginx = 1). Только им верим в X-Forwarded-*.
const PROXY_HOPS = Math.max(0, Math.floor(Number(process.env.TRUST_PROXY) || 0));
const TRUST_PROXY = PROXY_HOPS > 0;
// Адреса сайта, с которых разрешены запросы, через запятую: https://mt-bar.ru
const PUBLIC_ORIGINS = String(process.env.PUBLIC_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

// Пароль администратора. В продакшене без него сервер не стартует,
// в разработке генерируется случайный и печатается в консоль.
export function resolveAdminToken() {
  const token = process.env.ADMIN_TOKEN;
  if (token) {
    if (token.length < 12) {
      if (PROD) throw new Error('ADMIN_TOKEN слишком короткий: нужно не меньше 12 символов');
      console.warn('ADMIN_TOKEN короче 12 символов — задайте пароль надёжнее перед запуском в работу.');
    }
    return token;
  }
  if (PROD) throw new Error('Задайте ADMIN_TOKEN (не меньше 12 символов) — без него админка небезопасна');
  const generated = randomBytes(12).toString('base64url');
  console.warn(`ADMIN_TOKEN не задан. Временный пароль админки на этот запуск: ${generated}`);
  return generated;
}

// Сравниваем хэши, чтобы время сравнения не зависело ни от содержимого, ни от длины.
export function makeTokenCheck(token) {
  const want = createHash('sha256').update(token).digest();
  return (got) => timingSafeEqual(createHash('sha256').update(String(got || '')).digest(), want);
}

export function clientIp(req) {
  // Клиент может сам дописать что угодно в начало X-Forwarded-For, поэтому берём адрес,
  // который добавил наш ближайший доверенный прокси: N-й с конца.
  if (TRUST_PROXY) {
    const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = chain[chain.length - PROXY_HOPS];
    if (ip) return ip;
  }
  return req.socket.remoteAddress || 'unknown';
}

// Простой лимитер «не больше N запросов за окно» в памяти процесса.
export function createLimiter({ limit, windowMs }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return {
    // true — запрос можно пропустить
    take(key) {
      const now = Date.now();
      let h = hits.get(key);
      if (!h || h.reset <= now) {
        h = { count: 0, reset: now + windowMs };
        hits.set(key, h);
      }
      h.count++;
      return h.count <= limit;
    },
    blocked(key) {
      const h = hits.get(key);
      return Boolean(h && h.reset > Date.now() && h.count >= limit);
    },
    retryAfter(key) {
      const h = hits.get(key);
      return h ? Math.max(1, Math.ceil((h.reset - Date.now()) / 1000)) : 1;
    },
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // style-атрибуты используются для CSS-переменных в разметке
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(req) {
  const headers = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
  const https = req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
  if (https) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

// Запросы, меняющие данные, принимаем только со своего сайта.
// Sec-Fetch-Site ставит сам браузер, страница его подделать не может — ему верим в первую очередь.
// Без него сравниваем Origin с адресом сайта (PUBLIC_ORIGIN или Host).
// Запросы без Origin и Sec-Fetch-Site приходят не из браузера — CSRF к ним неприменим.
export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.origin;
  if (!origin) return true;
  if (PUBLIC_ORIGINS.includes(origin)) return true;
  try {
    const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const isProd = PROD;
