export const TZ = 'Europe/Moscow';

export const LOGO = `<svg class="mt" viewBox="0 0 200 80" aria-hidden="true">
  <polygon points="6,0 64,0 24,80 0,80 34,16 6,16"/>
  <polygon points="40,80 78,0 98,0 98,80 80,80 80,38 60,80"/>
  <polygon points="106,0 200,0 200,16 161,16 161,80 145,80 145,16 106,16"/>
</svg>`;

export async function api(path, { method = 'GET', body, admin } = {}) {
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
export const money = (n) => `${rub.format(n)} ₽`;
export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const seatsWord = (n) => `${n} ${plural(n, 'место', 'места', 'мест')}`;

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
const KEY = 'mt.orders';
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
    <a class="logo" href="/" aria-label="МТ — на главную">${LOGO}<span>Музыкальный бар и караоке</span></a>
    <nav class="nav" aria-label="Разделы">${links.map(([href, label, id]) => `<a href="${href}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  </div>`;
  document.body.prepend(header);
}

export function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="wrap">
    <div><b>МТ</b><br>Музыкальный бар и караоке</div>
    <div>Каждый день с 18:00 до последнего гостя<br>Пятница и суббота — до 06:00</div>
    <div>Бронь больших компаний и банкеты<br><a href="tel:+70000000000">+7 (000) 000-00-00</a></div>
  </div>`;
  document.body.append(footer);
}

export function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export const ticketUrl = (code) => `${location.origin}/ticket?t=${code}`;
export const prettyCode = (code) => code.replace(/(.{5})(?=.)/g, '$1-');

export const STATUS_TEXT = {
  held: 'Ждёт оплаты', paid: 'Оплачен', expired: 'Бронь истекла', cancelled: 'Бронь снята', refunded: 'Возврат оформлен',
  active: 'Действует', used: 'Гость прошёл', released: 'Место освобождено',
};
