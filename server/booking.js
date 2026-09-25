import { randomBytes, randomInt } from 'node:crypto';
import { HALLS, findTable, seatPrice } from './halls.js';
import { tx } from './db.js';

export const HOLD_MINUTES = 10;
export const MAX_SEATS_PER_ORDER = 20;
export const CANCEL_BEFORE_HOURS = 24;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (len) => Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export class BookingError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

export function createBooking(db, { onChange = () => {}, now = () => new Date() } = {}) {
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
    insTicket: db.prepare(`INSERT INTO tickets (code, order_id, event_id, table_id, seat_no, price, whole_table, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'held')`),
    log: db.prepare('INSERT INTO ticket_log (ticket_id, order_id, action, at, note) VALUES (?, ?, ?, ?, ?)'),
    expired: db.prepare("SELECT id, event_id FROM orders WHERE status = 'held' AND expires_at <= ?"),
    setOrderStatus: db.prepare('UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?'),
    releaseTickets: db.prepare("UPDATE tickets SET status = ? WHERE order_id = ? AND status IN ('held', 'active')"),
  };

  const iso = () => now().toISOString();
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
    sweep();
    const event = getEvent(eventId);
    if (event.status !== 'on_sale') throw new BookingError(409, 'Продажа билетов на это событие закрыта');
    if (new Date(event.starts_at) < now()) throw new BookingError(409, 'Событие уже началось');
    if (!Array.isArray(items) || !items.length) throw new BookingError(400, 'Выберите хотя бы один стол');

    const merged = new Map();
    for (const it of items) {
      const table = findTable(it?.tableId);
      if (!table || !event.halls.includes(table.hallId)) throw new BookingError(400, `Стол ${it?.tableId} недоступен на этом событии`);
      const whole = Boolean(it.whole) || Boolean(table.wholeOnly);
      const seats = whole ? table.seats : Math.floor(Number(it.seats));
      if (!whole && !(seats >= 1)) throw new BookingError(400, `Укажите число мест за столом ${table.n}`);
      if (merged.has(table.id)) throw new BookingError(400, `Стол ${table.n} выбран дважды`);
      merged.set(table.id, { table, seats, whole });
    }
    const totalSeats = [...merged.values()].reduce((s, x) => s + x.seats, 0);
    if (totalSeats > MAX_SEATS_PER_ORDER) {
      throw new BookingError(400, `В одном заказе не больше ${MAX_SEATS_PER_ORDER} мест. Для больших компаний позвоните нам.`);
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
        throw new BookingError(409, `Пока вы выбирали, места за столом ${names} заняли. Схема обновлена — выберите заново.`, { conflicts });
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
      const order = { code: `MT-${code(6)}`, secret: randomBytes(18).toString('base64url') };
      const { lastInsertRowid: orderId } = q.insOrder.run(order.code, order.secret, event.id, total, createdAt, expiresAt);
      for (const { table, seats, whole } of merged.values()) {
        const busy = taken.get(table.id) || new Set();
        let seatNo = 1;
        for (let i = 0; i < seats; i++) {
          while (busy.has(seatNo)) seatNo++;
          const { lastInsertRowid } = q.insTicket.run(code(10), orderId, event.id, table.id, seatNo, seatPrice(event, table), whole ? 1 : 0);
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
      canCancel: o.status === 'paid' && hoursLeft >= CANCEL_BEFORE_HOURS && !tickets.some((t) => t.status === 'used'),
      event: { id: event.id, title: event.title, startsAt: event.starts_at, doorsAt: event.doors_at, lineup: event.lineup, deposit: event.deposit },
      tickets,
    };
  }

  function findOrder({ secret, code: orderCode, phone }) {
    sweep();
    let o = null;
    if (secret) o = q.orderBySecret.get(String(secret));
    else if (orderCode) {
      o = q.orderByCode.get(String(orderCode).trim().toUpperCase());
      if (o && (!o.phone || normalizePhone(phone) !== o.phone)) o = null;
    }
    if (!o) throw new BookingError(404, 'Заказ не найден. Проверьте номер заказа и телефон, указанный при покупке.');
    return o;
  }

  function getOrder(auth) {
    return orderView(findOrder(auth));
  }

  // Оплата. Платёжный шлюз подключается здесь: сейчас оплата подтверждается сразу (демо-режим).
  function pay(secret, { name, phone, email, guests = {} }) {
    const o = findOrder({ secret });
    if (o.status === 'paid') return orderView(o);
    if (o.status !== 'held') throw new BookingError(410, 'Время брони истекло, места освобождены. Выберите столы заново.');
    const cleanName = String(name || '').trim().slice(0, 80);
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = String(email || '').trim().slice(0, 120);
    if (cleanName.length < 2) throw new BookingError(400, 'Укажите имя — по нему вас встретят на входе');
    if (cleanPhone.length !== 10) throw new BookingError(400, 'Укажите телефон в формате +7 900 000-00-00');
    if (cleanEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new BookingError(400, 'Проверьте адрес почты');

    tx(db, () => {
      db.prepare("UPDATE orders SET status = 'paid', name = ?, phone = ?, email = ?, paid_at = ?, expires_at = NULL WHERE id = ?")
        .run(cleanName, cleanPhone, cleanEmail || null, iso(), o.id);
      const setGuest = db.prepare("UPDATE tickets SET status = 'active', guest_name = ? WHERE id = ?");
      for (const t of q.orderTickets.all(o.id)) {
        const guest = String(guests[t.code] || '').trim().slice(0, 80) || cleanName;
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
    return orderView(q.orderByCode.get(o.code));
  }

  function cancelByGuest(secret) {
    const view = getOrder({ secret });
    if (!view.canCancel) {
      throw new BookingError(409, `Вернуть билеты можно не позднее чем за ${CANCEL_BEFORE_HOURS} часа до начала. Позвоните администратору.`);
    }
    return refund(q.orderBySecret.get(secret), 'guest');
  }

  function renameGuest(secret, ticketCode, guestName) {
    const o = findOrder({ secret });
    const t = q.ticketByCode.get(String(ticketCode));
    if (!t || t.order_id !== o.id) throw new BookingError(404, 'Билет не найден в этом заказе');
    if (t.status !== 'active') throw new BookingError(409, 'Имя можно поменять только у действующего билета');
    db.prepare('UPDATE tickets SET guest_name = ? WHERE id = ?').run(String(guestName || '').trim().slice(0, 80) || o.name, t.id);
    log(t.id, o.id, 'renamed');
    return orderView(o);
  }

  function ticketView(t) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(t.order_id);
    const view = orderView(o);
    return { ...view.tickets.find((x) => x.code === t.code), order: o.code, event: view.event, orderStatus: o.status };
  }

  function getTicket(ticketCode) {
    const t = q.ticketByCode.get(String(ticketCode).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!t || t.status === 'held' || t.status === 'released') throw new BookingError(404, 'Билет не найден');
    return ticketView(t);
  }

  // ---- администратор ----

  function checkIn(ticketCode, eventId) {
    // принимаем и сам код, и ссылку из QR (…/ticket.html?t=CODE)
    const raw = String(ticketCode || '');
    const fromUrl = raw.match(/[?&]t=([A-Za-z0-9-]+)/);
    const t = q.ticketByCode.get((fromUrl ? fromUrl[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!t) throw new BookingError(404, 'Такого билета нет');
    if (eventId && t.event_id !== Number(eventId)) {
      return { result: 'wrong_event', ticket: ticketView(t) };
    }
    if (t.status === 'used') return { result: 'already_used', ticket: ticketView(t) };
    if (t.status !== 'active') return { result: 'invalid', ticket: ticketView(t) };
    db.prepare("UPDATE tickets SET status = 'used', checked_in_at = ? WHERE id = ?").run(iso(), t.id);
    log(t.id, t.order_id, 'checked_in');
    onChange(t.event_id);
    return { result: 'ok', ticket: ticketView(q.ticketByCode.get(t.code)) };
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
    return refund(o, 'admin');
  }

  function createEvent(data) {
    const title = String(data.title || '').trim();
    const startsAt = new Date(data.startsAt);
    const doorsAt = data.doorsAt ? new Date(data.doorsAt) : new Date(startsAt.getTime() - 3600e3);
    const halls = (Array.isArray(data.halls) ? data.halls : []).filter((h) => HALLS.some((x) => x.id === h));
    const price = Math.round(Number(data.price));
    if (!title) throw new BookingError(400, 'Укажите название');
    if (Number.isNaN(startsAt.getTime())) throw new BookingError(400, 'Укажите дату и время начала');
    if (!halls.length) throw new BookingError(400, 'Выберите хотя бы один зал');
    if (!(price > 0)) throw new BookingError(400, 'Укажите цену билета');
    const slug = `${title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 40)}-${code(4).toLowerCase()}`;
    const { lastInsertRowid } = db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(slug, title, String(data.lineup || ''), String(data.description || ''),
      startsAt.toISOString(), doorsAt.toISOString(), JSON.stringify(halls), price, Math.max(0, Math.round(Number(data.deposit) || 0)), String(data.genre || ''));
    return getEvent(lastInsertRowid);
  }

  function setEventStatus(eventId, status) {
    if (!['on_sale', 'closed', 'cancelled'].includes(status)) throw new BookingError(400, 'Неизвестный статус');
    getEvent(eventId);
    db.prepare('UPDATE events SET status = ? WHERE id = ?').run(status, Number(eventId));
    onChange(Number(eventId));
    return getEvent(eventId);
  }

  return {
    sweep, availability, listEvents, getEvent: (id) => publicEvent(getEvent(id)), hold, pay, release, getOrder,
    cancelByGuest, renameGuest, getTicket, checkIn, eventReport, adminRefund, createEvent, setEventStatus,
    allEvents: () => q.events.all().map(parseEvent),
  };
}
