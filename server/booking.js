import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { tx, DEFAULT_CAPACITY } from './db.js';

export const HOLD_MINUTES = 10;
export const MAX_TICKETS_PER_ORDER = 10;
// Входной билет без места: table_id = 'GA', seat_no — порядковый номер на событии
const GA = 'GA';
export const CANCEL_BEFORE_HOURS = 24;
// Живой QR меняется каждые 30 секунд; принимаем текущий и предыдущий интервал.
export const QR_WINDOW_SECONDS = 30;
// Контролёр без выбора события пропускает на события, которые начинаются в этих пределах.
const GATE_HOURS_BEFORE = 12;
const GATE_HOURS_AFTER = 10;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (len) => Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export class BookingError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// Убираем управляющие символы и ограничиваем длину текста от пользователя.
export const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const ticketsWord = (n) => {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'билет' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'билета' : 'билетов';
  return `${n} ${w}`;
};

export const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// payments: 'demo' — оплата подтверждается сразу; 'yookassa' — через ЮKassa (сервер ждёт подтверждения платежа);
// null — онлайн-продажа закрыта.
export function createBooking(db, { onChange = () => {}, onTickets = () => {}, onRequest = () => {}, now = () => new Date(), demoPayments = true, payments } = {}) {
  const mode = payments !== undefined ? payments : demoPayments ? 'demo' : null;
  const q = {
    event: db.prepare('SELECT * FROM events WHERE id = ?'),
    events: db.prepare("SELECT * FROM events WHERE status != 'cancelled' ORDER BY starts_at"),
    takenSeats: db.prepare(`SELECT table_id, seat_no, status FROM tickets
      WHERE event_id = ? AND status IN ('held', 'active', 'used')`),
    orderByCode: db.prepare('SELECT * FROM orders WHERE code = ?'),
    orderBySecret: db.prepare('SELECT * FROM orders WHERE secret = ?'),
    orderTickets: db.prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY id'),
    ticketByCode: db.prepare('SELECT * FROM tickets WHERE code = ?'),
    insOrder: db.prepare(`INSERT INTO orders (code, secret, event_id, status, total, created_at, expires_at)
      VALUES (?, ?, ?, 'held', ?, ?, ?)`),
    insTicket: db.prepare(`INSERT INTO tickets (code, order_id, event_id, table_id, seat_no, price, whole_table, status, gate_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'held', ?)`),
    ticketByGate: db.prepare('SELECT * FROM tickets WHERE gate_id = ?'),
    log: db.prepare('INSERT INTO ticket_log (ticket_id, order_id, action, at, note) VALUES (?, ?, ?, ?, ?)'),
    expired: db.prepare("SELECT id, event_id FROM orders WHERE status = 'held' AND expires_at <= ?"),
    setOrderStatus: db.prepare('UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?'),
    releaseTickets: db.prepare("UPDATE tickets SET status = ? WHERE order_id = ? AND status IN ('held', 'active')"),
  };

  const iso = () => now().toISOString();

  // Ключ подписи QR хранится в базе, чтобы коды не менялись после перезапуска.
  let qrKey = process.env.QR_SECRET;
  if (!qrKey) {
    qrKey = db.prepare("SELECT value FROM settings WHERE key = 'qr_secret'").get()?.value;
    if (!qrKey) {
      qrKey = randomBytes(32).toString('base64url');
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('qr_secret', ?)").run(qrKey);
      qrKey = db.prepare("SELECT value FROM settings WHERE key = 'qr_secret'").get().value;
    }
  }
  const windowAt = (ms) => Math.floor(ms / (QR_WINDOW_SECONDS * 1000));
  const sign = (ticketCode, w) => createHmac('sha256', qrKey).update(`${ticketCode}:${w}`).digest('base64url').slice(0, 12);

  // Полезная нагрузка живого QR: CODE.SIG (подпись привязана к 30-секундному интервалу).
  // Короткий код для входа (6 символов) — для ручной проверки, если QR не читается.
  // Меняется вместе с QR, поэтому со скриншота его тоже не используешь.
  const pinOf = (ticketCode, w) => {
    const bytes = createHmac('sha256', qrKey).update(`pin:${ticketCode}:${w}`).digest();
    return Array.from(bytes.subarray(0, 6), (x) => ALPHABET[x % ALPHABET.length]).join('');
  };
  const validFor = () => {
    const ms = now().getTime();
    return Math.ceil(((windowAt(ms) + 1) * QR_WINDOW_SECONDS * 1000 - ms) / 1000);
  };

  // В QR — номер для входа и подпись на текущие 30 секунд. Код билета в QR не попадает.
  function qrToken(t) {
    const w = windowAt(now().getTime());
    return { token: `${t.gate_id}.${sign(t.gate_id, w)}`, pin: pinOf(t.code, w), validFor: validFor() };
  }

  // QR для PDF-билета: подпись не зависит от времени, билет по нему проходит один раз,
  // как обычный распечатанный билет. Живой QR на телефоне продолжает работать параллельно.
  const PRINT = 'print';
  function printQr(ticketCode) {
    const t = q.ticketByCode.get(String(ticketCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Билет не найден');
    if (t.status !== 'active') throw new BookingError(409, 'Билет уже не действует');
    const event = getEvent(t.event_id);
    if (event.status === 'cancelled') throw new BookingError(409, 'Событие отменено');
    return { qr: `${t.gate_id}.${sign(t.gate_id, PRINT)}` };
  }

  function verifySig(ticketCode, sig) {
    const w = windowAt(now().getTime());
    const got = Buffer.from(String(sig));
    return [w, w - 1, PRINT].some((x) => {
      const want = Buffer.from(sign(ticketCode, x));
      return got.length === want.length && timingSafeEqual(got, want);
    });
  }
  const log = (ticketId, orderId, action, note = null) => q.log.run(ticketId, orderId, action, iso(), note);

  function parseEvent(row) {
    if (!row) return null;
    const event = { ...row };
    delete event.halls; // старое поле: раньше билеты продавались на места в залах
    return event;
  }

  function getEvent(id) {
    const e = parseEvent(q.event.get(Number(id)));
    if (!e) throw new BookingError(404, 'Событие не найдено');
    return e;
  }

  // Снимает просроченные брони. Вызывается перед любой операцией с билетами и по таймеру.
  function sweep() {
    const rows = q.expired.all(iso());
    if (!rows.length) return;
    const events = new Set();
    tx(db, () => {
      for (const o of rows) {
        q.setOrderStatus.run('expired', iso(), o.id);
        q.releaseTickets.run('released', o.id);
        log(null, o.id, 'expired');
        events.add(o.event_id);
      }
    });
    for (const id of events) onChange(id);
  }

  function availability(eventId) {
    sweep();
    return computeAvailability(getEvent(eventId));
  }

  function computeAvailability(event) {
    let sold = 0, held = 0;
    for (const t of q.takenSeats.all(event.id)) {
      if (t.status === 'held') held++;
      else sold++;
    }
    const free = Math.max(0, event.capacity - sold - held);
    return { eventId: event.id, status: event.status, capacity: event.capacity, sold, held, free, price: event.price };
  }

  function publicEvent(e) {
    const av = availability(e.id);
    return { ...e, ticketsLeft: av.free };
  }

  // Свободные номера билетов на событии. Номер не место: он нужен, чтобы уникальный индекс
  // не дал продать больше вместимости при одновременных покупках.
  function freeNumbers(eventId, n) {
    const busy = new Set(q.takenSeats.all(eventId).filter((t) => t.table_id === GA).map((t) => t.seat_no));
    const out = [];
    for (let i = 1; out.length < n; i++) if (!busy.has(i)) out.push(i);
    return out;
  }

  function listEvents() {
    sweep();
    const cutoff = new Date(now().getTime() - 6 * 3600e3).toISOString();
    return q.events.all().map(parseEvent).filter((e) => e.starts_at >= cutoff).map(publicEvent);
  }

  // qty — сколько входных билетов берёт гость
  function hold(eventId, qty) {
    if (!mode) throw new BookingError(503, 'Онлайн-продажа билетов пока закрыта.');
    sweep();
    const event = getEvent(eventId);
    if (event.status !== 'on_sale') throw new BookingError(409, 'Продажа билетов на это событие закрыта');
    if (new Date(event.starts_at) < now()) throw new BookingError(409, 'Событие уже началось');
    const n = typeof qty === 'number' || typeof qty === 'string' ? Math.floor(Number(qty)) : NaN;
    if (!(n >= 1)) throw new BookingError(400, 'Укажите, сколько нужно билетов');
    if (n > MAX_TICKETS_PER_ORDER) throw new BookingError(400, `В одном заказе не больше ${MAX_TICKETS_PER_ORDER} билетов`);

    const result = tx(db, () => {
      const { free } = computeAvailability(getEvent(event.id));
      if (free < n) {
        throw new BookingError(409, free ? `Осталось ${ticketsWord(free)}` : 'Билеты закончились', { free });
      }
      const createdAt = iso();
      const expiresAt = new Date(now().getTime() + HOLD_MINUTES * 60e3).toISOString();
      const order = { code: `MT-${code(8)}`, secret: randomBytes(18).toString('base64url') };
      const { lastInsertRowid: orderId } = q.insOrder.run(order.code, order.secret, event.id, event.price * n, createdAt, expiresAt);
      for (const no of freeNumbers(event.id, n)) {
        const { lastInsertRowid } = q.insTicket.run(code(12), orderId, event.id, GA, no, event.price, 0, randomBytes(9).toString('base64url'));
        log(Number(lastInsertRowid), Number(orderId), 'held');
      }
      return order.secret;
    });
    onChange(event.id);
    return getOrder({ secret: result });
  }

  function orderView(o) {
    const event = getEvent(o.event_id);
    const rows = q.orderTickets.all(o.id);
    const tickets = rows.map((t) => ({
      code: t.code, price: t.price, paidPrice: t.paid_price ?? t.price, status: t.status, guestName: t.guest_name, checkedInAt: t.checked_in_at,
    }));
    const hoursLeft = (new Date(event.starts_at) - now()) / 3600e3;
    return {
      code: o.code, secret: o.secret, status: o.status, total: o.total, name: o.name, phone: o.phone, email: o.email,
      createdAt: o.created_at, expiresAt: o.expires_at, paidAt: o.paid_at,
      // сколько секунд осталось держать билеты — таймер на клиенте не зависит от его часов
      expiresIn: o.status === 'held' && o.expires_at ? Math.max(0, Math.floor((new Date(o.expires_at) - now()) / 1000)) : null,
      // вернуть деньги может только администратор; гость отправляет заявку, пока событие не началось
      canRequestRefund: o.status === 'paid' && hoursLeft > 0 && !tickets.some((t) => t.status === 'used') && o.refund_request_status !== 'pending',
      refundRequest: o.refund_request_status ? {
        status: o.refund_request_status, at: o.refund_request_at, reason: o.refund_request_reason, note: o.refund_request_note,
      } : null,
      // онлайн-оплата: гость ушёл на страницу ЮKassa, ждём подтверждения
      paymentPending: o.status !== 'paid' && o.status !== 'refunded' && (o.payment_status === 'pending' || o.payment_status === 'refund_due'),
      paidOnline: o.payment_status === 'succeeded' || o.payment_status === 'refunded',
      refundedAmount: o.refunded_amount || 0,
      // сколько можно вернуть: оплаченная цена действующих билетов
      refundable: o.status === 'paid' ? rows.filter((t) => t.status === 'active').reduce((s, t) => s + (t.paid_price ?? t.price), 0) : 0,
      event: { id: event.id, title: event.title, startsAt: event.starts_at, doorsAt: event.doors_at, lineup: event.lineup, deposit: event.deposit },
      tickets,
    };
  }

  function findOrder({ secret, code: orderCode, phone }) {
    sweep();
    let o = null;
    if (typeof secret === 'string' && secret.length >= 20) o = q.orderBySecret.get(secret);
    else if (orderCode) {
      o = q.orderByCode.get(String(orderCode).trim().toUpperCase().slice(0, 20));
      const p = normalizePhone(phone);
      if (o && (!o.phone || p.length !== 10 || p !== o.phone)) o = null;
    }
    if (!o) throw new BookingError(404, 'Заказ не найден. Проверьте номер заказа и телефон, указанный при покупке.');
    return o;
  }

  function getOrder(auth) {
    return orderView(findOrder(auth));
  }

  function contactsOf({ name, phone, email, consent } = {}) {
    if (consent !== true) throw new BookingError(400, 'Отметьте согласие на обработку персональных данных');
    const cleanName = cleanText(name, 80);
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = cleanText(email, 120);
    if (cleanName.length < 2) throw new BookingError(400, 'Укажите имя');
    if (cleanPhone.length !== 10) throw new BookingError(400, 'Укажите телефон в формате +7 900 000-00-00');
    if (cleanEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new BookingError(400, 'Проверьте адрес почты');
    return { name: cleanName, phone: cleanPhone, email: cleanEmail || null };
  }

  // Отметить заказ оплаченным: билеты становятся действующими, цена оплаты запоминается.
  function markPaid(o) {
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, expires_at = NULL WHERE id = ?").run(iso(), o.id);
    for (const t of q.orderTickets.all(o.id)) {
      db.prepare("UPDATE tickets SET status = 'active', guest_name = COALESCE(guest_name, ?), paid_price = price WHERE id = ?").run(o.name, t.id);
      log(t.id, o.id, 'paid');
    }
  }

  function saveGuests(o, contacts, guests) {
    const guestNames = guests && typeof guests === 'object' && !Array.isArray(guests) ? guests : {};
    db.prepare('UPDATE orders SET name = ?, phone = ?, email = ?, consent_at = ? WHERE id = ?').run(contacts.name, contacts.phone, contacts.email, iso(), o.id);
    for (const t of q.orderTickets.all(o.id)) {
      const guest = (Object.hasOwn(guestNames, t.code) && cleanText(guestNames[t.code], 80)) || contacts.name;
      db.prepare('UPDATE tickets SET guest_name = ? WHERE id = ?').run(guest, t.id);
    }
  }

  // Пока гость оформлял, событие могли закрыть, отменить или оно уже началось
  function checkStillOnSale(o, secret) {
    const ev = getEvent(o.event_id);
    if (ev.status !== 'on_sale' || new Date(ev.starts_at) < now()) {
      release(secret);
      throw new BookingError(409, ev.status === 'cancelled' ? 'Событие отменено, бронь снята.' : 'Продажа на это событие уже закрыта, бронь снята.');
    }
  }

  // Демо-оплата: заказ подтверждается сразу.
  function pay(secret, { name, phone, email, guests, consent } = {}) {
    if (mode !== 'demo') throw new BookingError(503, mode ? 'Оплата проходит через платёжную страницу' : 'Онлайн-продажа билетов пока закрыта.');
    const o = findOrder({ secret });
    if (o.status === 'held') checkStillOnSale(o, secret);
    if (o.status === 'paid') return orderView(o);
    if (o.status !== 'held') throw new BookingError(410, 'Бронь истекла. Оформите билеты заново.');
    const contacts = contactsOf({ name, phone, email, consent });
    tx(db, () => {
      saveGuests(o, contacts, guests);
      markPaid(q.orderBySecret.get(secret));
    });
    onChange(o.event_id);
    return orderView(q.orderBySecret.get(secret));
  }

  // ---- Онлайн-оплата (ЮKassa) ----
  // Шаг 1: гость ввёл контакты. Сохраняем их и отдаём всё, что нужно для платежа и чека.
  // Бронь продлеваем, чтобы билеты держались, пока гость на платёжной странице.
  const PAYMENT_HOLD_MINUTES = 20;
  function startPayment(secret, { name, phone, email, guests, consent } = {}) {
    if (mode !== 'yookassa') throw new BookingError(503, 'Онлайн-продажа билетов пока закрыта.');
    const o = findOrder({ secret });
    if (o.status === 'paid') return { order: orderView(o), paid: true };
    if (o.status !== 'held') throw new BookingError(410, 'Бронь истекла. Оформите билеты заново.');
    checkStillOnSale(o, secret);
    if (o.payment_id && o.payment_status === 'pending' && o.payment_url) return { order: orderView(o), url: o.payment_url };
    const contacts = contactsOf({ name, phone, email, consent });
    const until = new Date(Math.max(new Date(o.expires_at).getTime(), now().getTime() + PAYMENT_HOLD_MINUTES * 60e3)).toISOString();
    tx(db, () => {
      saveGuests(o, contacts, guests);
      db.prepare('UPDATE orders SET expires_at = ? WHERE id = ?').run(until, o.id);
    });
    return { order: orderView(q.orderBySecret.get(secret)), lines: receiptLines(q.orderBySecret.get(secret)), contacts };
  }

  // Строки чека: по билету, с ценой оплаты. deposit — часть цены, которая идёт в депозит на еду и напитки.
  function receiptLines(o, tickets = q.orderTickets.all(o.id).filter((t) => t.status !== 'released')) {
    const event = getEvent(o.event_id);
    return tickets.map((t) => ({
      code: t.code, price: t.paid_price ?? t.price, deposit: Math.min(event.deposit || 0, t.paid_price ?? t.price),
      event: { title: event.title, startsAt: event.starts_at },
    }));
  }

  // Шаг 2: платёж создан в ЮKassa
  function attachPayment(secret, paymentId, url) {
    const o = findOrder({ secret });
    db.prepare("UPDATE orders SET payment_id = ?, payment_url = ?, payment_status = 'pending' WHERE id = ?").run(paymentId, url, o.id);
  }

  // Шаг 3: сервер сам запросил платёж у ЮKassa и получил его состояние.
  // Возвращает { refund } если деньги пришли, а билеты за время оплаты уже раскупили: тогда деньги нужно вернуть.
  function applyPayment(payment) {
    const o = db.prepare('SELECT * FROM orders WHERE payment_id = ?').get(String(payment?.id ?? ''));
    if (!o) return { ignored: 'unknown' };
    if (payment.status === 'canceled') {
      db.prepare("UPDATE orders SET payment_status = 'canceled' WHERE id = ?").run(o.id);
      if (o.status === 'held') release(o.secret);
      return { canceled: true };
    }
    if (payment.status !== 'succeeded') return { ignored: payment.status };
    const lateRefund = () => ({ refund: { order: o, amount: o.total, lines: receiptLines(o, q.orderTickets.all(o.id)) } });
    // возврат за раскупленные билеты ещё не прошёл: пробуем снова, пока ЮKassa его не примет
    if (o.payment_status === 'refund_due') return lateRefund();
    if (o.payment_status === 'succeeded' || o.payment_status === 'refunded') return { already: true };
    const paid = Math.round(Number(payment.amount?.value) * 100);
    if (payment.amount?.currency !== 'RUB' || paid !== o.total * 100) {
      console.error(`Платёж ${payment.id}: сумма ${payment.amount?.value} ${payment.amount?.currency} не совпадает с заказом ${o.code} (${o.total} RUB)`);
      return { ignored: 'amount' };
    }
    let refund = false;
    tx(db, () => {
      if (o.status === 'held' && getEvent(o.event_id).status === 'cancelled') {
        // пока гость платил, событие отменили: билеты не выдаём, деньги возвращаем
        refund = true;
        db.prepare("UPDATE orders SET payment_status = 'refund_due' WHERE id = ?").run(o.id);
        return;
      }
      if (o.status === 'held') {
        db.prepare("UPDATE orders SET payment_status = 'succeeded' WHERE id = ?").run(o.id);
        return markPaid(o);
      }
      if (o.status === 'paid') return;
      // бронь успела истечь: оформляем билеты, если они ещё остались
      const tickets = q.orderTickets.all(o.id);
      const event = getEvent(o.event_id);
      if (computeAvailability(event).free < tickets.length || event.status === 'cancelled') {
        refund = true;
        db.prepare("UPDATE orders SET payment_status = 'refund_due' WHERE id = ?").run(o.id);
        return;
      }
      // пока бронь стояла снятой, её номера могли отдать другим: берём свободные
      const nums = freeNumbers(event.id, tickets.length);
      tickets.forEach((t, i) => db.prepare('UPDATE tickets SET table_id = ?, seat_no = ? WHERE id = ?').run(GA, nums[i], t.id));
      db.prepare("UPDATE orders SET payment_status = 'succeeded' WHERE id = ?").run(o.id);
      markPaid(o);
      log(null, o.id, 'paid_late');
    });
    onChange(o.event_id);
    onTickets(q.orderTickets.all(o.id).map((t) => t.code));
    return refund ? lateRefund() : { paid: true };
  }

  // Деньги за раскупленные билеты вернули автоматически
  function markLateRefunded(o) {
    db.prepare("UPDATE orders SET status = 'refunded', payment_status = 'refunded', refunded_amount = total, cancelled_at = ? WHERE id = ?").run(iso(), o.id);
    log(null, o.id, 'refunded', 'билеты раскупили, пока шла оплата');
  }

  // Заказы, по которым ЮKassa ещё не ответила: их проверяем сами, если уведомление потерялось
  function pendingPayments() {
    const since = new Date(now().getTime() - 24 * 3600e3).toISOString();
    return db.prepare("SELECT payment_id FROM orders WHERE payment_status IN ('pending', 'refund_due') AND created_at >= ?").all(since).map((r) => r.payment_id);
  }

  // ---- Возвраты: сначала проверка, потом деньги через ЮKassa, потом отметка в базе ----
  function refundPlan(o, tickets = q.orderTickets.all(o.id).filter((t) => t.status === 'active')) {
    if (!o.payment_id || o.payment_status !== 'succeeded') return null; // демо-оплата или оплата на кассе
    const lines = receiptLines(o, tickets);
    return { paymentId: o.payment_id, amount: lines.reduce((s, l) => s + l.price, 0), lines, order: o };
  }
  // Возврат по выбранным билетам: tickets — коды билетов заказа, которые возвращаем.
  // Без списка — все действующие билеты (весь заказ).
  function pickTickets(o, codes) {
    const active = q.orderTickets.all(o.id).filter((t) => t.status === 'active');
    if (codes === undefined || codes === null) return active;
    if (!Array.isArray(codes) || !codes.length) throw new BookingError(400, 'Отметьте, какие билеты вернуть');
    const want = new Set(codes.map((c) => String(c ?? '').toUpperCase()));
    const pick = active.filter((t) => want.has(t.code));
    if (pick.length !== want.size) throw new BookingError(400, 'Вернуть можно только действующие билеты этого заказа');
    return pick;
  }
  function adminRefundPlan(orderCode, codes) {
    const o = checkAdminRefund(orderCode, codes);
    return refundPlan(o, pickTickets(o, codes));
  }
  // Аннулирование одного билета из админки: вернуть его цену
  function ticketRefundPlan(ticketCode, patch = {}) {
    const t = q.ticketByCode.get(String(ticketCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
    if (!t || patch.status !== 'cancelled' || t.status === 'cancelled' || t.status === 'used') return null;
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id);
    return o.status === 'paid' ? refundPlan(o, [t]) : null;
  }
  function recordRefund(o, amount) {
    db.prepare('UPDATE orders SET refunded_amount = refunded_amount + ? WHERE id = ?').run(amount, o.id);
    const { paid } = db.prepare('SELECT COALESCE(SUM(paid_price), 0) AS paid FROM tickets WHERE order_id = ?').get(o.id);
    const { refunded } = db.prepare('SELECT refunded_amount AS refunded FROM orders WHERE id = ?').get(o.id);
    if (refunded >= paid) db.prepare("UPDATE orders SET payment_status = 'refunded' WHERE id = ?").run(o.id);
  }

  function release(secret) {
    const o = findOrder({ secret });
    if (o.status !== 'held') return orderView(o);
    tx(db, () => {
      q.setOrderStatus.run('cancelled', iso(), o.id);
      q.releaseTickets.run('released', o.id);
      log(null, o.id, 'released');
    });
    onChange(o.event_id);
    return orderView(q.orderBySecret.get(secret));
  }

  function refund(o, note) {
    tx(db, () => {
      q.setOrderStatus.run('refunded', iso(), o.id);
      if (o.refund_request_status === 'pending') db.prepare("UPDATE orders SET refund_request_status = 'done' WHERE id = ?").run(o.id);
      q.releaseTickets.run('cancelled', o.id);
      log(null, o.id, 'refunded', note);
    });
    onChange(o.event_id);
    onTickets(q.orderTickets.all(o.id).map((t) => t.code));
    return orderView(q.orderByCode.get(o.code));
  }

  // ---- Возврат: сначала база, потом деньги ----
  // Билеты гасятся до запроса в ЮKassa (по QR уже не пройти), а если ЮKassa отказала, всё возвращается как было.
  function snapshotOrder(orderCode) {
    const o = q.orderByCode.get(String(orderCode ?? '').trim().toUpperCase());
    if (!o) throw new BookingError(404, 'Заказ не найден');
    return { order: o, tickets: q.orderTickets.all(o.id) };
  }
  function restoreSnapshot({ order: o, tickets }) {
    tx(db, () => {
      db.prepare('UPDATE orders SET status = ?, total = ?, cancelled_at = ?, refund_request_status = ? WHERE id = ?')
        .run(o.status, o.total, o.cancelled_at, o.refund_request_status, o.id);
      for (const t of tickets) {
        db.prepare('UPDATE tickets SET status = ?, table_id = ?, seat_no = ?, checked_in_at = ? WHERE id = ?').run(t.status, t.table_id, t.seat_no, t.checked_in_at, t.id);
      }
      log(null, o.id, 'refund_rolled_back', 'ЮKassa не провела возврат');
    });
    onChange(o.event_id);
    onTickets(tickets.map((t) => t.code));
  }
  const adminOrderView = (orderCode) => orderView(snapshotOrder(orderCode).order);

  // ---- Заявки на возврат ----
  // Гость не возвращает деньги сам: он отправляет заявку, администратор возвращает или отказывает.
  function requestRefund(secret, { reason } = {}) {
    const o = findOrder({ secret });
    const view = orderView(o);
    if (o.refund_request_status === 'pending') return view;
    if (!view.canRequestRefund) {
      if (o.status === 'refunded') throw new BookingError(409, 'Заказ уже возвращён');
      if (o.status !== 'paid') throw new BookingError(409, 'Заказ не оплачен, возвращать нечего');
      if (view.tickets.some((t) => t.status === 'used')) throw new BookingError(409, 'По этому заказу гости уже прошли. Позвоните администратору.');
      throw new BookingError(409, 'Мероприятие уже началось. Позвоните администратору.');
    }
    db.prepare("UPDATE orders SET refund_request_status = 'pending', refund_request_at = ?, refund_request_reason = ?, refund_request_note = '' WHERE id = ?")
      .run(iso(), cleanText(reason, 500), o.id);
    log(null, o.id, 'refund_requested');
    onRequest();
    return orderView(q.orderBySecret.get(secret));
  }

  function listRefundRequests() {
    return db.prepare("SELECT * FROM orders WHERE refund_request_status = 'pending' ORDER BY refund_request_at").all().map(orderView);
  }

  function declineRefund(orderCode, { note } = {}) {
    const o = q.orderByCode.get(String(orderCode ?? '').trim().toUpperCase());
    if (!o || o.refund_request_status !== 'pending') throw new BookingError(404, 'Заявки на возврат по этому заказу нет');
    db.prepare("UPDATE orders SET refund_request_status = 'declined', refund_request_note = ? WHERE id = ?").run(cleanText(note, 300), o.id);
    log(null, o.id, 'refund_declined');
    onRequest();
    return orderView(q.orderByCode.get(o.code));
  }

  function renameGuest(secret, ticketCode, guestName) {
    const o = findOrder({ secret });
    const t = q.ticketByCode.get(String(ticketCode ?? '').slice(0, 20));
    if (!t || t.order_id !== o.id) throw new BookingError(404, 'Билет не найден в этом заказе');
    if (t.status !== 'active') throw new BookingError(409, 'Имя можно поменять только у действующего билета');
    db.prepare('UPDATE tickets SET guest_name = ? WHERE id = ?').run(cleanText(guestName, 80) || o.name, t.id);
    log(t.id, o.id, 'renamed');
    return orderView(o);
  }

  // Полная карточка билета — только для администратора.
  function ticketView(t) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id);
    const view = orderView(o);
    return { ...view.tickets.find((x) => x.code === t.code), order: o.code, event: view.event, orderStatus: o.status };
  }

  // По ссылке на билет гость видит только свой билет: без номера заказа,
  // контактов покупателя и чужих билетов — иначе один билет открывал бы весь заказ.
  function getTicket(ticketCode) {
    const t = q.ticketByCode.get(String(ticketCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Билет не найден');
    const full = ticketView(t);
    const { code, price, status, guestName, checkedInAt, event } = full;
    return {
      code, price, status, guestName, checkedInAt,
      event: { title: event.title, startsAt: event.startsAt, doorsAt: event.doorsAt, deposit: event.deposit },
    };
  }

  // Состояние билетов для экрана гостя: статус и свежий живой QR.
  function liveTickets(codes) {
    const out = {};
    for (const raw of codes) {
      const t = q.ticketByCode.get(String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
      if (!t || t.status === 'held' || t.status === 'released') continue;
      const cancelled = parseEvent(q.event.get(t.event_id)).status === 'cancelled';
      const status = cancelled && t.status === 'active' ? 'cancelled' : t.status;
      const live = status === 'active' ? qrToken(t) : null;
      // имя тоже: администратор мог его поправить, экран билета обновится сам
      out[t.code] = { status, checkedInAt: t.checked_in_at, guestName: t.guest_name, ...(live ? { qr: live.token, pin: live.pin } : {}) };
    }
    return { tickets: out, validFor: validFor(), window: QR_WINDOW_SECONDS };
  }

  // Что может прийти на вход:
  //  • живой QR: CODE.SIG или ссылка …/c/CODE.SIG — подпись проверяется, скриншот старше минуты не пройдёт;
  //  • код, набранный вручную: CODE — запасной путь, если у гостя сел телефон (решение контролёра).
  function parseGateInput(input) {
    const raw = String(input ?? '').trim().slice(0, 300);
    const signed = raw.match(/(?:\/c\/)?([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{12})(?:[?#].*)?$/);
    if (signed) return { kind: 'qr', gate: signed[1], sig: signed[2] };
    const fromUrl = raw.match(/[?&]t=([A-Za-z0-9-]+)/);
    const clean = (fromUrl ? fromUrl[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if (clean.length === 6) return { kind: 'pin', pin: clean };
    return { kind: 'code', code: clean };
  }

  // Ищем билет по короткому коду среди действующих билетов этого вечера.
  function findByPin(pin) {
    const w = windowAt(now().getTime());
    const from = new Date(now().getTime() - GATE_HOURS_AFTER * 3600e3).toISOString();
    const to = new Date(now().getTime() + GATE_HOURS_BEFORE * 3600e3).toISOString();
    const rows = db.prepare(`SELECT t.* FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.status IN ('active', 'used') AND e.starts_at BETWEEN ? AND ?`).all(from, to);
    const want = Buffer.from(pin);
    return rows.find((t) => [w, w - 1].some((x) => timingSafeEqual(Buffer.from(pinOf(t.code, x)), want))) || null;
  }

  // Что видит контролёр: только имя гостя, без номера заказа и контактов.
  function gateView(t) {
    const full = ticketView(t);
    const { status, guestName, checkedInAt, event } = full;
    return { ref: t.gate_id.slice(-4), status, guestName, checkedInAt, event: { title: event.title, startsAt: event.startsAt } };
  }

  // Что может прийти на вход:
  //  • живой QR (CODE.SIG или ссылка …/c/CODE.SIG) — подпись действует минуту, скриншот не пройдёт;
  //  • короткий код для входа (6 символов) с экрана билета — тоже меняется каждые 30 секунд;
  //  • полный код билета — только администратору (гость его не видит, он есть лишь в ссылке на билет).
  // eventId — событие, выбранное в админке; без него (контролёр) — любое событие этого вечера.
  // requireSigned — пропускать только по живому QR (скан на странице /c/…).
  function checkIn(input, { eventId = null, by = 'admin', requireSigned = false } = {}) {
    const isAdmin = by === 'admin';
    const view = (row) => (isAdmin ? ticketView(row) : gateView(row));
    const parsed = parseGateInput(input);
    let t = null;
    if (parsed.kind === 'pin') {
      if (requireSigned) throw new BookingError(404, 'Такого билета нет');
      t = findByPin(parsed.pin);
      if (!t) return { result: 'expired_qr' };
    } else if (parsed.kind === 'qr') {
      t = q.ticketByGate.get(parsed.gate) || null;
    } else {
      t = parsed.code ? q.ticketByCode.get(parsed.code) : null;
    }
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Такого билета нет');
    const fresh = () => view(q.ticketByCode.get(t.code));
    if (parsed.kind === 'qr' && !verifySig(t.gate_id, parsed.sig)) return { result: 'expired_qr', ticket: fresh() };
    if (parsed.kind === 'code' && (!isAdmin || requireSigned)) return { result: 'expired_qr', ticket: fresh() };
    if (eventId && t.event_id !== Number(eventId)) return { result: 'wrong_event', ticket: fresh() };
    const event = getEvent(t.event_id);
    if (event.status === 'cancelled') return { result: 'event_cancelled', ticket: fresh() };
    if (t.status !== 'active' && t.status !== 'used') return { result: 'invalid', ticket: fresh() };
    if (!eventId) {
      const hours = (new Date(event.starts_at) - now()) / 3600e3;
      if (hours > GATE_HOURS_BEFORE || hours < -GATE_HOURS_AFTER) return { result: 'wrong_day', ticket: fresh() };
    }
    if (t.status === 'used') return { result: 'already_used', ticket: fresh() };
    // Условие в UPDATE делает гашение атомарным: при двух одновременных сканах пройдёт один.
    const r = db.prepare("UPDATE tickets SET status = 'used', checked_in_at = ? WHERE id = ? AND status = 'active'").run(iso(), t.id);
    if (!r.changes) return { result: 'already_used', ticket: fresh() };
    log(t.id, t.order_id, 'checked_in', parsed.kind === 'qr' ? by : `${by}:${parsed.kind}`);
    onChange(t.event_id);
    onTickets([t.code]);
    return { result: 'ok', ticket: fresh() };
  }

  function eventReport(eventId) {
    const event = getEvent(eventId);
    const orders = db.prepare("SELECT * FROM orders WHERE event_id = ? AND status IN ('held', 'paid') ORDER BY created_at DESC").all(event.id);
    const list = orders.map(orderView);
    const stats = { orders: 0, seatsSold: 0, seatsHeld: 0, checkedIn: 0, revenue: 0 };
    for (const o of list) {
      if (o.status === 'paid') {
        stats.orders++;
        stats.revenue += o.total;
      }
      for (const t of o.tickets) {
        if (t.status === 'held') stats.seatsHeld++;
        if (t.status === 'active' || t.status === 'used') stats.seatsSold++;
        if (t.status === 'used') stats.checkedIn++;
      }
    }
    return { event, stats, orders: list, availability: availability(event.id) };
  }

  // codes — возврат части билетов: прошедшие гости по другим билетам заказа не мешают
  function checkAdminRefund(orderCode, codes) {
    const o = q.orderByCode.get(String(orderCode).trim().toUpperCase());
    if (!o) throw new BookingError(404, 'Заказ не найден');
    if (o.status !== 'paid') throw new BookingError(409, 'Вернуть можно только оплаченный заказ');
    if (!codes && q.orderTickets.all(o.id).some((t) => t.status === 'used')) {
      throw new BookingError(409, 'Часть гостей уже прошла, весь заказ вернуть нельзя. Аннулируйте лишние билеты по одному в «Изменить».');
    }
    return o;
  }

  function adminRefund(orderCode, codes) {
    const o = checkAdminRefund(orderCode, codes);
    const pick = pickTickets(o, codes);
    const all = q.orderTickets.all(o.id);
    // все билеты заказа — обычный возврат заказа целиком
    if (pick.length === all.filter((t) => t.status === 'active').length && !all.some((t) => t.status === 'used')) return refund(o, 'admin');
    tx(db, () => {
      for (const t of pick) {
        db.prepare("UPDATE tickets SET status = 'cancelled' WHERE id = ?").run(t.id);
        log(t.id, o.id, 'refunded', 'admin: часть заказа');
      }
      db.prepare("UPDATE orders SET total = (SELECT COALESCE(SUM(price), 0) FROM tickets WHERE order_id = ? AND status IN ('active', 'used')) WHERE id = ?").run(o.id, o.id);
      if (o.refund_request_status === 'pending') db.prepare("UPDATE orders SET refund_request_status = 'done' WHERE id = ?").run(o.id);
    });
    onChange(o.event_id);
    onTickets(pick.map((t) => t.code));
    return orderView(q.orderByCode.get(o.code));
  }

  // ---- Правка билета и заказа из админки ----
  // Меняются: имя гостя, цена, статус (действует / прошёл / аннулирован),
  // номер для входа (новый QR: старые живой QR и PDF перестают пускать).
  const TICKET_STATUSES = ['active', 'used', 'cancelled'];
  function adminEditTicket(ticketCode, patch = {}) {
    const t = q.ticketByCode.get(String(ticketCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Билет не найден');
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id);
    if (o.status !== 'paid') throw new BookingError(409, 'Править можно билеты только оплаченного заказа');
    const event = getEvent(t.event_id);
    const changes = [];
    tx(db, () => {
      let status = t.status;
      if (patch.status !== undefined && patch.status !== t.status) {
        if (!TICKET_STATUSES.includes(patch.status)) throw new BookingError(400, 'Неизвестный статус билета');
        status = patch.status;
      }
      // аннулированный билет снова в деле: нужен свободный билет из вместимости и свободный номер
      let tableId = t.table_id, seat = t.seat_no;
      if (status !== 'cancelled' && t.status === 'cancelled') {
        // за аннулированный билет оплаченного онлайн заказа деньги уже вернули: включать его снова — значит отдать даром
        if (o.payment_id && (o.payment_status === 'succeeded' || o.payment_status === 'refunded')) {
          throw new BookingError(409, 'Деньги за этот билет уже вернули через ЮKassa. Продайте гостю новый билет.');
        }
        if (computeAvailability(event).free < 1) throw new BookingError(409, 'Все билеты на событие уже проданы');
        tableId = GA;
        [seat] = freeNumbers(event.id, 1);
      }
      let price = t.price;
      if (patch.price !== undefined) {
        price = Math.round(Number(patch.price));
        if (!(price >= 0 && price <= 1e6)) throw new BookingError(400, 'Проверьте цену');
      }
      const guest = patch.guestName !== undefined ? cleanText(patch.guestName, 80) || o.name : t.guest_name;
      const checkedInAt = status === 'used' ? t.checked_in_at || iso() : null;
      const gate = patch.newQr ? randomBytes(9).toString('base64url') : t.gate_id;

      if (status !== t.status) changes.push(`статус ${t.status} → ${status}`);
      if (price !== t.price) changes.push(`цена ${t.price} → ${price}`);
      if (guest !== t.guest_name) changes.push('имя гостя');
      if (gate !== t.gate_id) changes.push('новый QR');
      if (!changes.length) return;
      db.prepare(`UPDATE tickets SET table_id = ?, seat_no = ?, price = ?, status = ?, guest_name = ?, checked_in_at = ?, gate_id = ?
        WHERE id = ?`).run(tableId, seat, price, status, guest, checkedInAt, gate, t.id);
      // сумма заказа — по билетам, которые не аннулированы
      db.prepare("UPDATE orders SET total = (SELECT COALESCE(SUM(price), 0) FROM tickets WHERE order_id = ? AND status IN ('active', 'used')) WHERE id = ?").run(o.id, o.id);
      log(t.id, o.id, 'admin_edit', changes.join('; '));
    });
    if (changes.length) {
      onChange(t.event_id);
      onTickets([t.code]);
    }
    return ticketView(q.ticketByCode.get(t.code));
  }

  function adminEditOrder(orderCode, patch = {}) {
    const o = q.orderByCode.get(String(orderCode ?? '').trim().toUpperCase());
    if (!o) throw new BookingError(404, 'Заказ не найден');
    const name = patch.name !== undefined ? cleanText(patch.name, 80) : o.name;
    const phone = patch.phone !== undefined ? normalizePhone(patch.phone) : o.phone;
    const email = patch.email !== undefined ? cleanText(patch.email, 120) || null : o.email;
    if (!name || name.length < 2) throw new BookingError(400, 'Укажите имя');
    if (phone?.length !== 10) throw new BookingError(400, 'Укажите телефон в формате +7 900 000-00-00');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BookingError(400, 'Проверьте адрес почты');
    db.prepare('UPDATE orders SET name = ?, phone = ?, email = ? WHERE id = ?').run(name, phone, email, o.id);
    log(null, o.id, 'admin_edit', 'контакты');
    return orderView(q.orderByCode.get(o.code));
  }

  function createEvent(data) {
    const title = cleanText(data.title, 120);
    const startsAt = new Date(data.startsAt);
    const doorsAt = data.doorsAt ? new Date(data.doorsAt) : new Date(startsAt.getTime() - 3600e3);
    const price = Math.round(Number(data.price));
    const capacity = data.capacity === undefined || data.capacity === '' ? DEFAULT_CAPACITY : Math.floor(Number(data.capacity));
    if (!title) throw new BookingError(400, 'Укажите название');
    if (Number.isNaN(startsAt.getTime())) throw new BookingError(400, 'Укажите дату и время начала');
    if (Number.isNaN(doorsAt.getTime())) throw new BookingError(400, 'Проверьте время открытия дверей');
    if (doorsAt > startsAt) throw new BookingError(400, 'Двери должны открываться до начала события');
    if (!(price > 0 && price <= 1e6)) throw new BookingError(400, 'Укажите цену билета');
    if (!(capacity >= 1 && capacity <= 5000)) throw new BookingError(400, 'Укажите, сколько билетов продавать');
    const slug = `${title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 40)}-${code(4).toLowerCase()}`;
    const { lastInsertRowid } = db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre, capacity)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`).run(slug, title, cleanText(data.lineup, 200), String(data.description ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 3000),
      startsAt.toISOString(), doorsAt.toISOString(), price, Math.min(price, Math.max(0, Math.round(Number(data.deposit) || 0))), cleanText(data.genre, 40), capacity);
    return getEvent(lastInsertRowid);
  }

  // Вместимость и цену можно поменять после создания. Новая цена действует для новых покупок.
  function updateEvent(eventId, patch = {}) {
    const event = getEvent(eventId);
    let { capacity, price } = event;
    if (patch.capacity !== undefined) {
      capacity = Math.floor(Number(patch.capacity));
      const { sold, held } = computeAvailability(event);
      if (!(capacity >= 1 && capacity <= 5000)) throw new BookingError(400, 'Укажите, сколько билетов продавать');
      if (capacity < sold + held) throw new BookingError(409, `Уже продано или в брони ${ticketsWord(sold + held)}, меньше нельзя`);
    }
    if (patch.price !== undefined) {
      price = Math.round(Number(patch.price));
      if (!(price > 0 && price <= 1e6)) throw new BookingError(400, 'Укажите цену билета');
    }
    db.prepare('UPDATE events SET capacity = ?, price = ?, deposit = MIN(deposit, ?) WHERE id = ?').run(capacity, price, price, event.id);
    onChange(event.id);
    return getEvent(event.id);
  }

  // ---- Заявки на бронь стола ----
  // Гость оставляет контакты, администратор перезванивает и подтверждает. Денег здесь нет.
  const REQUEST_STATUSES = ['new', 'confirmed', 'declined'];
  const venueDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  function requestTable(data = {}) {
    if (data.consent !== true) throw new BookingError(400, 'Отметьте согласие на обработку персональных данных');
    const name = cleanText(data.name, 80);
    const phone = normalizePhone(data.phone);
    const guests = Math.floor(Number(data.guests));
    if (name.length < 2) throw new BookingError(400, 'Укажите имя');
    if (phone.length !== 10) throw new BookingError(400, 'Укажите телефон в формате +7 900 000-00-00');
    if (!(guests >= 1 && guests <= 50)) throw new BookingError(400, 'Укажите, сколько будет гостей');
    let eventId = null, day = null;
    if (data.eventId !== undefined && data.eventId !== null && data.eventId !== '') {
      const event = getEvent(data.eventId);
      if (event.status === 'cancelled') throw new BookingError(409, 'Событие отменено');
      if (new Date(event.starts_at) < now()) throw new BookingError(409, 'Событие уже прошло');
      eventId = event.id;
    } else {
      day = String(data.day ?? '');
      const today = venueDay(now());
      const last = venueDay(new Date(now().getTime() + 180 * 86400e3));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw new BookingError(400, 'Укажите дату');
      if (day < today || day > last) throw new BookingError(400, 'Бронь принимаем с сегодняшнего дня и на полгода вперёд');
    }
    const at = iso();
    db.prepare(`INSERT INTO table_requests (event_id, day, name, phone, guests, comment, created_at, consent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, day, name, phone, guests, cleanText(data.comment, 500), at, at);
    onRequest();
    return { ok: true };
  }

  function listTableRequests() {
    return db.prepare(`SELECT r.*, e.title AS event_title, e.starts_at AS event_starts_at FROM table_requests r
      LEFT JOIN events e ON e.id = r.event_id ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 500`).all().map((r) => ({
      id: r.id, status: r.status, name: r.name, phone: r.phone, guests: r.guests, comment: r.comment, note: r.admin_note,
      createdAt: r.created_at, day: r.day, event: r.event_id ? { id: r.event_id, title: r.event_title, startsAt: r.event_starts_at } : null,
    }));
  }

  function updateTableRequest(id, patch = {}) {
    const r = db.prepare('SELECT * FROM table_requests WHERE id = ?').get(Math.floor(Number(id)) || 0);
    if (!r) throw new BookingError(404, 'Заявка не найдена');
    const status = patch.status ?? r.status;
    if (!REQUEST_STATUSES.includes(status)) throw new BookingError(400, 'Неизвестный статус заявки');
    const note = patch.note !== undefined ? cleanText(patch.note, 300) : r.admin_note;
    db.prepare('UPDATE table_requests SET status = ?, admin_note = ? WHERE id = ?').run(status, note, r.id);
    onRequest();
    return listTableRequests().find((x) => x.id === r.id);
  }

  function setEventStatus(eventId, status) {
    if (!['on_sale', 'closed', 'cancelled'].includes(status)) throw new BookingError(400, 'Неизвестный статус');
    getEvent(eventId);
    db.prepare('UPDATE events SET status = ? WHERE id = ?').run(status, Number(eventId));
    onChange(Number(eventId));
    onTickets(db.prepare("SELECT code FROM tickets WHERE event_id = ? AND status = 'active'").all(Number(eventId)).map((t) => t.code));
    return getEvent(eventId);
  }

  return {
    sweep, availability, listEvents, getEvent: (id) => publicEvent(getEvent(id)), hold, pay, release, getOrder, updateEvent,
    requestTable, listTableRequests, updateTableRequest,
    requestRefund, listRefundRequests, declineRefund, snapshotOrder, restoreSnapshot, adminOrderView, renameGuest, getTicket, printQr, startPayment, attachPayment, applyPayment, markLateRefunded, pendingPayments,
    adminRefundPlan, ticketRefundPlan, recordRefund, checkIn, liveTickets, qrToken, eventReport, adminRefund, adminEditTicket, adminEditOrder, createEvent, setEventStatus,
    allEvents: () => q.events.all().map(parseEvent),
  };
}
