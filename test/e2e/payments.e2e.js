// Оплата через ЮKassa в настоящем браузере — против учебной копии API (yookassa-mock.js):
// платёжная страница, возврат на сайт, чек, поддельное уведомление, возврат денег гостем и админом.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startYooKassaMock } from './yookassa-mock.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = loadPlaywright();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'e2e-admin-token-123';
const PORT = 4000 + Math.floor(Math.random() * 400);
const B = `http://localhost:${PORT}`;
const SHOP = { shopId: '123456', secretKey: 'test_secret_key_e2e' };
let server, browser, dir, eventId, yk;
const pageErrors = [];

async function page() {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', (e) => pageErrors.push(`${p.url()}: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  return p;
}

async function buy(p) {
  await p.goto(`${B}/event?id=${eventId}`);
  await p.click('#buy [data-d="1"]');
  await p.click('#go');
  await p.fill('#pay-form [name=name]', 'Борис');
  await p.fill('#pay-form [name=phone]', '+7 912 000-11-22');
  await p.check('#pay-form [name=consent]');
  await p.fill('#pay-form [name=email]', 'boris@example.ru');
  await p.click('#pay-form [type=submit]');
  await p.waitForURL(/\/checkout\//);
}

before(async () => {
  yk = await startYooKassaMock({ ...SHOP, port: PORT + 500 });
  yk.setSite(B);
  dir = mkdtempSync(join(tmpdir(), 'mt-pay-'));
  server = spawn(process.execPath, ['--no-warnings', 'server/index.js', '--prod'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), DB_FILE: join(dir, 'mt.db'), ADMIN_TOKEN: TOKEN, BACKUP_DIR: 'off', PUBLIC_ORIGIN: B,
      PAYMENT_POLL_MS: '1500', YOOKASSA_SHOP_ID: SHOP.shopId, YOOKASSA_SECRET_KEY: SHOP.secretKey, YOOKASSA_API_URL: `${yk.url}/v3`,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${B}/api/health`)).ok) break; } catch {}
    await new Promise((r) => { setTimeout(r, 250); });
  }
  // событие через 3 дня: гость ещё может сам вернуть билеты
  const res = await fetch(`${B}/api/admin/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B, 'X-Admin-Token': TOKEN },
    body: JSON.stringify({ title: 'Оплата', startsAt: new Date(Date.now() + 72 * 3600e3).toISOString(), price: 1000, deposit: 500, capacity: 50 }),
  });
  eventId = (await res.json()).id;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
  yk?.close();
  rmSync(dir, { recursive: true, force: true });
});

let guest;

test('гость платит на странице ЮKassa и возвращается к билетам, в чеке строка на каждый билет', async () => {
  assert.equal((await (await fetch(`${B}/api/config`)).json()).paymentMode, 'yookassa');
  guest = await page();
  await buy(guest);
  const [p] = [...yk.payments.values()];
  assert.equal(p.amount.value, '2000.00');
  assert.deepEqual(p.receipt.customer, { email: 'boris@example.ru', full_name: 'Борис' });
  assert.deepEqual(p.receipt.items.map((i) => [i.amount.value, i.payment_mode, i.payment_subject]), [['1000.00', 'full_payment', 'service'], ['1000.00', 'full_payment', 'service']]);
  await guest.click('#pay');
  await guest.waitForURL(/\/tickets/);
  await guest.waitForSelector('.ticket .qr svg', { timeout: 10000 });
  assert.equal(await guest.locator('.ticket').count(), 2);
  assert.deepEqual(yk.webhooks, [{ event: 'payment.succeeded', status: 200 }]);
  assert.deepEqual(yk.errors, []);
});

test('поддельное уведомление не подтверждает неоплаченный заказ', async () => {
  const p2 = await page();
  await buy(p2); // платёж создан, но гость не заплатил
  const pending = [...yk.payments.values()].find((x) => x.status === 'pending');
  const forge = (id) => fetch(`${B}/api/payments/yookassa`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id, status: 'succeeded', amount: { value: '1000.00', currency: 'RUB' } } }),
  });
  assert.equal((await forge(pending.id)).status, 200);
  assert.equal((await forge('00000000-0000-0000-0000-000000000000')).status, 200);
  const av = await (await fetch(`${B}/api/events/${eventId}/availability`)).json();
  assert.equal(av.sold, 2, 'новые билеты не проданы, проданы только первые два');
  assert.equal(av.held, 2, 'бронь просто ждёт оплаты');
  // гость отказался на странице оплаты — бронь снимается
  await p2.click('#cancel');
  await p2.waitForSelector('text=Оплата не прошла');
  assert.equal((await (await fetch(`${B}/api/events/${eventId}/availability`)).json()).held, 0);
});

test('админ аннулирует один билет — деньги за него уходят через ЮKassa с чеком возврата', async () => {
  const admin = await page();
  await admin.goto(`${B}/admin`);
  await admin.fill('[name=p]', TOKEN);
  await admin.click('#login button');
  await admin.click('[data-edit]');
  const form = admin.locator('.edit-ticket').first();
  // ЮKassa не провела возврат: билет остаётся действовать, админ видит причину
  yk.refuseNextRefund();
  await form.locator('[name=status]').selectOption('cancelled');
  await form.locator('button').click();
  await admin.waitForSelector('.toast');
  assert.match(await admin.textContent('.toast'), /не провела возврат: на балансе магазина не хватает денег/);
  const order = await (await fetch(`${B}/api/orders/${encodeURIComponent((await guest.evaluate(() => location.hash)).match(/order=([^&]+)/)[1])}`)).json();
  assert.deepEqual(order.tickets.map((t) => t.status), ['active', 'active'], 'откат: билеты действуют');
  assert.equal(order.refundedAmount, 0);
  await admin.waitForSelector('.toast', { state: 'detached', timeout: 10000 });
  await form.locator('[name=status]').selectOption('cancelled');
  await form.locator('button').click();
  await admin.waitForSelector('.toast');
  assert.equal((await admin.textContent('.toast')).trim(), 'Билет сохранён');
  assert.equal(yk.refunds.length, 1);
  assert.equal(yk.refunds[0].amount.value, '1000.00');
  assert.equal(yk.refunds[0].receipt.items.length, 1);
});

test('гость отправляет заявку на возврат, администратор отмечает билеты и возвращает деньги', async () => {
  await guest.reload();
  await guest.waitForSelector('#refund-ask');
  await guest.click('#refund-ask');
  await guest.fill('#refund-form [name=reason]', 'Не смогу прийти');
  await guest.click('#refund-form [type=submit]');
  await guest.waitForSelector('.refund-state');
  assert.match(await guest.textContent('.refund-state'), /Заявка на возврат отправлена/);
  assert.equal(yk.refunds.length, 1, 'сама заявка денег не возвращает');
  assert.equal(await guest.locator('#refund-ask').count(), 0, 'вторую заявку не отправить');

  const admin = await page();
  await admin.goto(`${B}/admin`);
  await admin.fill('[name=p]', TOKEN);
  await admin.click('#login button');
  await admin.waitForSelector('[data-refund-ok]');
  assert.match(await admin.textContent('#refunds'), /Не смогу прийти/);
  await admin.click('[data-refund-ok]');
  await admin.waitForSelector('#refund-dlg[open]');
  // в заказе остался один действующий билет (второй аннулирован в прошлом шаге): он и отмечен
  assert.equal(await admin.locator('#refund-dlg [name=t]').count(), 1);
  assert.ok(await admin.isChecked('#refund-dlg [name=t]'));
  await admin.uncheck('#refund-dlg [name=t]');
  assert.ok(await admin.isDisabled('#refund-dlg [type=submit]'), 'без отмеченных билетов вернуть нечего');
  await admin.check('#refund-dlg [name=t]');
  assert.equal((await admin.textContent('#refund-dlg [type=submit]')).trim(), 'Вернуть 1 билет из 1, 1\u00a0000\u00a0₽');
  await admin.click('#refund-dlg [type=submit]');
  await admin.waitForSelector('#refunds >> text=Новых заявок на возврат нет');
  assert.deepEqual(yk.refunds.map((r) => r.amount.value), ['1000.00', '1000.00']);
  assert.equal(yk.refunds[1].receipt.items.length, 1, 'чек возврата — по возвращённому билету');
  await guest.reload();
  await guest.waitForSelector('.order .status.refunded');
  assert.deepEqual(yk.errors, [], 'копия ЮKassa не нашла ошибок в запросах');
});

test('ЮKassa провела возврат, но ответ потерялся: билет не оживает, возврат повторяется и проходит один раз', async () => {
  const p = await page();
  await buy(p);
  await p.click('#pay');
  await p.waitForURL(/\/tickets/);
  await p.waitForSelector('.ticket .qr svg', { timeout: 10000 });
  const secret = decodeURIComponent((await p.evaluate(() => location.hash)).match(/order=([^&]+)/)[1]);
  const order = await (await fetch(`${B}/api/orders/${encodeURIComponent(secret)}`)).json();
  const before = yk.refunds.length;
  yk.loseNextRefundAnswer();
  const res = await fetch(`${B}/api/admin/orders/${order.code}/refund`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B, 'X-Admin-Token': TOKEN }, body: JSON.stringify({}),
  });
  assert.equal(res.status, 504);
  assert.match((await res.json()).error, /повторится автоматически/);
  const now = await (await fetch(`${B}/api/orders/${encodeURIComponent(secret)}`)).json();
  assert.equal(now.status, 'refunded', 'билеты не вернулись в силу');
  // проверка раз в 1,5 с повторяет запрос с тем же ключом: ЮKassa отвечает тем же возвратом
  for (let i = 0; i < 40 && (await (await fetch(`${B}/api/orders/${encodeURIComponent(secret)}`)).json()).refundedAmount === 0; i++) await new Promise((r) => { setTimeout(r, 250); });
  assert.equal((await (await fetch(`${B}/api/orders/${encodeURIComponent(secret)}`)).json()).refundedAmount, 2000);
  assert.equal(yk.refunds.length, before + 1, 'деньги ушли один раз');
});

test('на страницах нет ошибок JavaScript', () => {
  assert.deepEqual(pageErrors, []);
});
