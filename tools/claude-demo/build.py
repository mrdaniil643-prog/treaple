"""Собирает демо-версию сайта для публикации на claude.ai из текущих файлов public/."""
import os, re, shutil

SITE = os.path.abspath(os.path.dirname(os.path.abspath(__file__)) + '/../..')
SRC = os.path.dirname(os.path.abspath(__file__)) + '/src'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/build'

shutil.rmtree(OUT, ignore_errors=True)
for d in ['css', 'js', 'img', 'vendor']:
    os.makedirs(f'{OUT}/{d}')
shutil.copy(f'{SITE}/public/css/style.css', f'{OUT}/css/style.css')
for f in ['bar.jpg', 'kitchen.jpg']:
    shutil.copy(f'{SITE}/public/img/{f}', f'{OUT}/img/{f}')
shutil.copytree(f'{SITE}/public/img/events', f'{OUT}/img/events')
shutil.copy(f'{SITE}/public/vendor/qrcode.js', f'{OUT}/vendor/qrcode.js')
for f in ['backend.js', 'app.js', 'doc.js']:
    shutil.copy(f'{SRC}/js/{f}', f'{OUT}/js/{f}')
# шрифты с сайта (без Google) и документы
shutil.copytree(f'{SITE}/public/fonts', f'{OUT}/fonts')
open(f'{OUT}/css/fonts.css', 'w').write(open(f'{SITE}/public/css/fonts.css').read().replace('url(/fonts/', 'url(../fonts/'))
os.makedirs(f'{OUT}/docs')
for f in ['offer', 'refund', 'privacy', 'consent', 'contacts']:
    shutil.copy(f'{SITE}/public/{f}.html', f'{OUT}/docs/{f}.html')
# «Цены и оплата»: на сайте таблицу цен вписывает сервер, в демо — событие по умолчанию
prices = open(f'{SITE}/public/prices.html').read()
assert '<div id="price-list"></div>' in prices
open(f'{OUT}/docs/prices.html', 'w').write(prices.replace('<div id="price-list"></div>', '<div class="table-wrap"><table class="list price-table"><thead><tr><th>Мероприятие</th><th>Дата и время</th><th>Входной билет</th></tr></thead><tbody><tr><td>Отчётный концерт × Открытый микрофон</td><td>25 октября, 16:00</td><td><b>1\u00a0000\u00a0₽</b></td></tr></tbody></table></div>'))


def rep(s, a, b, name, count=1):
    assert a in s, (name, a[:80])
    return s.replace(a, b, count)


def read(name):
    return open(f'{SITE}/public/js/{name}').read()


def write(name, s):
    open(f'{OUT}/js/{name}', 'w').write(s)


def wrap(s):
    """Код страницы выполняется при каждом переходе: оборачиваем его в mount(route)."""
    lines = s.split('\n')
    i = 0
    while i < len(lines) and (lines[i].startswith('import ') or lines[i].strip() == ''):
        i += 1
    head, body = '\n'.join(lines[:i]), '\n'.join(lines[i:])
    return f"{head}\nexport default async function mount(route) {{\n{body}\n}}\n"


# ---------- common.js ----------
s = read('common.js')
s = rep(s, "export const TZ = await fetch('/api/settings').then((r) => r.json()).then((s) => s.timeZone).catch(() => 'Asia/Vladivostok');",
        "export const TZ = 'Asia/Vladivostok';", 'common')
s = rep(s, """export async function api(path, { method = 'GET', body, admin } = {}) {""",
        """import { handle } from './backend.js';

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

async function unusedApi(path, { method = 'GET', body, admin } = {}) {""", 'common')
s = rep(s, "export const ticketUrl = (code) => `${location.origin}/ticket?t=${code}`;", "export const ticketUrl = (code) => `#ticket-${code}`;", 'common')
s = rep(s, "  document.body.prepend(header);", "  const banner = document.querySelector('.demo-banner');\n  if (banner) banner.after(header);\n  else document.body.prepend(header);", 'common')
write('common.js', s)

# ---------- страницы без изменений логики ----------
for f in ['table-request.js', 'ticket-pdf.js', 'charts.js', 'seller.js', 'menu-data.js']:
    write(f, read(f))

s = read('ticket-card.js')
s = rep(s, "          <button data-share=\"${t.code}\">Отправить гостю</button>\n", "", 'card')
write('ticket-card.js', s)

# ---------- live-qr.js: вместо потока с сервера — локальное обновление ----------
s = read('live-qr.js')
s = rep(s, "import { fmt, qrSvg, toast, STATUS_TEXT, TZ, $$ } from './common.js';",
        "import { fmt, qrSvg, toast, STATUS_TEXT, TZ, $$ } from './common.js';\nimport { watchTickets } from './backend.js';", 'live')
start = s.index('  // Браузер сам переподключается')
end = s.index('  const onMessage = (m) => {')
s = s[:start] + """  const connect = () => {
    if (stopped) return;
    const unsub = watchTickets([...byCode.keys()], (data) => onMessage({ data: JSON.stringify(data) }));
    es = { close: unsub };
  };

""" + s[end:]
s = rep(s, "    backoff = 2000;\n", "", 'live')
s = rep(s, "card.querySelector('.qr').innerHTML = qrSvg(`${location.origin}/c/${t.qr}`);", "card.querySelector('.qr').innerHTML = qrSvg(`MT:${t.qr}`);", 'live')
write('live-qr.js', s)

# ---------- home.js ----------
s = read('home.js')
s = s.replace("url('/img/", "url('../img/")
write('home.js', wrap(s))

# ---------- menu.js ----------
s = read('menu.js')
s = rep(s, "import { esc, money, renderHeader, renderFooter, $, $$ } from './common.js';", "import { esc, money, renderHeader, renderFooter, onLeave, $, $$ } from './common.js';", 'menu')
s = rep(s, "draw();\nrenderFooter();", "draw();\nrenderFooter();\nonLeave(() => observer?.disconnect());", 'menu')
# ссылки разделов меню (#s-…) — прокрутка внутри страницы
s = rep(s, "$('#q').addEventListener('input',", "$('#menu-nav').addEventListener('click', (e) => {\n  const a = e.target.closest('a[href^=\"#s-\"]');\n  if (!a) return;\n  e.preventDefault();\n  e.stopPropagation();\n  document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });\n});\n$('#q').addEventListener('input',", 'menu')
write('menu.js', wrap(s))

# ---------- event.js ----------
s = read('event.js')
s = rep(s, "orderLink, VENUE, $, $$ } from './common.js';", "orderLink, VENUE, onLeave, navigate, $, $$ } from './common.js';\nimport { watchAvailability } from './backend.js';", 'event')
s = rep(s, "const eventId = Number(new URLSearchParams(location.search).get('id'));", "const eventId = Number(route.id);", 'event')
s = rep(s, """function connectStream() {
  const es = new EventSource(`/api/events/${eventId}/stream`);
  es.onmessage = (m) => {
    state.availability = JSON.parse(m.data);
    if (!state.order) renderBuy();
  };
}""", """function connectStream() {
  onLeave(watchAvailability(eventId, (av) => {
    state.availability = structuredClone(av);
    if (!state.order) renderBuy();
  }));
}""", 'event')
s = rep(s, "      location.href = orderLink(order.secret, '&new=1');", "      navigate(`order-${order.secret}-new`);", 'event')
s = rep(s, "let timerId;", "let timerId;\nonLeave(() => clearInterval(timerId));", 'event')
s = rep(s, "  <dialog id=\"checkout\"></dialog>`;", "  `;\n  document.body.insertAdjacentHTML('beforeend', '<dialog id=\"checkout\"></dialog>');", 'event')
s = s.replace("<p class=\"demo-note\">Тестовый режим: деньги не списываются.</p>", "<p class=\"demo-note\">Демо-версия: деньги не списываются, билеты сохранятся только в этом браузере.</p>")
write('event.js', wrap(s))

# ---------- tickets.js ----------
s = read('tickets.js')
s = rep(s, "ticketUrl, orderLink, STATUS_TEXT, $ } from './common.js';", "ticketUrl, orderLink, onLeave, STATUS_TEXT, $ } from './common.js';", 'tickets')
s = rep(s, "const params = new URLSearchParams(location.hash.slice(1) || location.search);",
        "const params = new URLSearchParams(route.order ? `order=${route.order}${route.fresh ? '&new=1' : ''}` : '');\nonLeave(() => stopLive());", 'tickets')
s = rep(s, "Оплата прошла. Друзьям отправьте их билеты кнопкой «Отправить гостю». Запишите номер заказа <b>${esc(o.code)}</b>: по нему и телефону билеты найдутся на любом устройстве.",
        "Оплата прошла, это демо: деньги не списаны. Билеты сохранены в этом браузере, номер заказа <b>${esc(o.code)}</b>.", 'tickets')
s = rep(s, "      ${active ? '<button class=\"btn ghost small\" id=\"share-all\">Скопировать ссылки на все билеты</button>' : ''}\n", "", 'tickets')
# prompt() и confirm() в просмотрщике не работают: имя меняем прямо на билете, возврат — вторым нажатием
start = s.index("    if (rename) {")
end = s.index("    if (ev.target.id === 'share-all') {")
s = s[:start] + """    if (rename) {
      const card = ev.target.closest('.ticket');
      const span = card.querySelector('.t-guest span');
      if (card.querySelector('.rename-form')) return;
      span.innerHTML = `<form class="rename-form" style="display:flex;gap:6px"><input class="input" style="min-height:34px;padding:0 8px" name="n" maxlength="80" aria-label="Имя гостя" value="${esc(span.textContent)}"><button class="btn small" type="submit">Сохранить</button></form>`;
      const f = span.querySelector('form');
      f.n.focus();
      f.addEventListener('submit', async (e2) => {
        e2.preventDefault();
        try {
          renderOrder(await api(`/api/orders/${o.secret}/guest`, { method: 'POST', body: { ticket: rename, name: f.n.value } }));
          toast('Имя на билете изменено');
        } catch (err) { toast(err.message, { error: true }); }
      });
    }
""" + s[end:]
start = s.index("    if (ev.target.id === 'share-all') {")
end = s.index("    if (ev.target.id === 'refund-ask') {")
s = s[:start] + s[end:]
s = s.replace("      history.replaceState(null, '', orderLink(o.secret));\n", "")
s = s.replace("      history.replaceState(null, '', orderLink(secret));\n", "")
s = rep(s, "window.addEventListener('hashchange', () => location.reload());\n", "", 'tickets')
s = rep(s, "Здесь билеты, купленные с этого телефона. Если покупали с другого устройства, введите номер заказа и телефон.",
        "Здесь билеты, купленные в этом браузере. В демо-версии они хранятся только на этом устройстве.", 'tickets')
write('tickets.js', wrap(s))

# ---------- ticket.js ----------
s = read('ticket.js')
s = rep(s, "import { api, esc, fmt, renderHeader, renderFooter, toast, $ } from './common.js';", "import { api, esc, fmt, renderHeader, renderFooter, toast, onLeave, $ } from './common.js';", 'ticket')
s = rep(s, "const code = new URLSearchParams(location.search).get('t') || '';", "const code = route.code || '';", 'ticket')
s = rep(s, "    startLiveTickets(app);", "    onLeave(startLiveTickets(app));", 'ticket')
write('ticket.js', wrap(s))

# ---------- admin.js ----------
s = read('admin.js')
s = rep(s, "import { api, esc, fmt, money, ticketsWord, renderHeader, toast, copyText, prettyCode, qrSvg, STATUS_TEXT, $, $$ } from './common.js';",
        "import { api, esc, fmt, money, ticketsWord, renderHeader, toast, copyText, prettyCode, qrSvg, STATUS_TEXT, onLeave, ask, $, $$ } from './common.js';\nimport { watchAvailability } from './backend.js';", 'admin')
# sessionStorage в просмотрщике может быть недоступен
s = rep(s, "let token = sessionStorage.getItem('mt.admin') || '';",
        "const store = { getItem: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* нет доступа */ } }, removeItem: (k) => { try { sessionStorage.removeItem(k); } catch { /* нет доступа */ } } };\nlet token = store.getItem('mt.admin') || '';", 'admin')
s = s.replace("sessionStorage.setItem('mt.admin'", "store.setItem('mt.admin'").replace("sessionStorage.removeItem('mt.admin')", "store.removeItem('mt.admin')")
assert s.count('sessionStorage') == 3, s.count('sessionStorage')
# confirm() в просмотрщике не работает: все вызовы внутри async-обработчиков
assert s.count('!confirm(') == 7, s.count('!confirm(')
# prompt() тоже не работает: в демо отказ в возврате без причины
s = rep(s, "const note = prompt('Причина отказа, её увидит гость (можно оставить пустой)', '');\n    if (note === null) return;", "const note = '';", 'admin')
s = s.replace('!confirm(', '!await ask(')
s = rep(s, '      <button class="btn" type="submit">Войти</button>',
        '      <p class="muted">В демо-версии пароль: <b>demo</b></p>\n      <button class="btn" type="submit">Войти</button>', 'admin')
s = rep(s, 'href="/event?id=${e.id}" target="_blank">Страница события</a>', 'href="/event?id=${e.id}">Страница события</a>', 'admin')
s = rep(s, "  es?.close();\n  es = new EventSource(`/api/events/${currentId}/stream`);\n  let t;\n  es.onmessage = () => {",
        "  es?.();\n  let t;\n  es = watchAvailability(currentId, () => {", 'admin')
# заявки: обновление раз в минуту только пока админка открыта
s = rep(s, "setInterval(() => { if (token && $('#requests')) { loadRequests(); loadRefunds(); } }, 60e3);", "const reqTimer = setInterval(() => { if (token && $('#requests')) { loadRequests(); loadRefunds(); } }, 60e3);\nonLeave(() => clearInterval(reqTimer));", 'admin')
s = rep(s, "    }, 400);\n  };\n}", "    }, 400);\n  });\n  onLeave(() => es?.());\n}", 'admin')
s = rep(s, "let stream = null;", "let stream = null;\nonLeave(() => { stream?.getTracks().forEach((x) => x.stop()); stream = null; });", 'admin')
write('admin.js', wrap(s))

# ---------- страница ----------
open(f'{OUT}/index.html', 'w').write("""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Бар МТ</title>
<link rel="stylesheet" href="css/fonts.css">
<link rel="stylesheet" href="css/style.css">
<style>
  :root { color-scheme: dark; }
  html { background: #212b3a; }
  .site-header { top: env(safe-area-inset-top, 0px); }
  .demo-banner { background: #f07a2b; color: #1d1409; font: 700 14px/1.4 'Manrope', system-ui, sans-serif; text-align: center; padding: 8px 16px; }
  .demo-banner a { color: inherit; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; display: inline-block; padding: 10px 4px; margin: -10px 0; }
  dialog.ask { width: min(420px, 100% - 24px); margin: auto; border-radius: 18px; }
  dialog.doc-dlg { width: min(760px, 100% - 16px); max-height: 90svh; margin: auto; border-radius: 18px; }
  dialog.doc-dlg .dlg-head { position: sticky; top: 0; background: var(--panel); z-index: 1; }
  dialog.ask p { font-size: 16px; line-height: 1.5; }
  dialog.ask .row { gap: 10px; }
</style>
<div class="demo-banner">Демо-версия сайта. Деньги не списываются, брони и билеты сохраняются только в вашем браузере. <a href="/admin">Админка</a></div>
<main id="app"></main>
<script src="vendor/qrcode.js"></script>
<script type="module" src="js/app.js"></script>
""")
print('built', sorted(os.listdir(OUT + '/js')))
