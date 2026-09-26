// Учебная копия API ЮKassa для сквозных проверок: платежи, страница оплаты, уведомления, возвраты.
// Повторяет поведение из документации (https://yookassa.ru/developers/api) и строже проверяет запросы:
// ключ магазина, Idempotence-Key, чек с суммой, равной платежу.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export function startYooKassaMock({ shopId, secretKey, port }) {
  const payments = new Map();
  const refunds = [];
  const errors = [];
  const webhooks = [];
  let site = '';
  const auth = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
  const cents = (a) => Math.round(Number(a.value) * 100);
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const read = async (req) => { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; };
  const checkReceipt = (receipt, amount) => {
    if (!receipt?.items?.length) return 'нет чека';
    if (!receipt.customer?.email && !receipt.customer?.phone) return 'в чеке нет почты или телефона';
    const sum = receipt.items.reduce((s, i) => s + cents(i.amount) * Number(i.quantity), 0);
    if (sum !== cents(amount)) return `сумма чека ${sum / 100} не равна платежу ${amount.value}`;
    if (receipt.items.some((i) => !i.vat_code || !i.payment_mode || !i.payment_subject || i.description.length > 128)) return 'неполная строка чека';
    return null;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    // страница оплаты: кнопка «Оплатить» проводит платёж, шлёт уведомление и возвращает на сайт
    const page = url.pathname.match(/^\/checkout\/([\w-]+)(\/pay|\/cancel)?$/);
    if (page) {
      const p = payments.get(page[1]);
      if (!p) return json(res, 404, {});
      if (!page[2]) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h1>ЮKassa (тест)</h1><p>К оплате ${p.amount.value} ₽</p>
          <form method="post" action="/checkout/${p.id}/pay"><button id="pay">Оплатить</button></form>
          <form method="post" action="/checkout/${p.id}/cancel"><button id="cancel">Отказаться</button></form>`);
      }
      p.status = page[2] === '/pay' ? 'succeeded' : 'canceled';
      p.paid = p.status === 'succeeded';
      const event = p.status === 'succeeded' ? 'payment.succeeded' : 'payment.canceled';
      const r = await fetch(`${site}/api/payments/yookassa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notification', event, object: { id: p.id, status: p.status } }),
      });
      webhooks.push({ event, status: r.status });
      res.writeHead(302, { Location: p.return_url });
      return res.end();
    }
    if (!url.pathname.startsWith('/v3/')) return json(res, 404, {});
    if (req.headers.authorization !== auth) return json(res, 401, { type: 'error', code: 'invalid_credentials' });
    if (req.method === 'POST' && !req.headers['idempotence-key']) return json(res, 400, { type: 'error', code: 'invalid_request', description: 'Idempotence-Key' });
    if (req.method === 'POST' && url.pathname === '/v3/payments') {
      const b = await read(req);
      const bad = checkReceipt(b.receipt, b.amount);
      if (bad || !b.confirmation?.return_url || b.capture !== true) {
        errors.push(bad || 'нет return_url или capture');
        return json(res, 400, { type: 'error', code: 'invalid_request', description: bad });
      }
      const id = randomUUID();
      const p = { id, status: 'pending', paid: false, amount: b.amount, description: b.description, metadata: b.metadata, receipt: b.receipt, return_url: b.confirmation.return_url,
        confirmation: { type: 'redirect', confirmation_url: `http://localhost:${port}/checkout/${id}` } };
      payments.set(id, p);
      return json(res, 200, p);
    }
    const one = url.pathname.match(/^\/v3\/payments\/([\w-]+)$/);
    if (req.method === 'GET' && one) {
      const p = payments.get(one[1]);
      return p ? json(res, 200, p) : json(res, 404, { type: 'error', code: 'not_found' });
    }
    if (req.method === 'POST' && url.pathname === '/v3/refunds') {
      const b = await read(req);
      const p = payments.get(b.payment_id);
      const done = refunds.filter((r) => r.payment_id === b.payment_id).reduce((s, r) => s + cents(r.amount), 0);
      const bad = !p || p.status !== 'succeeded' ? 'платёж не оплачен' : done + cents(b.amount) > cents(p.amount) ? 'возврат больше платежа' : checkReceipt(b.receipt, b.amount);
      if (bad) { errors.push(bad); return json(res, 400, { type: 'error', code: 'invalid_request', description: bad }); }
      const r = { id: randomUUID(), status: 'succeeded', payment_id: b.payment_id, amount: b.amount, receipt: b.receipt };
      refunds.push(r);
      return json(res, 200, r);
    }
    json(res, 404, { type: 'error', code: 'not_found' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({
      url: `http://localhost:${port}`,
      setSite: (s) => { site = s; },
      payments, refunds, errors, webhooks,
      close: () => server.close(),
    }));
  });
}
