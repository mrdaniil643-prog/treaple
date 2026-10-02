// Демо-версия сервера: та же логика броней и билетов, но данные живут в браузере
// посетителя (localStorage). Другие посетители этих броней не видят.

const HOLD_MINUTES = 10;
const MAX_TICKETS = 10;
const DEFAULT_CAPACITY = 136;
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
  memory.events ||= [DEFAULT_EVENT()];
  memory.requests ||= [];
  // у тех, кто открывал демо раньше, событие по умолчанию ещё старое
  for (const e of memory.events) {
    if (e.slug !== 'e1') continue;
    if (e.title === 'Караоке-вечер' || e.description?.startsWith('Отчётный концерт и открытый')) Object.assign(e, POSTER);
    if (e.starts_at === at(21, 0)) Object.assign(e, { starts_at: at(16, 0), doors_at: at(15, 0) });
  }
  // раньше билеты продавались на места за столами: теперь входные, у события вместимость
  for (const e of memory.events) { e.capacity ||= DEFAULT_CAPACITY; delete e.halls; if (e.slug === 'e1' && e.deposit === 500) e.deposit = 0; }
  for (const t of Object.values(memory.tickets)) { delete t.table_id; delete t.seat; delete t.whole; }
  return memory;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* нет места или запрещено */ }
  for (const fn of listeners) fn();
}
const listeners = new Set();

// ---- событие по умолчанию: то же, что на сайте, 25 октября 2026 ----
// Время задаём по Хабаровску (UTC+10), где бы ни находился посетитель.
const VENUE_OFFSET = 10 * 3600e3;
const at = (hh, mm) => new Date(Date.UTC(2026, 9, 25, hh, mm) - VENUE_OFFSET).toISOString();
// sample: на схеме часть мест «уже продана» другим гостям, чтобы зал не был пустым
const POSTER = {
  title: 'Отчётный концерт × Открытый микрофон', lineup: 'ROCK SOME! & Easy Vocal при поддержке Capital Show', genre: 'Концерт', image: 'img/events/otchetny-koncert-25-10.jpg',
  description: 'Выступят те, кто готовил песни с Rock Some! и Easy Vocal, и приглашённые артисты. Разыграем сертификаты от партнёров. Хотите выступить сами? Подготовка с 1 октября, участие 1000\u00a0₽.',
};
const DEFAULT_EVENT = () => ({
  id: 1, slug: 'e1', ...POSTER,
  price: 1000, deposit: 0, capacity: DEFAULT_CAPACITY, status: 'on_sale', starts_at: at(16, 0), doors_at: at(15, 0), sample: true,
});
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); for (const fn of listeners) fn(); } });
load();

// Чтобы продажи не выглядели пустыми, часть билетов «уже продана» другим гостям.
const sampleSold = (event) => (event.sample ? 58 : 0);

const getEvent = (id) => {
  const e = memory.events.find((x) => x.id === Number(id));
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
  let sold = sampleSold(event), held = 0;
  for (const t of Object.values(memory.tickets)) {
    if (t.event_id !== event.id || !['held', 'active', 'used'].includes(t.status)) continue;
    if (t.status === 'held') held++; else sold++;
  }
  const free = Math.max(0, event.capacity - sold - held);
  return { eventId: event.id, status: event.status, capacity: event.capacity, sold, held, free, price: event.price };
}

function publicEvent(e) {
  return { ...e, ticketsLeft: availability(e.id).free };
}

function orderView(o) {
  const event = getEvent(o.event_id);
  const tickets = o.tickets.map((c) => {
    const t = memory.tickets[c];
    return { code: t.code, price: t.price, paidPrice: t.price, status: t.status, guestName: t.guest_name, checkedInAt: t.checked_in_at || null };
  });
  const hoursLeft = (new Date(event.starts_at) - Date.now()) / 3600e3;
  return {
    code: o.code, secret: o.secret, status: o.status, total: o.total, name: o.name, phone: o.phone, email: o.email || null,
    createdAt: o.created_at, expiresAt: o.expires_at, paidAt: o.paid_at || null,
    expiresIn: o.status === 'held' ? Math.max(0, Math.floor((new Date(o.expires_at) - Date.now()) / 1000)) : null,
    canRequestRefund: o.status === 'paid' && hoursLeft > 0 && !tickets.some((t) => t.status === 'used') && o.refund_request?.status !== 'pending',
    refundRequest: o.refund_request || null,
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

function hold(eventId, qty) {
  sweep();
  const event = getEvent(eventId);
  if (event.status !== 'on_sale') throw new DemoError(409, 'Продажа билетов на это событие закрыта');
  if (new Date(event.starts_at) < new Date()) throw new DemoError(409, 'Событие уже началось');
  const n = typeof qty === 'number' || typeof qty === 'string' ? Math.floor(Number(qty)) : NaN;
  if (!(n >= 1)) throw new DemoError(400, 'Укажите, сколько нужно билетов');
  if (n > MAX_TICKETS) throw new DemoError(400, `В одном заказе не больше ${MAX_TICKETS} билетов`);
  const { free } = availability(event.id);
  if (free < n) throw new DemoError(409, free ? `Осталось билетов: ${free}` : 'Билеты закончились', { free });
  const secret = rand(24);
  const order = {
    code: `MT-${rand(8)}`, secret, event_id: event.id, status: 'held', total: event.price * n, tickets: [],
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + HOLD_MINUTES * 60e3).toISOString(),
  };
  for (let i = 0; i < n; i++) {
    const code = rand(12);
    memory.tickets[code] = { code, order: secret, event_id: event.id, price: event.price, status: 'held' };
    order.tickets.push(code);
  }
  memory.orders[secret] = order;
  save();
  return orderView(order);
}

function pay(secret, body) {
  const o = findOrder(secret);
  if (o.status === 'paid') return orderView(o);
  if (o.status !== 'held') throw new DemoError(410, 'Бронь истекла. Оформите билеты заново.');
  const name = clean(body.name, 80);
  const phone = normPhone(body.phone);
  if (name.length < 2) throw new DemoError(400, 'Укажите имя');
  if (phone.length !== 10) throw new DemoError(400, 'Укажите телефон в формате +7 900 000-00-00');
  if (body.consent !== true) throw new DemoError(400, 'Отметьте согласие на обработку персональных данных');
  o.status = 'paid'; o.name = name; o.phone = phone; o.email = clean(body.email, 120) || null; o.expires_at = null; o.paid_at = new Date().toISOString();
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

// как на сайте: гость отправляет заявку, деньги возвращает администратор
function requestRefund(secret, body = {}) {
  const o = findOrder(secret);
  if (o.refund_request?.status === 'pending') return orderView(o);
  if (!orderView(o).canRequestRefund) throw new DemoError(409, o.status === 'refunded' ? 'Заказ уже возвращён' : 'Вернуть этот заказ нельзя. Позвоните администратору.');
  o.refund_request = { status: 'pending', at: new Date().toISOString(), reason: clean(body.reason, 500), note: '' };
  save();
  return orderView(o);
}

function refund(o) {
  o.status = 'refunded';
  if (o.refund_request?.status === 'pending') o.refund_request.status = 'done';
  for (const c of o.tickets) memory.tickets[c].status = 'cancelled';
  save();
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
const code32 = (bytes, from, to) => bytes.slice(from, to).map((x) => ALPHABET[x % 32]).join('');
const gateOf = async (t) => code32(await digest(`gate:${t.code}${t.gate_salt ? `:${t.gate_salt}` : ''}`), 0, 12);

async function liveTickets(codes) {
  sweep();
  const w = windowNow();
  const out = {};
  for (const c of codes) {
    const t = memory.tickets[c];
    if (!t || t.status === 'held' || t.status === 'released') continue;
    const entry = { status: t.status, checkedInAt: t.checked_in_at || null, guestName: t.guest_name };
    if (t.status === 'active') {
      // как на сайте: в QR номер для входа, а не код билета
      const gate = await gateOf(t);
      const b = await digest(`${gate}:${w}`);
      entry.qr = `${gate}.${b.slice(0, 12).map((x) => ALPHABET[x % 32]).join('')}`;
      entry.pin = b.slice(12, 18).map((x) => ALPHABET[x % 32]).join('');
    }
    out[c] = entry;
  }
  const validFor = Math.ceil(((w + 1) * QR_WINDOW * 1000 - Date.now()) / 1000);
  return { tickets: out, validFor, window: QR_WINDOW };
}

// QR для PDF: постоянный, как на сайте (в демо проверки на входе нет)
async function printQr(code) {
  sweep();
  const t = memory.tickets[String(code).toUpperCase()];
  if (!t || t.status === 'held' || t.status === 'released') throw new DemoError(404, 'Билет не найден на этом устройстве');
  if (t.status !== 'active') throw new DemoError(409, 'Билет уже не действует');
  const gate = await gateOf(t);
  const sig = code32(await digest(`${gate}:print`), 0, 12);
  return { qr: `${gate}.${sig}` };
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

// ---- админка демо: те же правила, что на сайте ----
export const DEMO_ADMIN_PASSWORD = 'demo';
const BUSY = ['held', 'active', 'used'];
const findTicket = (code) => memory.tickets[String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)];
const byOrderCode = (code) => Object.values(memory.orders).find((o) => o.code === String(code ?? '').trim().toUpperCase());

function adminTicketView(t) {
  const v = orderView(memory.orders[t.order]);
  return { ...v.tickets.find((x) => x.code === t.code), order: v.code, orderStatus: v.status, event: v.event };
}

function eventReport(eventId) {
  sweep();
  const event = getEvent(eventId);
  const orders = Object.values(memory.orders).filter((o) => o.event_id === event.id && (o.status === 'held' || o.status === 'paid'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).map(orderView);
  const stats = { orders: 0, seatsSold: 0, seatsHeld: 0, checkedIn: 0, revenue: 0 };
  for (const o of orders) {
    if (o.status === 'paid') { stats.orders++; stats.revenue += o.total; }
    for (const t of o.tickets) {
      if (t.status === 'held') stats.seatsHeld++;
      if (t.status === 'active' || t.status === 'used') stats.seatsSold++;
      if (t.status === 'used') stats.checkedIn++;
    }
  }
  return { event, stats, orders, availability: availability(event.id) };
}

// время из формы (без пояса) — это время заведения, как на сайте
const venueTime = (v) => new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v)) ? `${v}:00+10:00` : v);

function createEvent(data) {
  const title = clean(data.title, 120);
  const startsAt = venueTime(data.startsAt);
  const doorsAt = data.doorsAt ? venueTime(data.doorsAt) : new Date(startsAt.getTime() - 3600e3);
  const price = Math.round(Number(data.price));
  const capacity = data.capacity === undefined || data.capacity === '' ? DEFAULT_CAPACITY : Math.floor(Number(data.capacity));
  if (title.length < 2) throw new DemoError(400, 'Укажите название');
  if (Number.isNaN(startsAt.getTime())) throw new DemoError(400, 'Укажите дату и время начала');
  if (Number.isNaN(doorsAt.getTime())) throw new DemoError(400, 'Проверьте время открытия дверей');
  if (doorsAt > startsAt) throw new DemoError(400, 'Двери должны открываться до начала события');
  if (!(price > 0 && price <= 1e6)) throw new DemoError(400, 'Укажите цену билета');
  if (!(capacity >= 1 && capacity <= 5000)) throw new DemoError(400, 'Укажите, сколько билетов продавать');
  const id = Math.max(0, ...memory.events.map((e) => e.id)) + 1;
  const event = {
    id, slug: `e${id}`, title, lineup: clean(data.lineup, 200), description: String(data.description ?? '').trim().slice(0, 3000), genre: clean(data.genre, 40),
    capacity, price, deposit: Math.min(price, Math.max(0, Math.round(Number(data.deposit) || 0))), status: 'on_sale',
    starts_at: startsAt.toISOString(), doors_at: doorsAt.toISOString(),
  };
  memory.events.push(event);
  save();
  return event;
}

function updateEvent(id, patch = {}) {
  const e = getEvent(id);
  const { sold, held } = availability(e.id);
  if (patch.capacity !== undefined) {
    const c = Math.floor(Number(patch.capacity));
    if (!(c >= 1 && c <= 5000)) throw new DemoError(400, 'Укажите, сколько билетов продавать');
    if (c < sold + held) throw new DemoError(409, `Уже продано или в брони ${sold + held}, меньше нельзя`);
    e.capacity = c;
  }
  if (patch.price !== undefined) {
    const p = Math.round(Number(patch.price));
    if (!(p > 0 && p <= 1e6)) throw new DemoError(400, 'Укажите цену билета');
    e.price = p;
    e.deposit = Math.min(e.deposit, p);
  }
  save();
  return e;
}

// ---- заявки на бронь стола ----
function requestTable(data = {}) {
  if (data.consent !== true) throw new DemoError(400, 'Отметьте согласие на обработку персональных данных');
  const name = clean(data.name, 80);
  const phone = normPhone(data.phone);
  const guests = Math.floor(Number(data.guests));
  if (name.length < 2) throw new DemoError(400, 'Укажите имя');
  if (phone.length !== 10) throw new DemoError(400, 'Укажите телефон в формате +7 900 000-00-00');
  if (!(guests >= 1 && guests <= 50)) throw new DemoError(400, 'Укажите, сколько будет гостей');
  let eventId = null, day = null;
  if (data.eventId !== undefined && data.eventId !== null && data.eventId !== '') eventId = getEvent(data.eventId).id;
  else {
    day = String(data.day ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DemoError(400, 'Укажите дату');
  }
  memory.requests.push({ id: memory.requests.length + 1, event_id: eventId, day, name, phone, guests, comment: clean(data.comment, 500), status: 'new', note: '', created_at: new Date().toISOString() });
  save();
  return { ok: true };
}

function listRequests() {
  return [...memory.requests].sort((a, b) => (a.status === 'new') - (b.status === 'new') || a.created_at.localeCompare(b.created_at)).reverse().map((r) => {
    const e = r.event_id ? memory.events.find((x) => x.id === r.event_id) : null;
    return { id: r.id, status: r.status, name: r.name, phone: r.phone, guests: r.guests, comment: r.comment, note: r.note, createdAt: r.created_at, day: r.day, event: e ? { id: e.id, title: e.title, startsAt: e.starts_at } : null };
  });
}

function updateRequest(id, patch = {}) {
  const r = memory.requests.find((x) => x.id === Number(id));
  if (!r) throw new DemoError(404, 'Заявка не найдена');
  if (patch.status !== undefined) {
    if (!['new', 'confirmed', 'declined'].includes(patch.status)) throw new DemoError(400, 'Неизвестный статус заявки');
    r.status = patch.status;
  }
  if (patch.note !== undefined) r.note = clean(patch.note, 300);
  save();
  return listRequests().find((x) => x.id === r.id);
}

function setEventStatus(id, status) {
  if (!['on_sale', 'closed', 'cancelled'].includes(status)) throw new DemoError(400, 'Неизвестный статус');
  const e = getEvent(id);
  e.status = status;
  save();
  return e;
}

// Вход по коду билета, QR (живому или из PDF) или короткому коду
async function adminCheckIn(input, eventId) {
  sweep();
  const raw = String(input ?? '').trim().slice(0, 300);
  const w = windowNow();
  let t = null, ok = true;
  const signed = raw.match(/([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{12})(?:[?#].*)?$/);
  const clean6 = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const x of Object.values(memory.tickets)) {
    if (!BUSY.includes(x.status) && x.status !== 'cancelled') continue;
    const gate = await gateOf(x);
    if (signed && signed[1] === gate) {
      const sigs = [code32(await digest(`${gate}:${w}`), 0, 12), code32(await digest(`${gate}:${w - 1}`), 0, 12), code32(await digest(`${gate}:print`), 0, 12)];
      t = x; ok = sigs.includes(signed[2]);
      break;
    }
    if (!signed && clean6.length === 6) {
      for (const win of [w, w - 1]) if (code32(await digest(`${gate}:${win}`), 12, 18) === clean6) t = x;
      if (t) break;
    }
  }
  if (!signed && !t) t = findTicket(raw.match(/[?&]t=([A-Za-z0-9-]+)/)?.[1] || raw) || null;
  if (!t || t.status === 'held' || t.status === 'released') throw new DemoError(404, 'Такого билета нет');
  const view = () => adminTicketView(t);
  if (!ok) return { result: 'expired_qr', ticket: view() };
  if (eventId && t.event_id !== Number(eventId)) return { result: 'wrong_event', ticket: view() };
  if (getEvent(t.event_id).status === 'cancelled') return { result: 'event_cancelled', ticket: view() };
  if (t.status === 'used') return { result: 'already_used', ticket: view() };
  if (t.status !== 'active') return { result: 'invalid', ticket: view() };
  t.status = 'used';
  t.checked_in_at = new Date().toISOString();
  save();
  return { result: 'ok', ticket: view() };
}

// как на сайте: codes — какие билеты вернуть; без списка — весь заказ
function adminRefund(code, codes) {
  const o = byOrderCode(code);
  if (!o) throw new DemoError(404, 'Заказ не найден');
  if (o.status !== 'paid') throw new DemoError(409, 'Вернуть можно только оплаченный заказ');
  const active = o.tickets.filter((c) => memory.tickets[c].status === 'active');
  if (!codes && o.tickets.some((c) => memory.tickets[c].status === 'used')) throw new DemoError(409, 'Часть гостей уже прошла, весь заказ вернуть нельзя. Отметьте, какие билеты вернуть.');
  const pick = codes ? codes.map((c) => String(c).toUpperCase()) : active;
  if (!pick.length || pick.some((c) => !active.includes(c))) throw new DemoError(400, 'Вернуть можно только действующие билеты этого заказа');
  if (pick.length === active.length && !o.tickets.some((c) => memory.tickets[c].status === 'used')) {
    refund(o);
    return orderView(o);
  }
  for (const c of pick) memory.tickets[c].status = 'cancelled';
  o.total = o.tickets.map((c) => memory.tickets[c]).filter((x) => x.status === 'active' || x.status === 'used').reduce((sum, x) => sum + x.price, 0);
  if (o.refund_request?.status === 'pending') o.refund_request.status = 'done';
  save();
  return orderView(o);
}

function adminEditTicket(code, patch = {}) {
  const t = findTicket(code);
  if (!t || t.status === 'held' || t.status === 'released') throw new DemoError(404, 'Билет не найден');
  const o = memory.orders[t.order];
  if (o.status !== 'paid') throw new DemoError(409, 'Править можно билеты только оплаченного заказа');
  const event = getEvent(t.event_id);
  let status = t.status;
  if (patch.status !== undefined && patch.status !== t.status) {
    if (!['active', 'used', 'cancelled'].includes(patch.status)) throw new DemoError(400, 'Неизвестный статус билета');
    status = patch.status;
  }
  if (status !== 'cancelled' && t.status === 'cancelled' && availability(event.id).free < 1) {
    throw new DemoError(409, 'Все билеты на событие уже проданы');
  }
  let price = t.price;
  if (patch.price !== undefined) {
    price = Math.round(Number(patch.price));
    if (!(price >= 0 && price <= 1e6)) throw new DemoError(400, 'Проверьте цену');
  }
  Object.assign(t, {
    price, status,
    guest_name: patch.guestName !== undefined ? clean(patch.guestName, 80) || o.name : t.guest_name,
    checked_in_at: status === 'used' ? t.checked_in_at || new Date().toISOString() : null,
  });
  if (patch.newQr) t.gate_salt = rand(8);
  o.total = o.tickets.map((c) => memory.tickets[c]).filter((x) => x.status === 'active' || x.status === 'used').reduce((sum, x) => sum + x.price, 0);
  save();
  return adminTicketView(t);
}

function adminEditOrder(code, patch = {}) {
  const o = byOrderCode(code);
  if (!o) throw new DemoError(404, 'Заказ не найден');
  const name = patch.name !== undefined ? clean(patch.name, 80) : o.name;
  const phone = patch.phone !== undefined ? normPhone(patch.phone) : o.phone;
  const email = patch.email !== undefined ? clean(patch.email, 120) || null : o.email;
  if (!name || name.length < 2) throw new DemoError(400, 'Укажите имя');
  if (phone?.length !== 10) throw new DemoError(400, 'Укажите телефон в формате +7 900 000-00-00');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DemoError(400, 'Проверьте адрес почты');
  Object.assign(o, { name, phone, email });
  save();
  return orderView(o);
}

async function handleAdmin(p, method, body) {
  let m;
  if (p === '/api/admin/events' && method === 'POST') return createEvent(body);
  if (p === '/api/admin/events') return memory.events;
  if ((m = p.match(/^\/api\/admin\/events\/(\d+)\/status$/))) return setEventStatus(m[1], body.status);
  if ((m = p.match(/^\/api\/admin\/events\/(\d+)$/)) && method === 'POST') return updateEvent(m[1], body);
  if (p === '/api/admin/table-requests') return listRequests();
  if (p === '/api/admin/refund-requests') return Object.values(memory.orders).filter((o) => o.refund_request?.status === 'pending').map(orderView);
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)\/refund-decline$/))) {
    const o = byOrderCode(decodeURIComponent(m[1]));
    if (!o || o.refund_request?.status !== 'pending') throw new DemoError(404, 'Заявки на возврат по этому заказу нет');
    Object.assign(o.refund_request, { status: 'declined', note: clean(body.note, 300) });
    save();
    return orderView(o);
  }
  if ((m = p.match(/^\/api\/admin\/table-requests\/(\d+)$/))) return updateRequest(m[1], body);
  if ((m = p.match(/^\/api\/admin\/events\/(\d+)\/report$/))) return eventReport(m[1]);
  if (p === '/api/admin/checkin') return adminCheckIn(body.code, body.eventId);
  if (p === '/api/admin/staff') return [];
  if (p.startsWith('/api/admin/staff')) throw new DemoError(400, 'В демо-версии контролёров нет: у неё нет сервера. На настоящем сайте приглашение работает.');
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/))) return adminRefund(decodeURIComponent(m[1]), body.tickets);
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)$/))) return adminEditOrder(decodeURIComponent(m[1]), body);
  if ((m = p.match(/^\/api\/admin\/tickets\/([^/]+)$/))) return adminEditTicket(decodeURIComponent(m[1]), body);
  throw new DemoError(404, 'Не найдено');
}

// ---- та же форма вызова, что у настоящего API сайта ----
export async function handle(path, { method = 'GET', body = {}, admin } = {}) {
  const url = new URL(path, 'https://demo.local');
  const p = url.pathname;
  let m;
  if (p.startsWith('/api/admin/')) {
    if (admin !== DEMO_ADMIN_PASSWORD) throw new DemoError(401, 'Неверный пароль. В демо пароль: demo');
    return handleAdmin(p, method, body);
  }
  if (p === '/api/config') return { maxTickets: MAX_TICKETS, holdMinutes: HOLD_MINUTES, cancelBeforeHours: CANCEL_BEFORE_HOURS, paymentsEnabled: true };
  if (p === '/api/events') {
    const cutoff = Date.now() - 6 * 3600e3;
    return memory.events.filter((e) => e.status !== 'cancelled' && new Date(e.starts_at).getTime() >= cutoff)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(publicEvent);
  }
  if ((m = p.match(/^\/api\/events\/(\d+)$/))) return publicEvent(getEvent(m[1]));
  if ((m = p.match(/^\/api\/events\/(\d+)\/availability$/))) return availability(m[1]);
  if ((m = p.match(/^\/api\/events\/(\d+)\/hold$/)) && method === 'POST') return hold(m[1], body.qty);
  if (p === '/api/table-requests' && method === 'POST') return requestTable(body);
  if (p === '/api/orders/lookup') return lookup(url.searchParams.get('code'), url.searchParams.get('phone'));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/pay$/))) return pay(decodeURIComponent(m[1]), body);
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/release$/))) return release(decodeURIComponent(m[1]));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/refund-request$/))) return requestRefund(decodeURIComponent(m[1]), body);
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/guest$/))) return rename(decodeURIComponent(m[1]), body.ticket, body.name);
  if ((m = p.match(/^\/api\/orders\/([^/]+)$/))) return orderView(findOrder(decodeURIComponent(m[1])));
  if ((m = p.match(/^\/api\/tickets\/([^/]+)\/print$/))) return printQr(decodeURIComponent(m[1]));
  if ((m = p.match(/^\/api\/tickets\/([^/]+)$/))) return getTicket(decodeURIComponent(m[1]));
  throw new DemoError(404, 'Не найдено');
}
