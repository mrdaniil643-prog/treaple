// Сквозные проверки в настоящем браузере: покупка, вход по живому QR, мобильная вёрстка.
// Запуск: npm run e2e. Сервер поднимается сам на пустой временной базе.
// Нужен Playwright: локально подойдёт глобальный (npm i -g playwright), в CI ставится в шаге workflow.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium, devices } = loadPlaywright();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'e2e-admin-token-123';
const PORT = 3400 + Math.floor(Math.random() * 500);
const B = `http://127.0.0.1:${PORT}`;
let server, browser, dir, eventId;
const pageErrors = [];

async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${B}/api/health`)).ok) return; } catch {}
    await new Promise((r) => { setTimeout(r, 250); });
  }
  throw new Error('сервер не поднялся');
}

async function page(opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => pageErrors.push(`${p.url()}: ${e.message}`));
  return p;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mt-e2e-'));
  server = spawn(process.execPath, ['--no-warnings', 'server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_FILE: join(dir, 'mt.db'), ADMIN_TOKEN: TOKEN, BACKUP_DIR: 'off' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitHealthy();
  // событие через час: на него уже можно войти по QR
  const startsAt = new Date(Date.now() + 3600e3).toISOString();
  const res = await fetch(`${B}/api/admin/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: B, 'X-Admin-Token': TOKEN },
    body: JSON.stringify({ title: 'Проверка', startsAt, price: 1000, deposit: 500, halls: ['karaoke', 'main'] }),
  });
  eventId = (await res.json()).id;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

let ticketCode, guest, staff;

test('гость выбирает стол, оплачивает и видит живой QR', async () => {
  guest = await page();
  await guest.goto(`${B}/event?id=${eventId}`);
  await guest.click('.tbl[data-id="K25"]');
  await guest.click('.table-pop [data-act="add"]');
  await guest.click('#go');
  await guest.fill('[name=name]', 'Борис');
  await guest.fill('[name=phone]', '+7 912 000-11-22');
  await guest.click('#pay-form [type=submit]');
  await guest.waitForURL(/tickets/);
  await guest.waitForSelector('.ticket .qr svg');
  ticketCode = await guest.getAttribute('.ticket', 'data-code');
  assert.match(ticketCode, /^[A-Z0-9]{12}$/);
  const av = await (await fetch(`${B}/api/events/${eventId}/availability`)).json();
  assert.equal(av.tables.K25.sold, 2, 'места за столом проданы');
});

test('контролёр гасит билет по QR один раз, посторонний ничего не видит', async () => {
  const admin = await page();
  await admin.goto(`${B}/admin`);
  await admin.fill('[name=p]', TOKEN);
  await admin.click('#login button');
  await admin.fill('#invite-form [name=name]', 'Саша');
  await admin.click('#invite-form [type=submit]');
  const invite = await admin.textContent('#invite code');

  staff = await page(devices['iPhone 13']);
  await staff.goto(invite);
  await staff.waitForURL(/\/staff/);

  const qr = await guest.evaluate((c) => new Promise((res) => {
    const es = new EventSource(`/api/tickets/live?codes=${c}`);
    es.onmessage = (m) => { es.close(); res(JSON.parse(m.data).tickets[c].qr); };
  }), ticketCode);
  assert.ok(!qr.includes(ticketCode), 'в QR нет кода билета');

  const stranger = await page(devices['iPhone 13']);
  await stranger.goto(`${B}/c/${qr}`);
  assert.equal((await stranger.textContent('h1')).trim(), 'Это билет в МТ');

  await staff.goto(`${B}/c/${qr}`);
  assert.equal((await staff.textContent('h1')).trim(), 'Проходите');
  await guest.waitForSelector('.ticket[data-status="used"]', { timeout: 5000 });
  await staff.goto(`${B}/c/${qr}`);
  assert.match(await staff.textContent('h1'), /Уже прошёл/);
});

test('PDF-билет скачивается, его QR пускает один раз', async () => {
  const btn = guest.locator('.ticket[data-status="active"] [data-pdf]').first();
  const code = await btn.getAttribute('data-pdf');
  const [download, print] = await Promise.all([
    guest.waitForEvent('download'),
    guest.waitForResponse((r) => r.url().includes(`/api/tickets/${code}/print`)),
    btn.click(),
  ]);
  assert.match(download.suggestedFilename(), /^MT-bilet-\d{4}-\d{2}-\d{2}-stol-25-mesto-\d\.pdf$/);
  const file = await download.path();
  const { readFileSync } = await import('node:fs');
  const pdf = readFileSync(file);
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.ok(pdf.length > 50e3, 'в файле есть картинка билета');
  const { qr } = await print.json();
  assert.ok(!qr.includes(code), 'в QR нет кода билета');
  await staff.goto(`${B}/c/${qr}`);
  assert.equal((await staff.textContent('h1')).trim(), 'Проходите');
  await staff.goto(`${B}/c/${qr}`);
  assert.match(await staff.textContent('h1'), /Уже прошёл/);
});

test('админ меняет имя гостя, экран билета обновляется сам', async () => {
  const admin = await page();
  admin.on('dialog', (d) => d.accept());
  await admin.goto(`${B}/admin`);
  await admin.fill('[name=p]', TOKEN);
  await admin.click('#login button');
  await admin.click('[data-edit]');
  const form = admin.locator(`.edit-ticket[data-code="${ticketCode}"]`);
  await form.locator('[name=guestName]').fill('Вера Смирнова');
  await form.locator('button').click();
  await admin.waitForSelector('.toast');
  assert.equal((await admin.textContent('.toast')).trim(), 'Билет сохранён');
  await guest.waitForFunction((c) => document.querySelector(`.ticket[data-code="${c}"] .t-guest span`)?.textContent === 'Вера Смирнова', ticketCode, { timeout: 5000 });
});

// Мобильная вёрстка: нет горизонтальной прокрутки, зоны нажатия не меньше 44 px, поля не мельче 16 px
async function mobileProblems(p) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    if (document.documentElement.scrollWidth > vw) out.push(`прокрутка вбок на ${document.documentElement.scrollWidth - vw}px`);
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], .tbl')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || !r.width || !r.height) continue;
      if (el.type === 'checkbox' && el.closest('label')?.getBoundingClientRect().height >= 43.5) continue; // зона — вся подпись
      if (el.tagName === 'A' && cs.display === 'inline') continue; // ссылка в тексте
      if (el.closest('.dishes')) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'checkbox' && parseFloat(cs.fontSize) < 16) out.push(`поле ${el.name} ${cs.fontSize}`);
    }
    return [...new Set(out)];
  });
}

for (const [label, device] of [['iPhone SE', devices['iPhone SE']], ['iPhone 13', devices['iPhone 13']]]) {
  test(`мобильная вёрстка: ${label}`, async () => {
    const p = await page(device);
    const problems = [];
    for (const path of ['/', `/event?id=${eventId}`, '/menu', '/tickets', '/staff', '/admin', '/nope']) {
      await p.goto(B + path);
      await p.waitForLoadState('networkidle').catch(() => {});
      for (const x of await mobileProblems(p)) problems.push(`${path}: ${x}`);
    }
    await p.goto(`${B}/event?id=${eventId}`);
    await p.tap('.tbl[data-id="K27"]');
    await p.waitForSelector('.table-pop');
    await p.waitForTimeout(600); // шторка выезжает с анимацией
    for (const x of await mobileProblems(p)) problems.push(`карточка стола: ${x}`);
    assert.deepEqual(problems, []);
  });
}

test('на страницах нет ошибок JavaScript', () => {
  assert.deepEqual(pageErrors, []);
});
