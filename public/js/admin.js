import { api, esc, fmt, money, ticketsWord, renderHeader, toast, copyText, prettyCode, qrSvg, STATUS_TEXT, $, $$ } from './common.js';
import { occupancyChart, salesChart, entryMeter } from './charts.js';

renderHeader('');
const app = $('#app');
let token = sessionStorage.getItem('mt.admin') || '';
let events = [], currentId = null, es = null;

const adm = (path, opts = {}) => api(path, { ...opts, admin: token });

function login(error = '') {
  app.innerHTML = `<section class="wrap page-head" style="max-width:420px">
    <h1 style="font-size:34px">Администратор</h1>
    <form id="login" class="dlg-body" style="padding:24px 0">
      <label class="field"><span>Пароль</span><input class="input" type="password" name="p" autocomplete="current-password" required></label>
      <p class="form-error">${esc(error)}</p>
      <button class="btn" type="submit">Войти</button>
    </form></section>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    token = e.currentTarget.p.value;
    try {
      await adm('/api/admin/events');
      sessionStorage.setItem('mt.admin', token);
      start();
    } catch (err) { login(err.message); }
  });
}

async function start() {
  try {
    events = await adm('/api/admin/events');
  } catch (err) {
    sessionStorage.removeItem('mt.admin');
    return login(err.status === 401 ? '' : err.message);
  }
  const upcoming = events.filter((e) => new Date(e.starts_at) > Date.now() - 12 * 3600e3);
  currentId ||= (upcoming[0] || events.at(-1))?.id;
  app.innerHTML = `<section class="wrap page-head">
    <div class="row" style="justify-content:space-between;align-items:center">
      <h1 style="font-size:34px">Администратор</h1>
      <label class="field" style="min-width:280px"><span>Событие</span>
        <select class="input" id="ev">${events.map((e) => `<option value="${e.id}" ${e.id === currentId ? 'selected' : ''}>${fmt.date(e.starts_at)}, ${esc(e.title)}${e.status !== 'on_sale' ? ` (${e.status === 'closed' ? 'продажа закрыта' : 'отменено'})` : ''}</option>`).join('')}</select></label>
    </div>
    <div class="admin-grid" style="margin-top:24px">
      <div class="card" id="checkin-card">
        <h3>Вход гостей</h3>
        <p class="muted">Отсканируйте QR с билета камерой или введите код вручную.</p>
        <video class="scanner" id="video" hidden playsinline muted></video>
        <form class="row" id="checkin">
          <label class="field"><span>Код билета</span><input class="input" name="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off"></label>
          <button class="btn" type="submit">Отметить вход</button>
          <button class="btn ghost" type="button" id="cam">Камера</button>
        </form>
        <div id="scan-result" aria-live="assertive"></div>
      </div>
      <div class="card"><h3>Продажи</h3><div class="stats" id="stats"></div>
        <div id="entry-meter"></div>
        <div class="row" id="sale-controls"></div></div>
    </div>
    <div class="admin-grid" style="margin-top:20px">
      <div class="card"><h3>Билеты</h3><div id="occupancy"></div>
        <form class="row" id="event-edit" style="align-items:end;margin-top:14px">
          <label class="field" style="flex:0 1 160px"><span>Сколько продавать</span><input class="input" name="capacity" type="number" inputmode="numeric" min="1" max="5000" required></label>
          <label class="field" style="flex:0 1 140px"><span>Цена, ₽</span><input class="input" name="price" type="number" inputmode="numeric" min="1" required></label>
          <button class="btn small" type="submit">Сохранить</button>
        </form></div>
      <div class="card"><h3>Продано билетов по дням</h3><div id="sales-chart"></div></div>
    </div>
    <div class="card" style="margin-top:20px">
      <h3>Заявки на возврат <span class="req-count" id="refund-count" hidden></span></h3>
      <p class="muted">Гости не могут вернуть деньги сами: они отправляют заявку. «Вернуть деньги» возвращает всю сумму заказа на карту гостя через ЮKassa, чек возврата уходит сам. Вернуть часть билетов можно в «Изменить» у заказа: аннулируйте лишние.</p>
      <div class="table-wrap" id="refunds"></div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="row" style="justify-content:space-between;align-items:center"><h3>Заявки на бронь стола <span class="req-count" id="req-count" hidden></span></h3>
        <label class="check"><input type="checkbox" id="req-all"> Показать обработанные</label></div>
      <div class="table-wrap" id="requests"></div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="row" style="justify-content:space-between;align-items:center"><h3>Контролёры</h3>
        <form class="row" id="invite-form" style="align-items:end">
          <label class="field" style="min-width:200px"><span>Имя</span><input class="input" name="name" placeholder="Например, Саша на входе" required maxlength="60"></label>
          <button class="btn small" type="submit">Пригласить</button>
        </form></div>
      <p class="muted">Контролёр один раз открывает приглашение на своём телефоне и дальше гасит билеты обычной камерой. Продаж и контактов гостей он не видит.</p>
      <div id="invite"></div>
      <div class="table-wrap" id="staff-list"></div>
    </div>
    <div class="card" style="margin-top:20px"><h3>Заказы</h3>
      <input class="input" id="filter" placeholder="Поиск по имени, телефону или номеру заказа">
      <div class="table-wrap" id="orders"></div></div>
    <details class="card" style="margin-top:20px"><summary style="cursor:pointer"><h3 style="display:inline">Новое событие</h3></summary>
      <form id="new-event" class="dlg-body" style="padding:12px 0 0">
        <div class="row">
          <label class="field"><span>Название</span><input class="input" name="title" required></label>
          <label class="field"><span>Жанр</span><input class="input" name="genre" placeholder="Караоке, живой звук"></label>
        </div>
        <label class="field"><span>Кто выступает</span><input class="input" name="lineup"></label>
        <label class="field"><span>Описание</span><textarea class="input" name="description"></textarea></label>
        <div class="row">
          <label class="field"><span>Начало</span><input class="input" type="datetime-local" name="startsAt" required></label>
          <label class="field"><span>Открытие дверей</span><input class="input" type="datetime-local" name="doorsAt"></label>
        </div>
        <div class="row">
          <label class="field"><span>Цена билета, ₽</span><input class="input" type="number" name="price" min="1" required value="1000"></label>
          <label class="field"><span>Сколько билетов продавать</span><input class="input" type="number" name="capacity" min="1" max="5000" required value="136"></label>
        </div>
        <p class="form-error" id="new-error"></p>
        <button class="btn" type="submit">Открыть продажу</button>
      </form>
    </details>
  </section>`;

  $('#ev').addEventListener('change', (e) => { currentId = Number(e.target.value); loadReport(); });
  $('#checkin').addEventListener('submit', (e) => { e.preventDefault(); checkIn(e.currentTarget.code.value); e.currentTarget.code.value = ''; });
  $('#cam').addEventListener('click', toggleCamera);
  $('#filter').addEventListener('input', () => drawOrders());
  $('#new-event').addEventListener('submit', createEvent);
  $('#invite-form').addEventListener('submit', inviteStaff);
  $('#event-edit').addEventListener('submit', saveEvent);
  $('#req-all').addEventListener('change', drawRequests);
  loadReport();
  loadStaff();
  loadRequests();
  loadRefunds();
}

let report;
async function loadReport() {
  if (!currentId) {
    $('#stats').innerHTML = '<p class="muted">Событий пока нет. Создайте первое внизу страницы.</p>';
    return;
  }
  try {
    report = await adm(`/api/admin/events/${currentId}/report`);
  } catch (err) {
    if (err.status === 401) { sessionStorage.removeItem('mt.admin'); return login('Пароль изменился, войдите снова'); }
    toast(err.message, { error: true });
    return;
  }
  const s = report.stats;
  const e = report.event;
  $('#stats').innerHTML = `
    <div><b>${s.seatsSold}</b><span>билетов продано</span></div>
    <div><b>${s.checkedIn}</b><span>гостей пришло</span></div>
    <div><b>${s.seatsHeld}</b><span>в брони (ждут оплаты)</span></div>
    <div><b>${money(s.revenue)}</b><span>выручка по билетам</span></div>`;
  $('#sale-controls').innerHTML = `<a class="btn ghost small" href="/event?id=${e.id}" target="_blank">Страница события</a>
    ${e.status === 'on_sale' ? '<button class="btn ghost small" data-status="closed">Закрыть продажу</button>' : '<button class="btn ghost small" data-status="on_sale">Открыть продажу</button>'}
    ${e.status !== 'cancelled' ? '<button class="btn ghost small" data-status="cancelled">Отменить событие</button>' : ''}`;
  $$('#sale-controls [data-status]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'cancelled' && !confirm('Отменить событие? Продажа остановится. Возвраты по оплаченным заказам оформите в списке заказов.')) return;
    try {
      await adm(`/api/admin/events/${e.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
      toast('Статус события обновлён');
      start();
    } catch (err) { toast(err.message, { error: true }); }
  }));

  const f = $('#event-edit');
  f.capacity.value = e.capacity;
  f.price.value = e.price;
  drawCharts();
  drawOrders();

  es?.close();
  es = new EventSource(`/api/events/${currentId}/stream`);
  let t;
  es.onmessage = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      report = await adm(`/api/admin/events/${currentId}/report`).catch(() => report);
      drawOrders();
      drawCharts();
      const s2 = report.stats;
      $('#stats').querySelectorAll('b').forEach((b, i) => { b.textContent = [s2.seatsSold, s2.checkedIn, s2.seatsHeld, money(s2.revenue)][i]; });
    }, 400);
  };
}

function drawCharts() {
  occupancyChart($('#occupancy'), report.availability);
  salesChart($('#sales-chart'), report.orders);
  entryMeter($('#entry-meter'), report.stats.checkedIn, report.stats.seatsSold);
}

function drawOrders() {
  const q = $('#filter').value.trim().toLowerCase();
  const rows = report.orders.filter((o) => !q || [o.code, o.name, o.phone, o.email, ...o.tickets.map((t) => t.guestName)]
    .filter(Boolean).join(' ').toLowerCase().includes(q));
  $('#orders').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Заказ</th><th>Гость</th><th>Билеты</th><th>Сумма</th><th>Статус</th><th></th></tr></thead><tbody>
    ${rows.map((o) => {
      const came = o.tickets.filter((t) => t.status === 'used').length;
      return `<tr><td><b>${esc(o.code)}</b><br><span class="muted">${fmt.date(o.createdAt)}, ${fmt.time(o.createdAt)}</span></td>
        <td>${esc(o.name || '—')}<br><span class="muted">${o.phone ? `+7 ${esc(o.phone)}` : ''}</span></td>
        <td>${ticketsWord(o.tickets.length)}<br><span class="muted">пришли ${came}</span></td>
        <td>${money(o.total)}${o.paidOnline ? '<br><span class="muted">ЮKassa</span>' : ''}${o.refundedAmount ? `<br><span class="muted">возвращено ${money(o.refundedAmount)}</span>` : ''}</td><td><span class="status ${o.status}">${STATUS_TEXT[o.status]}</span>${o.status === 'paid' && o.refundRequest?.status === 'pending' ? '<br><span class="status held" style="margin-top:6px">просит возврат</span>' : ''}</td>
        <td>${o.status === 'paid' ? `<button class="link-btn" data-edit="${esc(o.code)}">Изменить</button><br>${o.tickets.some((t) => t.status === 'active') ? `<button class="link-btn" data-admit="${esc(o.tickets.find((t) => t.status === 'active').code)}">Впустить гостя</button><br>` : ''}${o.tickets.some((t) => t.status === 'used') ? '' : `<button class="link-btn" data-refund="${esc(o.code)}">Возврат</button>`}` : ''}</td></tr>`;
    }).join('')}</tbody></table>` : `<p class="muted">${q ? 'Ничего не нашлось.' : 'Заказов пока нет.'}</p>`;
  // Запасной путь, если у гостя сел телефон: находим заказ по имени и впускаем по одному.
  $$('[data-admit]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Впустить одного гостя по этому заказу? Проверьте имя или документ.')) return;
    await checkIn(b.dataset.admit);
    loadReport();
  }));
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.dataset.edit)));
  $$('[data-refund]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Оформить возврат по заказу ${b.dataset.refund}? Все билеты заказа перестанут действовать и вернутся в продажу.`)) return;
    try {
      await adm(`/api/admin/orders/${b.dataset.refund}/refund`, { method: 'POST' });
      toast('Возврат оформлен');
      loadReport();
      loadRefunds();
    } catch (err) { toast(err.message, { error: true }); }
  }));
}

// ---- Правка заказа и билетов ----
const EDIT_STATUS = [['active', 'Действует'], ['used', 'Прошёл'], ['cancelled', 'Аннулирован']];
let editing = null; // номер заказа в окне правки

function editorDialog() {
  let dlg = $('#edit-dlg');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'edit-dlg';
  dlg.setAttribute('aria-labelledby', 'edit-title');
  document.body.append(dlg);
  dlg.addEventListener('close', () => { editing = null; });
  return dlg;
}

function renderEditor() {
  const o = report.orders.find((x) => x.code === editing);
  const dlg = editorDialog();
  if (!o) { dlg.close(); return; }
  const tickets = o.tickets.filter((t) => t.status !== 'held' && t.status !== 'released');
  dlg.innerHTML = `<div class="dlg-head"><h2 id="edit-title">Заказ <span style="white-space:nowrap">${esc(o.code)}</span></h2>
      <button class="icon-close" data-close aria-label="Закрыть">×</button></div>
    <div class="dlg-body">
      <form id="edit-order" class="edit-block">
        <h3>Покупатель</h3>
        <label class="field"><span>Имя</span><input class="input" name="name" value="${esc(o.name || '')}" required maxlength="80" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" inputmode="tel" value="${o.phone ? `+7 ${esc(o.phone)}` : ''}" required autocomplete="off"></label>
          <label class="field"><span>Почта</span><input class="input" name="email" type="email" value="${esc(o.email || '')}" autocomplete="off"></label>
        </div>
        <button class="btn small">Сохранить покупателя</button>
      </form>
      ${tickets.map((t) => `<form class="edit-block edit-ticket" data-code="${t.code}">
        <h3>Билет ${prettyCode(t.code)} <span class="status ${t.status}">${STATUS_TEXT[t.status]}</span></h3>
        <label class="field"><span>Имя гостя</span><input class="input" name="guestName" value="${esc(t.guestName || '')}" maxlength="80" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>Цена, ₽</span><input class="input" name="price" type="number" inputmode="numeric" min="0" step="50" value="${t.price}"></label>
          <label class="field"><span>Статус</span><select class="input" name="status">${EDIT_STATUS.map(([v, l]) => `<option value="${v}" ${v === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="check"><input type="checkbox" name="newQr"> Выдать новый QR: старый QR и PDF перестанут пускать</label>
        <button class="btn small">Сохранить билет</button>
      </form>`).join('')}
    </div>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('#edit-order').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await saveEdit(`/api/admin/orders/${encodeURIComponent(o.code)}`, { name: f.name.value, phone: f.phone.value, email: f.email.value }, 'Покупатель сохранён');
  });
  dlg.querySelectorAll('.edit-ticket').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = tickets.find((x) => x.code === f.dataset.code);
    const body = {
      guestName: f.guestName.value, price: Number(f.price.value), status: f.status.value, newQr: f.newQr.checked,
    };
    if (body.status === 'cancelled' && t.status !== 'cancelled' && !confirm(`Аннулировать билет? Он вернётся в продажу, QR перестанет пускать. ${o.paidOnline ? `${money(t.price)} вернутся на карту гостя через ЮKassa, чек возврата уйдёт сам.` : 'Деньги верните на кассе.'}`)) return;
    if (body.newQr && !confirm('Выдать новый QR? Гостю нужно открыть билет заново или скачать новый PDF.')) return;
    await saveEdit(`/api/admin/tickets/${encodeURIComponent(t.code)}`, body, 'Билет сохранён');
  }));
}

async function saveEdit(path, body, done) {
  try {
    await adm(path, { method: 'POST', body });
    toast(done);
    await loadReport();
    renderEditor();
  } catch (err) { toast(err.message, { error: true }); }
}

function openEditor(code) {
  editing = code;
  renderEditor();
  editorDialog().showModal();
}

const RESULT = {
  ok: ['ok', 'Проходите'],
  already_used: ['warn', 'Билет уже использован'],
  wrong_event: ['bad', 'Билет на другое событие'],
  invalid: ['bad', 'Билет недействителен'],
  expired_qr: ['bad', 'QR устарел — это скриншот'],
  wrong_day: ['bad', 'Билет не на сегодня'],
  event_cancelled: ['bad', 'Событие отменено'],
};

let lastScan = '';
async function checkIn(code) {
  if (!code.trim()) return;
  try {
    const r = await adm('/api/admin/checkin', { method: 'POST', body: { code, eventId: currentId } });
    const [cls, title] = RESULT[r.result] || ['bad', 'Билет недействителен'];
    const t = r.ticket;
    if (!t) {
      $('#scan-result').innerHTML = `<div class="scan-result ${cls}">${title}<span>Код не подошёл: устарел или набран с ошибкой.</span></div>`;
      return;
    }
    $('#scan-result').innerHTML = `<div class="scan-result ${cls}">${title}
      <span>${esc(t.guestName || 'Гость')}</span>
      <span class="muted">${esc(t.event.title)}, ${fmt.date(t.event.startsAt)}. Билет ${prettyCode(t.code)}${t.checkedInAt ? `, вход в ${fmt.time(t.checkedInAt)}` : ''}${r.result === 'invalid' ? `, статус: ${STATUS_TEXT[t.status]}` : ''}</span></div>`;
    navigator.vibrate?.(r.result === 'ok' ? 80 : [60, 60, 60]);
  } catch (err) {
    $('#scan-result').innerHTML = `<div class="scan-result bad">${esc(err.message)}</div>`;
  }
}

let stream = null;
async function toggleCamera() {
  const video = $('#video');
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    return;
  }
  if (!('BarcodeDetector' in window)) {
    toast('Этот браузер не умеет читать QR с камеры. Откройте админку в Chrome на Android или введите код вручную.', { error: true, ms: 6000 });
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    toast('Нет доступа к камере. Разрешите его в настройках браузера.', { error: true });
    return;
  }
  video.srcObject = stream;
  video.hidden = false;
  await video.play();
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  const loop = async () => {
    if (!stream) return;
    try {
      const [code] = await detector.detect(video);
      if (code && code.rawValue !== lastScan) {
        lastScan = code.rawValue;
        await checkIn(code.rawValue);
        setTimeout(() => { lastScan = ''; }, 3000);
      }
    } catch { /* кадр не распознан */ }
    requestAnimationFrame(loop);
  };
  loop();
}

async function loadStaff() {
  const list = await adm('/api/admin/staff').catch(() => []);
  $('#staff-list').innerHTML = list.length ? `<table class="list"><thead><tr><th>Контролёр</th><th>Подключён</th><th>Последняя активность</th><th>Пропустил</th><th></th></tr></thead><tbody>
    ${list.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td>${fmt.date(d.createdAt)}</td><td>${d.lastUsedAt ? `${fmt.date(d.lastUsedAt)}, ${fmt.time(d.lastUsedAt)}` : '—'}</td>
      <td>${d.checkins}</td><td><button class="link-btn" data-revoke="${d.id}">Отключить</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Пока ни одного телефона контролёра.</p>';
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Отключить этот телефон? Он сразу перестанет гасить билеты.')) return;
    try {
      await adm(`/api/admin/staff/${b.dataset.revoke}/revoke`, { method: 'POST' });
      toast('Телефон контролёра отключён');
    } catch (err) { toast(err.message, { error: true }); }
    loadStaff();
  }));
}

async function inviteStaff(e) {
  e.preventDefault();
  const f = e.currentTarget;
  try {
    const inv = await adm('/api/admin/staff/invite', { method: 'POST', body: { name: f.name.value } });
    const link = `${location.origin}/staff#invite=${inv.code}`;
    f.reset();
    $('#invite').innerHTML = `<div class="invite">
      <div class="qr">${qrSvg(link)}</div>
      <div><b>Приглашение для «${esc(inv.name)}»</b>
        <p class="muted">Отсканируйте QR телефоном контролёра или отправьте ему ссылку. Работает один раз, до ${fmt.time(inv.expiresAt)}.</p>
        <code>${esc(link)}</code><br><button class="link-btn" id="copy-invite">Скопировать ссылку</button></div></div>`;
    $('#copy-invite').addEventListener('click', async () => toast(await copyText(link) ? 'Ссылка скопирована' : 'Не удалось скопировать: покажите контролёру QR'));
    setTimeout(loadStaff, 60e3);
  } catch (err) { toast(err.message, { error: true }); }
}

async function createEvent(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const data = Object.fromEntries(new FormData(f));
  // datetime-local без пояса: сервер понимает его как время заведения, а не браузера
  try {
    const ev = await adm('/api/admin/events', { method: 'POST', body: data });
    currentId = ev.id;
    toast('Событие создано, продажа открыта');
    start();
  } catch (err) { $('#new-error').textContent = err.message; }
}

async function saveEvent(e) {
  e.preventDefault();
  const f = e.currentTarget;
  try {
    await adm(`/api/admin/events/${currentId}`, { method: 'POST', body: { capacity: Number(f.capacity.value), price: Number(f.price.value) } });
    toast('Событие сохранено');
    loadReport();
  } catch (err) { toast(err.message, { error: true }); }
}

// ---- Заявки на бронь стола ----
const REQ_STATUS = { new: 'Новая', confirmed: 'Подтверждена', declined: 'Отказ' };
let requests = [];
async function loadRequests() {
  requests = await adm('/api/admin/table-requests').catch(() => requests);
  drawRequests();
}

function drawRequests() {
  const all = $('#req-all').checked;
  const fresh = requests.filter((r) => r.status === 'new').length;
  $('#req-count').hidden = !fresh;
  $('#req-count').textContent = fresh;
  const rows = all ? requests : requests.filter((r) => r.status === 'new');
  $('#requests').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Когда</th><th>Гость</th><th>Гостей</th><th>Пожелания</th><th>Статус</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${r.event ? `${fmt.date(r.event.startsAt)}, ${esc(r.event.title)}` : esc(fmt.date(`${r.day}T12:00:00Z`))}</b><br><span class="muted">заявка ${fmt.date(r.createdAt)}, ${fmt.time(r.createdAt)}</span></td>
      <td>${esc(r.name)}<br><a href="tel:+7${esc(r.phone)}">+7 ${esc(r.phone)}</a></td>
      <td>${r.guests}</td>
      <td>${esc(r.comment || '—')}${r.note ? `<br><span class="muted">Заметка: ${esc(r.note)}</span>` : ''}</td>
      <td><span class="status req-${r.status}">${REQ_STATUS[r.status]}</span></td>
      <td>${r.status !== 'confirmed' ? `<button class="link-btn" data-req="${r.id}" data-to="confirmed">Подтвердить</button><br>` : ''}${r.status !== 'declined' ? `<button class="link-btn" data-req="${r.id}" data-to="declined">Отказать</button><br>` : ''}<button class="link-btn" data-req="${r.id}" data-note>Заметка</button></td></tr>`).join('')}</tbody></table>`
    : `<p class="muted">${all ? 'Заявок пока нет.' : 'Новых заявок нет.'}</p>`;
  $$('[data-req]').forEach((b) => b.addEventListener('click', async () => {
    const r = requests.find((x) => x.id === Number(b.dataset.req));
    const body = {};
    if (b.dataset.to) body.status = b.dataset.to;
    else {
      const note = prompt('Заметка к заявке (например, номер стола)', r.note || '');
      if (note === null) return;
      body.note = note;
    }
    try {
      await adm(`/api/admin/table-requests/${r.id}`, { method: 'POST', body });
      toast('Заявка обновлена');
      loadRequests();
    } catch (err) { toast(err.message, { error: true }); }
  }));
}
// ---- Заявки на возврат ----
let refunds = [];
async function loadRefunds() {
  refunds = await adm('/api/admin/refund-requests').catch(() => refunds);
  $('#refund-count').hidden = !refunds.length;
  $('#refund-count').textContent = refunds.length;
  $('#refunds').innerHTML = refunds.length ? `<table class="list"><thead><tr><th>Заказ</th><th>Гость</th><th>Сумма</th><th>Причина</th><th></th></tr></thead><tbody>
    ${refunds.map((o) => `<tr><td><b>${esc(o.code)}</b><br><span class="muted">${esc(o.event.title)}, ${fmt.date(o.event.startsAt)}</span><br><span class="muted">заявка ${fmt.date(o.refundRequest.at)}, ${fmt.time(o.refundRequest.at)}</span></td>
      <td>${esc(o.name || '—')}${o.phone ? `<br><a href="tel:+7${esc(o.phone)}">+7 ${esc(o.phone)}</a>` : ''}</td>
      <td>${money(o.total)}<br><span class="muted">${ticketsWord(o.tickets.length)}</span></td>
      <td>${esc(o.refundRequest.reason || '—')}</td>
      <td><button class="link-btn" data-refund-ok="${esc(o.code)}">Вернуть деньги</button><br><button class="link-btn" data-refund-no="${esc(o.code)}">Отказать</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Новых заявок на возврат нет.</p>';
  $$('[data-refund-ok]').forEach((b) => b.addEventListener('click', async () => {
    const o = refunds.find((x) => x.code === b.dataset.refundOk);
    if (!confirm(`Вернуть ${money(o.total)} по заказу ${o.code}? Билеты перестанут действовать${o.paidOnline ? ', деньги уйдут на карту гостя через ЮKassa' : ', деньги верните на кассе'}.`)) return;
    try {
      await adm(`/api/admin/orders/${encodeURIComponent(o.code)}/refund`, { method: 'POST' });
      toast('Деньги возвращены');
      loadRefunds();
      if (currentId) loadReport();
    } catch (err) { toast(err.message, { error: true }); }
  }));
  $$('[data-refund-no]').forEach((b) => b.addEventListener('click', async () => {
    const note = prompt('Причина отказа, её увидит гость (можно оставить пустой)', '');
    if (note === null) return;
    try {
      await adm(`/api/admin/orders/${encodeURIComponent(b.dataset.refundNo)}/refund-decline`, { method: 'POST', body: { note } });
      toast('В возврате отказано');
      loadRefunds();
    } catch (err) { toast(err.message, { error: true }); }
  }));
}

// новые заявки подтягиваем сами, пока админка открыта
setInterval(() => { if (token && $('#requests')) { loadRequests(); loadRefunds(); } }, 60e3);

token ? start() : login();
