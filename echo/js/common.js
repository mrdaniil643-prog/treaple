import { SELLER, LEGAL_LINKS } from './seller.js';
import { BRAND } from './brand.js';
// Часовой пояс заведения задаётся на сервере (VENUE_TZ); все даты показываем в нём.
export const TZ = 'Asia/Vladivostok';

// Логотип из brand.js (SVG-файл, цвет — currentColor), а без него — название текстом
export const LOGO = BRAND.logo
  ? `<svg class="logo-mark" viewBox="${BRAND.logoViewBox}" aria-hidden="true"><use href="${BRAND.logo}#logo"/></svg>`
  : `<b class="wordmark">${BRAND.name.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</b>`;

import { handle } from './backend.js';

// Уход со страницы: подписки и таймеры текущего раздела снимаются.
const leaving = [];
export const onLeave = (fn) => { if (typeof fn === 'function') leaving.push(fn); };
export const runLeave = () => { while (leaving.length) { try { leaving.pop()(); } catch { /* уже снято */ } } };
let nav = () => {};
export const setNavigate = (fn) => { nav = fn; };
export const navigate = (token) => nav(token);

// confirm() в просмотрщике claude.ai не работает: спрашиваем своим окном
export function ask(message) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'ask';
    dlg.innerHTML = `<div class="dlg-body"><p></p><div class="row"><button class="btn small" data-yes>Да</button><button class="btn ghost small" data-no>Отмена</button></div></div>`;
    dlg.querySelector('p').textContent = message;
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[data-yes]').addEventListener('click', () => done(true));
    dlg.querySelector('[data-no]').addEventListener('click', () => done(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function api(path, { method = 'GET', body, admin } = {}) {
  try {
    return structuredClone(await handle(path, { method, body: body || {}, admin }));
  } catch (e) {
    const err = new Error(e.message || 'Что-то пошло не так. Обновите страницу.');
    err.status = e.status || 500;
    err.data = e.data || {};
    throw err;
  }
}

async function unusedApi(path, { method = 'GET', body, admin } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin) headers['X-Admin-Token'] = admin;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const rub = new Intl.NumberFormat('ru-RU');
export const money = (n) => `${rub.format(n)}\u00a0₽`;
export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const ticketsWord = (n) => `${n} ${plural(n, 'билет', 'билета', 'билетов')}`;

const f = (opts) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, ...opts });
export const fmt = {
  day: (iso) => f({ day: 'numeric' }).format(new Date(iso)),
  month: (iso) => f({ month: 'short' }).format(new Date(iso)).replace('.', ''),
  weekday: (iso) => f({ weekday: 'long' }).format(new Date(iso)),
  weekdayShort: (iso) => f({ weekday: 'short' }).format(new Date(iso)),
  time: (iso) => f({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
  date: (iso) => f({ day: 'numeric', month: 'long' }).format(new Date(iso)),
  full: (iso) => f({ day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Заказы гостя хранятся в браузере, чтобы «Мои билеты» открывались без поиска.
const KEY = 'venue.orders';
export const savedOrders = {
  list() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  },
  add(order) {
    try {
      const list = savedOrders.list().filter((o) => o.secret !== order.secret);
      list.unshift({ secret: order.secret, code: order.code, title: order.event.title, startsAt: order.event.startsAt, count: order.tickets.length });
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
    } catch { /* приватный режим — просто не запоминаем */ }
  },
  remove(secret) {
    try { localStorage.setItem(KEY, JSON.stringify(savedOrders.list().filter((o) => o.secret !== secret))); } catch {}
  },
};

// Копирует текст. Возвращает false, если браузер не дал доступа к буферу обмена.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

export function toast(message, { error = false, ms = 4000 } = {}) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function renderHeader(current) {
  const upcoming = savedOrders.list().filter((o) => new Date(o.startsAt) > Date.now() - 6 * 3600e3).length;
  const links = [
    ['/#afisha', 'Афиша', 'afisha'],
    ['/menu', 'Меню', 'menu'],
    ['/tickets', `Мои билеты${upcoming ? `<span class="tickets-count">${upcoming}</span>` : ''}`, 'tickets'],
  ];
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<div class="wrap">
    <a class="logo" href="/" aria-label="${esc(BRAND.name)} — на главную">${LOGO}<span>${esc(BRAND.tagline)}</span></a>
    <nav class="nav" aria-label="Разделы">${links.map(([href, label, id]) => `<a href="${href}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  </div>`;
  const banner = document.querySelector('.demo-banner');
  if (banner) banner.after(header);
  else document.body.prepend(header);
  // для клавиатуры и экранных чтецов: сразу к содержимому, минуя меню
  document.getElementById('app')?.setAttribute('tabindex', '-1');
  if (!document.querySelector('.skip-link')) {
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#app';
    skip.textContent = 'Перейти к содержимому';
    // адрес не меняем: во фрагменте живут #order=… и #invite=…
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      const app = document.getElementById('app');
      app?.focus({ preventScroll: true });
      app?.scrollIntoView();
    });
    document.body.prepend(skip);
  }
}

// Данные заведения для подвала и страниц. Пустые поля на сайте не показываются.
export const VENUE = {
  address: BRAND.address,
  hours: BRAND.hours,
  phone: BRAND.phone,
  email: BRAND.email,
  entry: BRAND.entry,
  tableDeposit: BRAND.tableDeposit, // депозит на стол: тратится на еду и напитки, оплачивается в заведении (не на сайте)
};

export function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  const tel = VENUE.phone.replace(/[^\d+]/g, '');
  footer.innerHTML = `<div class="wrap">
    <div><b>${esc(BRAND.name)}</b><br>${esc(BRAND.tagline)}</div>
    ${VENUE.address || VENUE.hours ? `<div>${esc(VENUE.address)}${VENUE.address && VENUE.hours ? '<br>' : ''}${esc(VENUE.hours)}</div>` : ''}
    ${VENUE.phone ? `<div>Инфо и резерв<br><a href="tel:${esc(tel)}">${esc(VENUE.phone)}</a>${VENUE.email ? `<br><a href="mailto:${esc(VENUE.email)}">${esc(VENUE.email)}</a>` : ''}</div>` : ''}
    ${VENUE.entry ? `<div>${esc(VENUE.entry)}</div>` : ''}
  </div>
  <div class="wrap footer-legal">
    <nav aria-label="Документы">${LEGAL_LINKS.map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}</nav>
    <p>${esc(SELLER.short)}, ИНН ${SELLER.inn}, ${SELLER.ogrnLabel} ${SELLER.ogrnip}. Оплата картой и через СБП, платежи принимает ЮKassa.</p>
  </div>`;
  document.body.append(footer);
}

export function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export const ticketUrl = (code) => `#ticket-${code}`;
export const prettyCode = (code) => code.replace(/(.{4})(?=.)/g, '$1-');

// Секрет заказа держим во фрагменте (#order=…): он не уходит на сервер в логах и заголовках.
export const orderLink = (secret, extra = '') => `/tickets#order=${encodeURIComponent(secret)}${extra}`;

export const STATUS_TEXT = {
  held: 'Ждёт оплаты', paid: 'Оплачен', expired: 'Бронь истекла', cancelled: 'Бронь снята', refunded: 'Возврат оформлен',
  active: 'Действует', used: 'Гость прошёл', released: 'Место освобождено',
};
