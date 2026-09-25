// Демо-версия сервера: та же логика броней и билетов, но данные живут в браузере
// посетителя (localStorage). Другие посетители этих броней не видят.
import { HALLS, ZONES, findTable, seatPrice } from './halls.js';

const HOLD_MINUTES = 10;
const MAX_SEATS = 20;
const CANCEL_BEFORE_HOURS = 24;
const QR_WINDOW = 30;
const KEY = 'mt.demo.v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rand = (n) => {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPHABET[x % ALPHABET.length]).join('');
};

class DemoError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.data = { error: message, ...extra };
  }
}

// ---- хранилище ----
let memory = { orders: {}, tickets: {} };
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw);
  } catch { /* приватный режим: работаем в памяти вкладки */ }
  memory.orders ||= {};
  memory.tickets ||= {};
  return memory;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* нет места или запрещено */ }
  for (const fn of listeners) fn();
}
const listeners = new Set();
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); for (const fn of listeners) fn(); } });
load();

// ---- события: те же, что на сайте, с датами от сегодняшнего дня ----
// Время событий задаём по Москве, где бы ни находился посетитель.
const MSK = 3 * 3600e3;
const mskDate = (ms) => new Date(ms + MSK); // поля UTC этой даты = московские
function at(day, hh, mm) {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm) - MSK).toISOString();
}
const EVENTS = (() => {
  const today = mskDate(Date.now());
  const toFri = (5 - today.getUTCDay() + 7) % 7;
  const day = (off) => new Date(today.getTime() + off * 86400e3);
  const plan = [
    [1, toFri, 'Караоке-пятница', 'Ведущий Артём Лис, диджей Mira', 'Поём до утра. Песню заказываете через QR на столе, в полночь батл столов. Победителям сет шотов.', 'Караоке', [21, 0], [19, 30], ['karaoke', 'main'], 1000, 500],
    [2, toFri + 1, 'Рок-каверы вживую', 'Группа «Громкая связь»', 'Три сета рок-хитов от девяностых до сегодня. В перерывах можно спеть с группой.', 'Живой звук', [21, 30], [20, 0], ['karaoke', 'main'], 1500, 700],
    [3, toFri + 6, 'Ночь дуэтов', 'Ведущие Катя Рэй и Дима Соль', 'Поём только парами. Пришли без пары? Ведущие найдут. Лучший дуэт выбирает зал.', 'Караоке', [21, 0], [19, 30], ['karaoke'], 900, 500],
    [4, toFri + 7, 'Дискотека 90-х', 'DJ Вова Кассета', 'Хиты с кассет, от «Руки вверх» до Spice Girls. За лучший образ бутылка игристого.', 'Вечеринка', [22, 0], [20, 30], ['karaoke', 'main'], 1200, 600],
    [5, toFri + 12, 'Джазовые стандарты', 'Трио Анны Верес', 'Контрабас, рояль и голос в основном зале.', 'Живой звук', [20, 0], [19, 0], ['main'], 1300, 800],
  ];
  return plan.map(([id, off, title, lineup, description, genre, start, doors, halls, price, deposit]) => ({
    id, slug: `e${id}`, title, lineup, description, genre, halls, price, deposit, status: 'on_sale',
    starts_at: at(day(off), ...start), doors_at: at(day(off), ...doors),
  }));
})();

// Чтобы схема не была пустой, часть мест «уже продана» другим гостям.
// Одинаково для всех посетителей: зависит только от события и стола.
function sampleTaken(eventId, table) {
  let h = 2166136261;
  for (const ch of `${eventId}:${table.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  const r = (h >>> 0) / 4294967296;
  if (table.wholeOnly) return r < 0.35 ? table.seats : 0;
  if (r < 0.28) return table.seats;
  if (r < 0.55) return Math.max(1, Math.floor(table.seats / 2));
  return 0;
}

const getEvent = (id) => {
  const e = EVENTS.find((x) => x.id === Number(id));
  if (!e) throw new DemoError(404, 'Событие не найдено');
  return e;
};

function sweep() {
  const now = Date.now();
  let changed = false;
  for (const o of Object.values(memory.orders)) {
    if (o.status === 'held' && new Date(o.expires_at).getTime() <= now) {
      o.status = 'expired';
      for (const c of o.tickets) memory.tickets[c].status = 'released';
      changed = true;
    }
  }
  if (changed) save();
}

function availability(eventId) {
  sweep();
  const event = getEvent(eventId);
  const mine = {};
  for (const t of Object.values(memory.tickets)) {
    if (t.event_id !== event.id || !['held', 'active', 'used'].includes(t.status)) continue;
    const m = (mine[t.table_id] ||= { sold: 0, held: 0, whole: false, seats: new Set() });
    if (t.status === 'held') m.held++; else m.sold++;
    if (t.whole) m.whole = true;
    m.seats.add(t.seat);
  }
  const tables = {};
  for (const hall of HALLS) {
    if (!event.halls.includes(hall.id)) continue;
    for (const table of hall.tables) {
      const m = mine[table.id] || { sold: 0, held: 0, whole: false };
      const other = sampleTaken(event.id, table);
      const sold = m.sold + other;
      const busy = sold + m.held;
      const free = m.whole ? 0 : Math.max(0, table.seats - busy);
      tables[table.id] = {
        seats: table.seats, sold, held: m.held, free, other,
        price: seatPrice(event, table), wholeAvailable: busy === 0,
        status: free === 0 ? 'full' : busy > 0 ? 'partial' : 'free',
      };
    }
  }
  return { eventId: event.id, status: event.status, tables };
}

function publicEvent(e) {
  const vals = Object.values(availability(e.id).tables);
  return {
    ...e, seatsFree: vals.reduce((s, t) => s + t.free, 0), seatsTotal: vals.reduce((s, t) => s + t.seats, 0),
    minPrice: Math.min(...vals.map((t) => t.price)),
  };
}

function orderView(o) {
  const event = getEvent(o.event_id);
  const tickets = o.tickets.map((c) => {
    const t = memory.tickets[c];
    const table = findTable(t.table_id);
    return {
      code: t.code, table: table.n, tableId: t.table_id, hall: HALLS.find((h) => h.id === table.hallId).title, seat: t.seat,
      price: t.price, whole: t.whole, status: t.status, guestName: t.guest_name, checkedInAt: t.checked_in_at || null,
    };
  });
  const hoursLeft = (new Date(event.starts_at) - Date.now()) / 3600e3;
  return {
    code: o.code, secret: o.secret, status: o.status, total: o.total, name: o.name, phone: o.phone,
    createdAt: o.created_at, expiresAt: o.expires_at,
    expiresIn: o.status === 'held' ? Math.max(0, Math.floor((new Date(o.expires_at) - Date.now()) / 1000)) : null,
    canCancel: o.status === 'paid' && hoursLeft >= CANCEL_BEFORE_HOURS && !tickets.some((t) => t.status === 'used'),
    event: { id: event.id, title: event.title, startsAt: event.starts_at, doorsAt: event.doors_at, lineup: event.lineup, deposit: event.deposit },
    tickets,
  };
}

const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2069\\ufeff]', 'g');
const clean = (v, max) => String(v ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function findOrder(secret) {
  sweep();
  const o = memory.orders[secret];
  if (!o) throw new DemoError(404, 'Заказ не найден на этом устройстве.');
  return o;
}

function hold(eventId, items) {
  sweep();
  const event = getEvent(eventId);
  if (new Date(event.starts_at) < new Date()) throw new DemoError(409, 'Событие уже началось');
  if (!Array.isArray(items) || !items.length) throw new DemoError(400, 'Выберите хотя бы один стол');
  const av = availability(event.id).tables;
  const conflicts = [];
  let total = 0, count = 0;
  for (const it of items) {
    const table = findTable(it.tableId);
    const a = av[table.id];
    const whole = Boolean(it.whole || table.wholeOnly);
    const seats = whole ? table.seats : Math.floor(Number(it.seats));
    if (whole ? !a.wholeAvailable : a.free < seats) conflicts.push({ tableId: table.id, free: a.free });
    it._seats = seats; it._whole = whole; it._table = table;
    total += seats * a.price;
    count += seats;
  }
  if (count > MAX_SEATS) throw new DemoError(400, `В одном заказе не больше ${MAX_SEATS} мест. Большую компанию бронируйте по телефону.`);
  if (conflicts.length) throw new DemoError(409, `Места за столом ${conflicts.map((c) => findTable(c.tableId).n).join(', ')} уже заняли. Выберите другой стол.`, { conflicts });
  const secret = rand(24);
  const order = {
    code: `MT-${rand(8)}`, secret, event_id: event.id, status: 'held', total, tickets: [],
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + HOLD_MINUTES * 60e3).toISOString(),
  };
  for (const it of items) {
    const taken = new Set(Object.values(memory.tickets).filter((t) => t.event_id === event.id && t.table_id === it._table.id && ['held', 'active', 'used'].includes(t.status)).map((t) => t.seat));
    let seat = sampleTaken(event.id, it._table) + 1;
    for (let i = 0; i < it._seats; i++) {
      while (taken.has(seat)) seat++;
      const code = rand(12);
      memory.tickets[code] = { code, order: secret, event_id: event.id, table_id: it._table.id, seat, price: seatPrice(event, it._table), whole: it._whole, status: 'held' };
      order.tickets.push(code);
      seat++;
    }
  }
  memory.orders[secret] = order;
  save();
  return orderView(order);
}

function pay(secret, body) {
  const o = findOrder(secret);
  if (o.status === 'paid') return orderView(o);
  if (o.status !== 'held') throw new DemoError(410, 'Бронь истекла. Выберите столы заново.');
  const name = clean(body.name, 80);
  const phone = normPhone(body.phone);
  if (name.length < 2) throw new DemoError(400, 'Укажите имя');
  if (phone.length !== 10) throw new DemoError(400, 'Укажите телефон в формате +7 900 000-00-00');
  o.status = 'paid'; o.name = name; o.phone = phone; o.expires_at = null;
  const guests = body.guests && typeof body.guests === 'object' ? body.guests : {};
  for (const c of o.tickets) {
    const t = memory.tickets[c];
    t.status = 'active';
    t.guest_name = (Object.hasOwn(guests, c) && clean(guests[c], 80)) || name;
  }
  save();
  return orderView(o);
}

function release(secret) {
  const o = findOrder(secret);
  if (o.status === 'held') {
    o.status = 'cancelled';
    for (const c of o.tickets) memory.tickets[c].status = 'released';
    save();
  }
  return orderView(o);
}

function cancel(secret) {
  const o = findOrder(secret);
  if (!orderView(o).canCancel) throw new DemoError(409, `Онлайн вернуть билеты можно за ${CANCEL_BEFORE_HOURS} часа до начала. Позвоните администратору.`);
  o.status = 'refunded';
  for (const c of o.tickets) memory.tickets[c].status = 'cancelled';
  save();
  return orderView(o);
}

function rename(secret, code, name) {
  const o = findOrder(secret);
  const t = memory.tickets[code];
  if (!t || t.order !== secret) throw new DemoError(404, 'Билет не найден в этом заказе');
  t.guest_name = clean(name, 80) || o.name;
  save();
  return orderView(o);
}

function lookup(code, phone) {
  sweep();
  const o = Object.values(memory.orders).find((x) => x.code === String(code || '').trim().toUpperCase());
  if (!o || !o.phone || o.phone !== normPhone(phone)) throw new DemoError(404, 'Заказ не найден. В демо-версии билеты хранятся только на устройстве, где их купили.');
  return orderView(o);
}

function getTicket(code) {
  sweep();
  const t = memory.tickets[String(code).toUpperCase()];
  if (!t || t.status === 'held' || t.status === 'released') throw new DemoError(404, 'Билет не найден на этом устройстве');
  const v = orderView(memory.orders[t.order]);
  return { ...v.tickets.find((x) => x.code === t.code), event: v.event };
}

// ---- «живой» QR: код меняется каждые 30 секунд ----
const windowNow = () => Math.floor(Date.now() / (QR_WINDOW * 1000));
async function digest(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf));
}
async function liveTickets(codes) {
  sweep();
  const w = windowNow();
  const out = {};
  for (const c of codes) {
    const t = memory.tickets[c];
    if (!t || t.status === 'held' || t.status === 'released') continue;
    const entry = { status: t.status, checkedInAt: t.checked_in_at || null };
    if (t.status === 'active') {
      const b = await digest(`${c}:${w}`);
      entry.qr = `${c}.${b.slice(0, 9).map((x) => ALPHABET[x % 32]).join('')}`;
      entry.pin = b.slice(9, 15).map((x) => ALPHABET[x % 32]).join('');
    }
    out[c] = entry;
  }
  const validFor = Math.ceil(((w + 1) * QR_WINDOW * 1000 - Date.now()) / 1000);
  return { tickets: out, validFor, window: QR_WINDOW };
}

export function watchAvailability(eventId, cb) {
  const push = () => cb(availability(eventId));
  listeners.add(push);
  push();
  const t = setInterval(push, 15000); // снимаем истёкшие брони
  return () => { listeners.delete(push); clearInterval(t); };
}

export function watchTickets(codes, cb) {
  let stopped = false;
  const push = async () => { const d = await liveTickets(codes); if (!stopped) cb(d); };
  listeners.add(push);
  push();
  let w = windowNow();
  const t = setInterval(() => { if (windowNow() !== w) { w = windowNow(); push(); } }, 500);
  return () => { stopped = true; listeners.delete(push); clearInterval(t); };
}

// ---- та же форма вызова, что у настоящего API сайта ----
export async function handle(path, { method = 'GET', body = {} } = {}) {
  const url = new URL(path, 'https://demo.local');
  const p = url.pathname;
  let m;
  if (p === '/api/config') return { halls: HALLS, zones: ZONES, holdMinutes: HOLD_MINUTES, cancelBeforeHours: CANCEL_BEFORE_HOURS, paymentsEnabled: true };
  if (p === '/api/events') return EVENTS.map(publicEvent);
  if ((m = p.match(/^\/api\/events\/(\d+)$/))) return publicEvent(getEvent(m[1]));
  if ((m = p.match(/^\/api\/events\/(\d+)\/availability$/))) return availability(m[1]);
  if ((m = p.match(/^\/api\/events\/(\d+)\/hold$/)) && method === 'POST') return hold(m[1], body.items);
  if (p === '/api/orders/lookup') return lookup(url.searchParams.get('code'), url.searchParams.get('phone'));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/pay$/))) return pay(decodeURIComponent(m[1]), body);
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/release$/))) return release(decodeURIComponent(m[1]));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/cancel$/))) return cancel(decodeURIComponent(m[1]));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/guest$/))) return rename(decodeURIComponent(m[1]), body.ticket, body.name);
  if ((m = p.match(/^\/api\/orders\/([^/]+)$/))) return orderView(findOrder(decodeURIComponent(m[1])));
  if ((m = p.match(/^\/api\/tickets\/([^/]+)$/))) return getTicket(decodeURIComponent(m[1]));
  throw new DemoError(404, 'Не найдено');
}
