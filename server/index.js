process.env.TZ ||= process.env.VENUE_TZ || 'Europe/Moscow';

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, seedEvents } from './db.js';
import { resolveAdminToken, makeTokenCheck, clientIp, createLimiter, securityHeaders, sameOrigin, isProd } from './security.js';
import { createBooking, BookingError, HOLD_MINUTES, CANCEL_BEFORE_HOURS } from './booking.js';
import { HALLS, ZONES } from './halls.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
let checkAdminToken;
try {
  checkAdminToken = makeTokenCheck(resolveAdminToken());
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
// Демо-оплата подтверждает заказ без денег. В продакшене включается только явно.
const DEMO_PAYMENTS = !isProd || process.env.DEMO_PAYMENTS === '1';

const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'mt.db'));
seedEvents(db);

// Подписчики на изменения схемы зала: eventId -> Set<res>
const streams = new Map();
const booking = createBooking(db, {
  demoPayments: DEMO_PAYMENTS,
  onChange(eventId) {
    const subs = streams.get(eventId);
    if (!subs?.size) return;
    const payload = `data: ${JSON.stringify(booking.availability(eventId))}\n\n`;
    for (const res of subs) res.write(payload);
  },
});
setInterval(() => booking.sweep(), 15e3).unref();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

// Лимиты на IP: защищают поиск заказа, вход в админку и бронирование от перебора и спама.
const LIMITS = {
  // Запас на гостей за одним Wi-Fi или мобильным NAT: у них общий IP.
  api: createLimiter({ limit: 1200, windowMs: 60e3 }),
  lookup: createLimiter({ limit: 30, windowMs: 10 * 60e3 }),
  ticket: createLimiter({ limit: 600, windowMs: 10 * 60e3 }),
  hold: createLimiter({ limit: 60, windowMs: 10 * 60e3 }),
  order: createLimiter({ limit: 300, windowMs: 10 * 60e3 }),
  adminFail: createLimiter({ limit: 10, windowMs: 10 * 60e3 }),
};
const tooMany = (res, limiter, key) => send(res, 429, { error: 'Слишком много попыток. Подождите несколько минут и попробуйте снова.' }, { 'Retry-After': String(limiter.retryAfter(key)) });

const MAX_STREAMS_PER_IP = 60;
const MAX_STREAMS = 2000;
const streamsPerIp = new Map();
let streamCount = 0;

async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !type.startsWith('application/json')) throw new BookingError(415, 'Ожидается JSON');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new BookingError(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BookingError(400, 'Некорректный JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BookingError(400, 'Некорректный запрос');
  return data;
}

const routes = [];
const route = (method, pattern, handler, { admin = false, limit = null } = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([A-Za-z0-9_-]{1,64})'))}$`);
  routes.push({ method, re, keys, handler, admin, limit });
};

route('GET', '/api/config', () => ({ halls: HALLS, zones: ZONES, holdMinutes: HOLD_MINUTES, cancelBeforeHours: CANCEL_BEFORE_HOURS, timeZone: process.env.TZ, paymentsEnabled: DEMO_PAYMENTS }));
route('GET', '/api/events', () => booking.listEvents());
route('GET', '/api/events/:id', ({ id }) => booking.getEvent(id));
route('GET', '/api/events/:id/availability', ({ id }) => booking.availability(id));
route('POST', '/api/events/:id/hold', ({ id }, body) => booking.hold(id, body.items), { limit: 'hold' });
route('GET', '/api/orders/lookup', (_, __, url) => booking.getOrder({ code: url.searchParams.get('code'), phone: url.searchParams.get('phone') }), { limit: 'lookup' });
route('GET', '/api/orders/:secret', ({ secret }) => booking.getOrder({ secret }), { limit: 'order' });
route('POST', '/api/orders/:secret/pay', ({ secret }, body) => booking.pay(secret, body), { limit: 'order' });
route('POST', '/api/orders/:secret/release', ({ secret }) => booking.release(secret), { limit: 'order' });
route('POST', '/api/orders/:secret/cancel', ({ secret }) => booking.cancelByGuest(secret), { limit: 'order' });
route('POST', '/api/orders/:secret/guest', ({ secret }, body) => booking.renameGuest(secret, body.ticket, body.name), { limit: 'order' });
route('GET', '/api/tickets/:code', ({ code }) => booking.getTicket(code), { limit: 'ticket' });

route('GET', '/api/admin/events', () => booking.allEvents(), { admin: true });
route('POST', '/api/admin/events', (_, body) => booking.createEvent(body), { admin: true });
route('POST', '/api/admin/events/:id/status', ({ id }, body) => booking.setEventStatus(id, body.status), { admin: true });
route('GET', '/api/admin/events/:id/report', ({ id }) => booking.eventReport(id), { admin: true });
route('POST', '/api/admin/checkin', (_, body) => booking.checkIn(body.code, body.eventId), { admin: true });
route('POST', '/api/admin/orders/:code/refund', ({ code }) => booking.adminRefund(code), { admin: true });

function openStream(req, res, eventId, ip) {
  const id = Number(eventId);
  const mine = streamsPerIp.get(ip) || 0;
  if (mine >= MAX_STREAMS_PER_IP || streamCount >= MAX_STREAMS) {
    return send(res, 429, { error: 'Слишком много открытых вкладок со схемой' }, { 'Retry-After': '30' });
  }
  const initial = booking.availability(id);
  streamsPerIp.set(ip, mine + 1);
  streamCount++;
  req.socket.setTimeout(0);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(`retry: 3000\ndata: ${JSON.stringify(initial)}\n\n`);
  if (!streams.has(id)) streams.set(id, new Set());
  streams.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(id)?.delete(res);
    streamCount--;
    const left = (streamsPerIp.get(ip) || 1) - 1;
    if (left > 0) streamsPerIp.set(ip, left);
    else streamsPerIp.delete(ip);
  });
}

async function notFound(res) {
  const page = await readFile(join(PUBLIC, '404.html')).catch(() => 'Страница не найдена');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(page);
}

async function serveStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return notFound(res);
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return notFound(res);
  const clean = normalize(decoded).replace(/^\/+/, '');
  // скрытые файлы и служебные папки не отдаём
  if (clean.split('/').some((part) => part.startsWith('.'))) return notFound(res);
  let file = join(PUBLIC, clean || 'index.html');
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return notFound(res);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    if (!extname(file)) file += '.html';
  }
  const ext = extname(file);
  if (!MIME[ext]) return notFound(res);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  } catch {
    return notFound(res);
  }
}

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(securityHeaders(req))) res.setHeader(k, v);
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, 400, { error: 'Некорректный адрес' });
  }
  const ip = clientIp(req);
  try {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return send(res, 405, { error: 'Метод не поддерживается' }, { Allow: 'GET, HEAD, POST' });
    if (!url.pathname.startsWith('/api/')) {
      if (req.method === 'POST') return send(res, 405, { error: 'Метод не поддерживается' });
      return await serveStatic(res, url.pathname);
    }
    if (!LIMITS.api.take(ip)) return tooMany(res, LIMITS.api, ip);
    if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Запрос с чужого сайта отклонён' });
    const stream = url.pathname.match(/^\/api\/events\/(\d{1,9})\/stream$/);
    if (stream && req.method === 'GET') return openStream(req, res, stream[1], ip);
    for (const r of routes) {
      if (r.method !== (req.method === 'HEAD' ? 'GET' : req.method)) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      if (r.admin) {
        if (LIMITS.adminFail.blocked(ip)) return tooMany(res, LIMITS.adminFail, ip);
        if (!checkAdminToken(req.headers['x-admin-token'])) {
          LIMITS.adminFail.take(ip);
          return send(res, 401, { error: 'Неверный пароль администратора' });
        }
      }
      if (r.limit && !LIMITS[r.limit].take(ip)) return tooMany(res, LIMITS[r.limit], ip);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      const body = req.method === 'POST' ? await readJson(req) : {};
      return send(res, 200, await r.handler(params, body, url));
    }
    send(res, 404, { error: 'Не найдено' });
  } catch (e) {
    if (e instanceof BookingError) return send(res, e.status, { error: e.message, conflicts: e.conflicts });
    console.error(e);
    send(res, 500, { error: 'Что-то сломалось на сервере. Попробуйте ещё раз через минуту.' });
  }
});

// Медленные клиенты не держат соединения бесконечно (поток схемы сам снимает таймаут).
server.headersTimeout = 15e3;
server.requestTimeout = 30e3;
server.keepAliveTimeout = 5e3;
server.setTimeout(60e3);

server.listen(PORT, () => console.log(`МТ: http://localhost:${PORT}  (админка: /admin)${isProd ? '' : ', режим разработки: демо-оплата включена'}`));
