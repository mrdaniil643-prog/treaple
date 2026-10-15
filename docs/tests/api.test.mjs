// Проверка функции приёма заявок без сети: fetch подменяется.
// Запуск: node --test tests/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TG_BOT_TOKEN = 'test-token';
process.env.TG_CHAT_ID = '-100';

const { default: handler } = await import('../api/lead.js');

let calls = [];
let ipSeq = 0;

function mockFetch(routes) {
  calls = [];
  globalThis.fetch = (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    const route = routes.find(([prefix]) => String(url).startsWith(prefix));
    return route ? route[1](opts) : Promise.reject(new Error('неожиданный запрос ' + url));
  };
}

const ok = () => Promise.resolve(new Response('{"ok":true}', { status: 200 }));
const hang = (opts) => new Promise((_, reject) => {
  opts.signal?.addEventListener('abort', () => reject(opts.signal.reason));
});

async function call(body, headers = {}) {
  const req = {
    method: 'POST',
    // каждый запрос с нового адреса, чтобы лимит не мешал проверкам
    headers: { 'x-real-ip': `10.0.0.${++ipSeq}`, ...headers },
    body,
    socket: {},
  };
  const res = {
    statusCode: 0, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  await handler(req, res);
  return res;
}

const lead = { name: 'Анна', phone: '+7 (909) 854-88-61', message: 'Иск', source: 'Сайт', page: 'https://x' };

test('корректная заявка уходит в Telegram и возвращает 200', async () => {
  mockFetch([['https://api.telegram.org', ok]]);
  const res = await call(lead);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /Анна/);
});

test('HTML в полях экранируется перед отправкой в Telegram', async () => {
  mockFetch([['https://api.telegram.org', ok]]);
  await call({ ...lead, name: '<a href="x">Вася</a>', message: 'a & b' });
  const text = calls[0].body.text;
  assert.ok(!text.includes('<a href'), 'тег прошёл без экранирования');
  assert.match(text, /&lt;a href=&quot;x&quot;&gt;/);
  assert.match(text, /a &amp; b/);
});

test('тело null, массив или число отклоняется с 400, а не падает', async () => {
  for (const bad of [null, [], 42]) {
    mockFetch([]);
    const res = await call(bad);
    assert.equal(res.statusCode, 400, `тело ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0);
  }
});

test('заполненная ловушка: ответ 200, в Telegram ничего не уходит', async () => {
  mockFetch([]);
  const res = await call({ ...lead, company: 'spam' });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 0);
});

test('неполный номер отклоняется', async () => {
  mockFetch([]);
  const res = await call({ ...lead, phone: '+7 (909) 854' });
  assert.equal(res.statusCode, 400);
});

test('зависшая почта не задерживает ответ после доставки в Telegram', async () => {
  process.env.RESEND_KEY = 'k'; process.env.LEAD_EMAIL_TO = 'a@b.c'; process.env.LEAD_EMAIL_FROM = 'c@d.e';
  mockFetch([['https://api.telegram.org', ok], ['https://api.resend.com', hang]]);
  // Таймер AbortSignal.timeout в Node не держит процесс; в живой функции его держит открытый запрос.
  // Здесь эту роль играет обычный таймер, иначе раннер завершится раньше, чем сработает таймаут.
  const keepAlive = setInterval(() => {}, 1000);
  const started = Date.now();
  const res = await call(lead);
  const took = Date.now() - started;
  clearInterval(keepAlive);
  delete process.env.RESEND_KEY; delete process.env.LEAD_EMAIL_TO; delete process.env.LEAD_EMAIL_FROM;
  assert.equal(res.statusCode, 200);
  assert.ok(took < 4000, `ответ занял ${took} мс`);
});

test('четвёртая заявка за минуту с одного адреса получает 429', async () => {
  mockFetch([['https://api.telegram.org', ok]]);
  const headers = { 'x-real-ip': '203.0.113.7' };
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call(lead, headers)).statusCode);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});
