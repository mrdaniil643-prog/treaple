process.env.TZ ||= process.env.VENUE_TZ || 'Europe/Moscow';

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { openDb, seedEvents } from './db.js';
import { createBooking, BookingError, HOLD_MINUTES, CANCEL_BEFORE_HOURS } from './booking.js';
import { HALLS, ZONES } from './halls.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'mt-admin';
if (!process.env.ADMIN_TOKEN) console.warn('ADMIN_TOKEN не задан — используется пароль по умолчанию "mt-admin". Задайте свой перед запуском в работу.');

const db = openDb(process.env.DB_FILE || join(ROOT, 'data', 'mt.db'));
seedEvents(db);

// Подписчики на изменения схемы зала: eventId -> Set<res>
const streams = new Map();
const booking = createBooking(db, {
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

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new BookingError(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BookingError(400, 'Некорректный JSON');
  }
}

function isAdmin(req) {
  const got = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const want = Buffer.from(ADMIN_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

const routes = [];
const route = (method, pattern, handler, { admin = false } = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  routes.push({ method, re, keys, handler, admin });
};

route('GET', '/api/config', () => ({ halls: HALLS, zones: ZONES, holdMinutes: HOLD_MINUTES, cancelBeforeHours: CANCEL_BEFORE_HOURS, timeZone: process.env.TZ }));
route('GET', '/api/events', () => booking.listEvents());
route('GET', '/api/events/:id', ({ id }) => booking.getEvent(id));
route('GET', '/api/events/:id/availability', ({ id }) => booking.availability(id));
route('POST', '/api/events/:id/hold', ({ id }, body) => booking.hold(id, body.items));
route('GET', '/api/orders/lookup', (_, __, url) => booking.getOrder({ code: url.searchParams.get('code'), phone: url.searchParams.get('phone') }));
route('GET', '/api/orders/:secret', ({ secret }) => booking.getOrder({ secret }));
route('POST', '/api/orders/:secret/pay', ({ secret }, body) => booking.pay(secret, body));
route('POST', '/api/orders/:secret/release', ({ secret }) => booking.release(secret));
route('POST', '/api/orders/:secret/cancel', ({ secret }) => booking.cancelByGuest(secret));
route('POST', '/api/orders/:secret/guest', ({ secret }, body) => booking.renameGuest(secret, body.ticket, body.name));
route('GET', '/api/tickets/:code', ({ code }) => booking.getTicket(code));

route('GET', '/api/admin/events', () => booking.allEvents(), { admin: true });
route('POST', '/api/admin/events', (_, body) => booking.createEvent(body), { admin: true });
route('POST', '/api/admin/events/:id/status', ({ id }, body) => booking.setEventStatus(id, body.status), { admin: true });
route('GET', '/api/admin/events/:id/report', ({ id }) => booking.eventReport(id), { admin: true });
route('POST', '/api/admin/checkin', (_, body) => booking.checkIn(body.code, body.eventId), { admin: true });
route('POST', '/api/admin/orders/:code/refund', ({ code }) => booking.adminRefund(code), { admin: true });

function openStream(req, res, eventId) {
  const id = Number(eventId);
  const initial = booking.availability(id);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(`retry: 3000\ndata: ${JSON.stringify(initial)}\n\n`);
  if (!streams.has(id)) streams.set(id, new Set());
  streams.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(id)?.delete(res);
  });
}

async function serveStatic(res, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(PUBLIC, clean || 'index.html');
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Нет доступа' });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    if (!extname(file)) file += '.html';
  }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  } catch {
    const page = await readFile(join(PUBLIC, '404.html')).catch(() => 'Страница не найдена');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const stream = url.pathname.match(/^\/api\/events\/(\d+)\/stream$/);
    if (stream && req.method === 'GET') return openStream(req, res, stream[1]);
    if (!url.pathname.startsWith('/api/')) return await serveStatic(res, url.pathname);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      if (r.admin && !isAdmin(req)) return send(res, 401, { error: 'Неверный пароль администратора' });
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
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

server.listen(PORT, () => console.log(`МТ: http://localhost:${PORT}  (админка: /admin)`));
