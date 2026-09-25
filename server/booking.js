import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { HALLS, findTable, seatPrice } from './halls.js';
import { tx } from './db.js';

export const HOLD_MINUTES = 10;
export const MAX_SEATS_PER_ORDER = 20;
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

export const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

export function createBooking(db, { onChange = () => {}, onTickets = () => {}, now = () => new Date(), demoPayments = true } = {}) {
  const q = {
    event: db.prepare('SELECT * FROM events WHERE id = ?'),
    events: db.prepare("SELECT * FROM events WHERE status != 'cancelled' ORDER BY starts_at"),
    takenSeats: db.prepare(`SELECT table_id, seat_no, status, whole_table FROM tickets
      WHERE event_id = ? AND status IN ('held', 'active', 'used')`),
    orderByCode: db.prepare('SELECT * FROM orders WHERE code = ?'),
    orderBySecret: db.prepare('SELECT * FROM orders WHERE secret = ?'),
    orderTickets: db.prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY table_id, seat_no'),
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
    return { ...row, halls: JSON.parse(row.halls) };
  }

  function getEvent(id) {
    const e = parseEvent(q.event.get(Number(id)));
    if (!e) throw new BookingError(404, 'Событие не найдено');
    return e;
  }

  // Снимает просроченные брони. Вызывается перед любой операцией с местами и по таймеру.
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
    const taken = new Map();
    for (const s of q.takenSeats.all(event.id)) {
      if (!taken.has(s.table_id)) taken.set(s.table_id, { sold: 0, held: 0, whole: false });
      const t = taken.get(s.table_id);
      if (s.status === 'held') t.held++;
      else t.sold++;
      if (s.whole_table) t.whole = true;
    }
    const tables = {};
    for (const hall of HALLS) {
      if (!event.halls.includes(hall.id)) continue;
      for (const table of hall.tables) {
        const t = taken.get(table.id) || { sold: 0, held: 0, whole: false };
        const busy = t.sold + t.held;
        const free = t.whole ? 0 : table.seats - busy;
        tables[table.id] = {
          seats: table.seats,
          sold: t.sold,
          held: t.held,
          free,
          price: seatPrice(event, table),
          // стол можно взять целиком, только если за ним ещё никого нет
          wholeAvailable: busy === 0,
          status: free === 0 ? 'full' : busy > 0 ? 'partial' : 'free',
        };
      }
    }
    return { eventId: event.id, status: event.status, tables };
  }

  function publicEvent(e) {
    const av = availability(e.id);
    const vals = Object.values(av.tables);
    const free = vals.reduce((s, t) => s + t.free, 0);
    const total = vals.reduce((s, t) => s + t.seats, 0);
    const minPrice = vals.length ? Math.min(...vals.map((t) => t.price)) : e.price;
    return { ...e, seatsFree: free, seatsTotal: total, minPrice };
  }

  function listEvents() {
    sweep();
    const cutoff = new Date(now().getTime() - 6 * 3600e3).toISOString();
    return q.events.all().map(parseEvent).filter((e) => e.starts_at >= cutoff).map(publicEvent);
  }

  // items: [{ tableId, seats, whole }]
  function hold(eventId, items) {
    if (!demoPayments) throw new BookingError(503, 'Онлайн-оплата пока не подключена. Позвоните нам, чтобы забронировать стол.');
    sweep();
    const event = getEvent(eventId);
    if (event.status !== 'on_sale') throw new BookingError(409, 'Продажа билетов на это событие закрыта');
    if (new Date(event.starts_at) < now()) throw new BookingError(409, 'Событие уже началось');
    if (!Array.isArray(items) || !items.length) throw new BookingError(400, 'Выберите хотя бы один стол');
    if (items.length > 40) throw new BookingError(400, 'Слишком много столов в одном заказе');

    const merged = new Map();
    for (const it of items) {
      const table = typeof it?.tableId === 'string' ? findTable(it.tableId) : null;
      if (!table || !event.halls.includes(table.hallId)) throw new BookingError(400, 'Один из выбранных столов недоступен на этом событии');
      const whole = Boolean(it.whole) || Boolean(table.wholeOnly);
      const seats = whole ? table.seats : Math.floor(Number(it.seats));
      if (!whole && !(seats >= 1)) throw new BookingError(400, `Укажите число мест за столом ${table.n}`);
      if (seats > table.seats) throw new BookingError(400, `За столом ${table.n} всего ${table.seats} мест${table.seats < 5 ? 'а' : ''}`);
      if (merged.has(table.id)) throw new BookingError(400, `Стол ${table.n} выбран дважды`);
      merged.set(table.id, { table, seats, whole });
    }
    const totalSeats = [...merged.values()].reduce((s, x) => s + x.seats, 0);
    if (totalSeats > MAX_SEATS_PER_ORDER) {
      throw new BookingError(400, `В одном заказе не больше ${MAX_SEATS_PER_ORDER} мест. Большую компанию бронируйте по телефону.`);
    }

    const result = tx(db, () => {
      const av = computeAvailability(getEvent(event.id)).tables;
      const conflicts = [];
      for (const { table, seats, whole } of merged.values()) {
        const a = av[table.id];
        if (whole ? !a.wholeAvailable : a.free < seats) conflicts.push({ tableId: table.id, free: a.free });
      }
      if (conflicts.length) {
        const names = conflicts.map((c) => findTable(c.tableId).n).join(', ');
        throw new BookingError(409, `Места за столом ${names} уже заняли. Выберите другой стол.`, { conflicts });
      }
      const taken = new Map();
      for (const s of q.takenSeats.all(event.id)) {
        if (!taken.has(s.table_id)) taken.set(s.table_id, new Set());
        taken.get(s.table_id).add(s.seat_no);
      }
      let total = 0;
      for (const { table, seats } of merged.values()) total += seatPrice(event, table) * seats;

      const createdAt = iso();
      const expiresAt = new Date(now().getTime() + HOLD_MINUTES * 60e3).toISOString();
      const order = { code: `MT-${code(8)}`, secret: randomBytes(18).toString('base64url') };
      const { lastInsertRowid: orderId } = q.insOrder.run(order.code, order.secret, event.id, total, createdAt, expiresAt);
      for (const { table, seats, whole } of merged.values()) {
        const busy = taken.get(table.id) || new Set();
        let seatNo = 1;
        for (let i = 0; i < seats; i++) {
          while (busy.has(seatNo)) seatNo++;
          const { lastInsertRowid } = q.insTicket.run(code(12), orderId, event.id, table.id, seatNo, seatPrice(event, table), whole ? 1 : 0, randomBytes(9).toString('base64url'));
          log(Number(lastInsertRowid), Number(orderId), 'held');
          seatNo++;
        }
      }
      return order.secret;
    });
    onChange(event.id);
    return getOrder({ secret: result });
  }

  function orderView(o) {
    const event = getEvent(o.event_id);
    const tickets = q.orderTickets.all(o.id).map((t) => {
      const table = findTable(t.table_id);
      const hall = HALLS.find((h) => h.id === table.hallId);
      return {
        code: t.code, table: table.n, tableId: t.table_id, hall: hall.title, seat: t.seat_no,
        price: t.price, whole: Boolean(t.whole_table), status: t.status, guestName: t.guest_name,
        checkedInAt: t.checked_in_at,
      };
    });
    const hoursLeft = (new Date(event.starts_at) - now()) / 3600e3;
    return {
      code: o.code, secret: o.secret, status: o.status, total: o.total, name: o.name, phone: o.phone, email: o.email,
      createdAt: o.created_at, expiresAt: o.expires_at, paidAt: o.paid_at,
      // сколько секунд осталось держать места — таймер на клиенте не зависит от его часов
      expiresIn: o.status === 'held' && o.expires_at ? Math.max(0, Math.floor((new Date(o.expires_at) - now()) / 1000)) : null,
      canCancel: o.status === 'paid' && hoursLeft >= CANCEL_BEFORE_HOURS && !tickets.some((t) => t.status === 'used'),
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

  // Оплата. Платёжный шлюз подключается здесь: сейчас оплата подтверждается сразу (демо-режим).
  function pay(secret, { name, phone, email, guests } = {}) {
    if (!demoPayments) throw new BookingError(503, 'Онлайн-оплата пока не подключена. Позвоните нам, чтобы забронировать стол.');
    const o = findOrder({ secret });
    // Пока гость оформлял, событие могли закрыть, отменить или оно уже началось
    if (o.status === 'held') {
      const ev = getEvent(o.event_id);
      if (ev.status !== 'on_sale' || new Date(ev.starts_at) < now()) {
        release(secret);
        throw new BookingError(409, ev.status === 'cancelled' ? 'Событие отменено, бронь снята.' : 'Продажа на это событие уже закрыта, бронь снята.');
      }
    }
    const guestNames = guests && typeof guests === 'object' && !Array.isArray(guests) ? guests : {};
    if (o.status === 'paid') return orderView(o);
    if (o.status !== 'held') throw new BookingError(410, 'Бронь истекла. Выберите столы заново.');
    const cleanName = cleanText(name, 80);
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = cleanText(email, 120);
    if (cleanName.length < 2) throw new BookingError(400, 'Укажите имя');
    if (cleanPhone.length !== 10) throw new BookingError(400, 'Укажите телефон в формате +7 900 000-00-00');
    if (cleanEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new BookingError(400, 'Проверьте адрес почты');

    tx(db, () => {
      db.prepare("UPDATE orders SET status = 'paid', name = ?, phone = ?, email = ?, paid_at = ?, expires_at = NULL WHERE id = ?")
        .run(cleanName, cleanPhone, cleanEmail || null, iso(), o.id);
      const setGuest = db.prepare("UPDATE tickets SET status = 'active', guest_name = ? WHERE id = ?");
      for (const t of q.orderTickets.all(o.id)) {
        const guest = (Object.hasOwn(guestNames, t.code) && cleanText(guestNames[t.code], 80)) || cleanName;
        setGuest.run(guest, t.id);
        log(t.id, o.id, 'paid');
      }
    });
    onChange(o.event_id);
    return orderView(q.orderBySecret.get(secret));
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
      q.releaseTickets.run('cancelled', o.id);
      log(null, o.id, 'refunded', note);
    });
    onChange(o.event_id);
    onTickets(q.orderTickets.all(o.id).map((t) => t.code));
    return orderView(q.orderByCode.get(o.code));
  }

  function cancelByGuest(secret) {
    const view = getOrder({ secret });
    if (!view.canCancel) {
      if (view.status === 'refunded') throw new BookingError(409, 'Заказ уже возвращён');
      if (view.status !== 'paid') throw new BookingError(409, 'Заказ не оплачен, возвращать нечего');
      if (view.tickets.some((t) => t.status === 'used')) throw new BookingError(409, 'По этому заказу гости уже прошли. Позвоните администратору.');
      throw new BookingError(409, `Онлайн вернуть билеты можно за ${CANCEL_BEFORE_HOURS} часа до начала. Позвоните администратору.`);
    }
    return refund(q.orderBySecret.get(secret), 'guest');
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

  // По ссылке на билет гость видит только своё место: без номера заказа,
  // контактов покупателя и чужих билетов — иначе один билет открывал бы весь заказ.
  function getTicket(ticketCode) {
    const t = q.ticketByCode.get(String(ticketCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Билет не найден');
    const full = ticketView(t);
    const { code, table, hall, seat, whole, price, status, guestName, checkedInAt, event } = full;
    return {
      code, table, hall, seat, whole, price, status, guestName, checkedInAt,
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
      out[t.code] = { status, checkedInAt: t.checked_in_at, ...(live ? { qr: live.token, pin: live.pin } : {}) };
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

  // Что видит контролёр: только место и имя гостя, без номера заказа и контактов.
  function gateView(t) {
    const full = ticketView(t);
    const { table, hall, seat, whole, status, guestName, checkedInAt, event } = full;
    return { ref: t.gate_id.slice(-4), table, hall, seat, whole, status, guestName, checkedInAt, event: { title: event.title, startsAt: event.startsAt } };
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

  function adminRefund(orderCode) {
    const o = q.orderByCode.get(String(orderCode).trim().toUpperCase());
    if (!o) throw new BookingError(404, 'Заказ не найден');
    if (o.status !== 'paid') throw new BookingError(409, 'Вернуть можно только оплаченный заказ');
    if (q.orderTickets.all(o.id).some((t) => t.status === 'used')) {
      throw new BookingError(409, 'Часть гостей уже прошла, весь заказ вернуть нельзя. Частичный возврат сделайте на кассе.');
    }
    return refund(o, 'admin');
  }

  function createEvent(data) {
    const title = cleanText(data.title, 120);
    const startsAt = new Date(data.startsAt);
    const doorsAt = data.doorsAt ? new Date(data.doorsAt) : new Date(startsAt.getTime() - 3600e3);
    const halls = (Array.isArray(data.halls) ? data.halls : []).filter((h) => HALLS.some((x) => x.id === h));
    const price = Math.round(Number(data.price));
    if (!title) throw new BookingError(400, 'Укажите название');
    if (Number.isNaN(startsAt.getTime())) throw new BookingError(400, 'Укажите дату и время начала');
    if (Number.isNaN(doorsAt.getTime())) throw new BookingError(400, 'Проверьте время открытия дверей');
    if (doorsAt > startsAt) throw new BookingError(400, 'Двери должны открываться до начала события');
    if (!halls.length) throw new BookingError(400, 'Выберите хотя бы один зал');
    if (!(price > 0 && price <= 1e6)) throw new BookingError(400, 'Укажите цену билета');
    const slug = `${title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 40)}-${code(4).toLowerCase()}`;
    const { lastInsertRowid } = db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slug, title, cleanText(data.lineup, 200), String(data.description ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 3000),
      startsAt.toISOString(), doorsAt.toISOString(), JSON.stringify(halls), price, Math.min(price, Math.max(0, Math.round(Number(data.deposit) || 0))), cleanText(data.genre, 40));
    return getEvent(lastInsertRowid);
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
    sweep, availability, listEvents, getEvent: (id) => publicEvent(getEvent(id)), hold, pay, release, getOrder,
    cancelByGuest, renameGuest, getTicket, printQr, checkIn, liveTickets, qrToken, eventReport, adminRefund, createEvent, setEventStatus,
    allEvents: () => q.events.all().map(parseEvent),
  };
}
