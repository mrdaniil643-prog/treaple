// Одностраничная демо-версия: разделы сайта переключаются внутри страницы.
import { runLeave, setNavigate } from './common.js';

const PAGES = {
  home: () => import('./home.js'),
  menu: () => import('./menu.js'),
  event: () => import('./event.js'),
  tickets: () => import('./tickets.js'),
  ticket: () => import('./ticket.js'),
  admin: () => import('./admin.js'),
};

// Адреса сайта (/event?id=1, /tickets#order=…) → внутренние метки (event-1, order-…)
export function toToken(href) {
  const u = new URL(href, 'https://demo.local');
  const hash = u.hash.slice(1);
  if (u.pathname === '/event') return `event-${u.searchParams.get('id')}`;
  if (u.pathname === '/admin') return 'admin';
  if (u.pathname === '/menu') return hash === 'bar' ? 'menu-bar' : 'menu';
  if (u.pathname === '/ticket') return `ticket-${u.searchParams.get('t')}`;
  if (u.pathname === '/tickets') {
    const p = new URLSearchParams(hash);
    return p.get('order') ? `order-${p.get('order')}${p.has('new') ? '-new' : ''}` : 'tickets';
  }
  return hash === 'afisha' ? 'afisha' : 'home';
}

function parse(token) {
  let m;
  if ((m = token.match(/^event-(\d+)$/))) return { page: 'event', id: m[1] };
  if (token === 'menu' || token === 'menu-bar') return { page: 'menu', tab: token === 'menu-bar' ? 'bar' : 'kitchen' };
  if ((m = token.match(/^ticket-([A-Z0-9]+)$/))) return { page: 'ticket', code: m[1] };
  if ((m = token.match(/^order-([A-Z0-9]+)(-new)?$/))) return { page: 'tickets', order: m[1], fresh: Boolean(m[2]) };
  if (token === 'tickets') return { page: 'tickets' };
  if (token === 'admin') return { page: 'admin' };
  return { page: 'home', anchor: token === 'afisha' ? 'afisha' : '' };
}

let current = '';
async function show(token) {
  current = token;
  const route = parse(token);
  runLeave();
  document.querySelectorAll('.site-header, .site-footer, dialog').forEach((el) => el.remove());
  const app = document.getElementById('app');
  app.innerHTML = '';
  window.scrollTo(0, 0);
  const mod = await PAGES[route.page]();
  if (current !== token) return;
  await mod.default(route);
  if (route.anchor) document.getElementById(route.anchor)?.scrollIntoView();
}

function navigate(token, { replace = false } = {}) {
  try {
    if (replace) history.replaceState(null, '', `#${token}`);
    else if (location.hash.slice(1) !== token) history.pushState(null, '', `#${token}`);
  } catch { /* некоторые просмотрщики не дают менять адрес — работаем без него */ }
  show(token);
}
setNavigate(navigate);

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') && !href.startsWith('#')) return; // внешние ссылки открываются как обычно
  // ссылка на элемент этой же страницы (переход к содержимому, разделы меню) — не маршрут
  const target = href.startsWith('#') && document.getElementById(href.slice(1));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
    if (target.tabIndex < 0) target.focus({ preventScroll: true });
    return;
  }
  e.preventDefault();
  navigate(href.startsWith('#') ? href.slice(1) : toToken(href));
});
window.addEventListener('popstate', () => show(location.hash.slice(1) || 'home'));

show(location.hash.slice(1) || 'home');
