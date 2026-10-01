// ЮKassa: платежи, проверка платежа и возвраты с чеками по 54-ФЗ («Чеки от ЮKassa»).
// Документация: https://yookassa.ru/developers/api
// Секретный ключ живёт только в переменных окружения, в код и логи не попадает.
import { BookingError } from './booking.js';

const DESC_MAX = 128; // ЮKassa обрезает описание платежа и строки чека до 128 символов
const money = (rub) => ({ value: (Math.round(rub * 100) / 100).toFixed(2), currency: 'RUB' });
const cut = (s) => (s.length > DESC_MAX ? `${s.slice(0, DESC_MAX - 1)}…` : s);
const dateOf = (iso) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: process.env.TZ }).format(new Date(iso));

// Настройки чека. Какие ставить, скажет бухгалтер:
//  YOOKASSA_VAT_CODE — ставка НДС по справочнику ЮKassa: 1 без НДС, 2 — 0%, 3 — 10%, 4 — 20%, 7 — 5%, 8 — 7%
//  YOOKASSA_TAX_SYSTEM — система налогообложения (1 ОСН, 2 УСН доходы, 3 УСН доходы минус расходы, 6 патент); можно не задавать
//  YOOKASSA_DEPOSIT_ADVANCE — 0 (по умолчанию): билет одной строкой. Билеты продаёт организатор (ИП), а еду и напитки —
//    бар (другое юрлицо), поэтому аванс за еду в чеке организатора не пробиваем. 1 — депозит отдельной строкой «аванс»,
//    только если билеты и бар оформлены на одно лицо.
export function receiptSettings(env = process.env) {
  return {
    vatCode: Number(env.YOOKASSA_VAT_CODE) || 1,
    taxSystem: Number(env.YOOKASSA_TAX_SYSTEM) || null,
    depositAsAdvance: env.YOOKASSA_DEPOSIT_ADVANCE === '1',
  };
}

// Чек: по строке на билет. С YOOKASSA_DEPOSIT_ADVANCE=1 депозит идёт отдельной строкой с признаком «аванс»,
// и тогда на кассе бара пробивается чек с зачётом этого аванса.
export function buildReceipt(lines, contacts, settings = receiptSettings()) {
  const items = [];
  for (const l of lines) {
    const what = `${l.event.title}, ${dateOf(l.event.startsAt)}`;
    const deposit = settings.depositAsAdvance ? l.deposit : 0;
    const entry = l.price - deposit;
    if (entry > 0) {
      items.push({
        description: cut(`Входной билет: ${what}`), quantity: '1.00', amount: money(entry), vat_code: settings.vatCode,
        payment_mode: 'full_payment', payment_subject: 'service',
      });
    }
    if (deposit > 0) {
      items.push({
        description: cut(`Депозит на еду и напитки: ${what}`), quantity: '1.00', amount: money(deposit), vat_code: settings.vatCode,
        payment_mode: 'advance', payment_subject: 'payment',
      });
    }
  }
  const customer = contacts.email ? { email: contacts.email } : { phone: `7${contacts.phone}` };
  if (contacts.name) customer.full_name = contacts.name.slice(0, 256);
  return { customer, items, ...(settings.taxSystem ? { tax_system_code: settings.taxSystem } : {}) };
}

export function createYooKassa({ shopId, secretKey, apiUrl = 'https://api.yookassa.ru/v3', fetchImpl = fetch } = {}) {
  if (!shopId || !secretKey) throw new Error('Для ЮKassa задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY');
  const auth = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;

  async function call(method, path, body, idempotenceKey) {
    let res;
    try {
      res = await fetchImpl(`${apiUrl}${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15e3),
      });
    } catch (e) {
      console.error(`ЮKassa ${method} ${path}: нет связи (${e.message})`);
      // uncertain: запрос мог дойти и выполниться, просто ответ потерялся
      throw new BookingError(502, 'Платёжный сервис не отвечает. Попробуйте через минуту.', { uncertain: true });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // в лог — только код и описание ошибки от ЮKassa, без ключей и данных карты
      console.error(`ЮKassa ${method} ${path}: ${res.status} ${data.code || ''} ${data.description || ''} ${data.parameter || ''}`);
      if (res.status === 404) throw new BookingError(404, 'Платёж не найден');
      // 5xx и 429 — сбой на стороне ЮKassa, результат неизвестен; 4xx — запрос точно отклонён
      throw new BookingError(502, 'Платёжный сервис отклонил запрос. Попробуйте ещё раз или позвоните нам.', { uncertain: res.status >= 500 || res.status === 429 });
    }
    return data;
  }

  return {
    createPayment({ amount, description, returnUrl, orderCode, receipt, idempotenceKey }) {
      return call('POST', '/payments', {
        amount: money(amount),
        capture: true, // одностадийная оплата: деньги списываются сразу
        confirmation: { type: 'redirect', return_url: returnUrl },
        description: cut(description),
        metadata: { order: orderCode },
        receipt,
      }, idempotenceKey);
    },
    getPayment(id) {
      return call('GET', `/payments/${encodeURIComponent(id)}`);
    },
    createRefund({ paymentId, amount, receipt, description, idempotenceKey }) {
      return call('POST', '/refunds', { payment_id: paymentId, amount: money(amount), description: cut(description), receipt }, idempotenceKey);
    },
  };
}
