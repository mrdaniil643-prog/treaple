import { api, esc, fmt, money, seatsWord, renderHeader, toast, prettyCode, STATUS_TEXT, $, $$ } from './common.js';
import { mountHall } from './hallmap.js';

renderHeader('');
const app = $('#app');
let token = sessionStorage.getItem('mt.admin') || '';
let config, events = [], currentId = null, map = null, es = null;

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
    [config, events] = await Promise.all([api('/api/config'), adm('/api/admin/events')]);
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
        <div class="row" id="sale-controls"></div></div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="row" style="justify-content:space-between"><h3>Схема зала</h3><div class="hall-tabs" id="admin-halls"></div></div>
      <div id="admin-map" style="width:100%"></div>
    </div>
    <div class="card" style="margin-top:20px"><h3>Заказы</h3>
      <input class="input" id="filter" placeholder="Поиск по имени, телефону, номеру заказа или столу">
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
          <label class="field"><span>Цена места, ₽</span><input class="input" type="number" name="price" min="1" required value="1000"></label>
          <label class="field"><span>Из них депозит, ₽</span><input class="input" type="number" name="deposit" min="0" value="500"></label>
        </div>
        <div class="row">${config.halls.map((h) => `<label class="check"><input type="checkbox" name="halls" value="${h.id}" checked> ${esc(h.title)}</label>`).join('')}</div>
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
  loadReport();
}

let report;
async function loadReport() {
  report = await adm(`/api/admin/events/${currentId}/report`);
  const s = report.stats;
  const e = report.event;
  $('#stats').innerHTML = `
    <div><b>${s.seatsSold}</b><span>мест продано</span></div>
    <div><b>${s.checkedIn}</b><span>гостей пришло</span></div>
    <div><b>${s.seatsHeld}</b><span>в брони (ждут оплаты)</span></div>
    <div><b>${money(s.revenue)}</b><span>выручка по билетам</span></div>`;
  $('#sale-controls').innerHTML = `<a class="btn ghost small" href="/event?id=${e.id}" target="_blank">Страница события</a>
    ${e.status === 'on_sale' ? '<button class="btn ghost small" data-status="closed">Закрыть продажу</button>' : '<button class="btn ghost small" data-status="on_sale">Открыть продажу</button>'}
    ${e.status !== 'cancelled' ? '<button class="btn ghost small" data-status="cancelled">Отменить событие</button>' : ''}`;
  $$('#sale-controls [data-status]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.status === 'cancelled' && !confirm('Отменить событие? Продажа остановится. Возвраты по оплаченным заказам оформите в списке заказов.')) return;
    await adm(`/api/admin/events/${e.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
    toast('Статус события обновлён');
    start();
  }));

  const halls = config.halls.filter((h) => e.halls.includes(h.id));
  $('#admin-halls').innerHTML = halls.map((h, i) => `<button data-h="${h.id}" aria-selected="${i === 0}">${esc(h.title)}</button>`).join('');
  const show = (id) => {
    const hall = config.halls.find((h) => h.id === id);
    map = mountHall($('#admin-map'), hall, { readonly: true, rotate: innerWidth >= 900 && hall.viewBox[3] > hall.viewBox[2] * 1.3 });
    map.update(report.availability.tables);
    $$('#admin-halls button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.h === id)));
  };
  $$('#admin-halls button').forEach((b) => b.addEventListener('click', () => show(b.dataset.h)));
  show(halls[0].id);
  drawOrders();

  es?.close();
  es = new EventSource(`/api/events/${currentId}/stream`);
  let t;
  es.onmessage = (m) => {
    map?.update(JSON.parse(m.data).tables);
    clearTimeout(t);
    t = setTimeout(async () => {
      report = await adm(`/api/admin/events/${currentId}/report`).catch(() => report);
      drawOrders();
      const s2 = report.stats;
      $('#stats').querySelectorAll('b').forEach((b, i) => { b.textContent = [s2.seatsSold, s2.checkedIn, s2.seatsHeld, money(s2.revenue)][i]; });
    }, 400);
  };
}

function drawOrders() {
  const q = $('#filter').value.trim().toLowerCase();
  const rows = report.orders.filter((o) => !q || [o.code, o.name, o.phone, o.email, ...o.tickets.map((t) => `стол ${t.table}`), ...o.tickets.map((t) => t.guestName)]
    .filter(Boolean).join(' ').toLowerCase().includes(q));
  $('#orders').innerHTML = rows.length ? `<table class="list"><thead><tr><th>Заказ</th><th>Гость</th><th>Места</th><th>Сумма</th><th>Статус</th><th></th></tr></thead><tbody>
    ${rows.map((o) => {
      const byTable = {};
      for (const t of o.tickets) (byTable[t.table] ||= []).push(t);
      const places = Object.entries(byTable).map(([n, ts]) => `Стол ${n}: ${ts.filter((t) => t.status === 'used').length}/${ts.length} пришли`).join('<br>');
      return `<tr><td><b>${esc(o.code)}</b><br><span class="muted">${fmt.date(o.createdAt)}, ${fmt.time(o.createdAt)}</span></td>
        <td>${esc(o.name || '—')}<br><span class="muted">${o.phone ? `+7 ${esc(o.phone)}` : ''}</span></td>
        <td>${places}<br><span class="muted">${seatsWord(o.tickets.length)}</span></td>
        <td>${money(o.total)}</td><td><span class="status ${o.status}">${STATUS_TEXT[o.status]}</span></td>
        <td>${o.status === 'paid' ? `<button class="link-btn" data-refund="${esc(o.code)}">Возврат</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table>` : `<p class="muted">${q ? 'Ничего не нашлось.' : 'Заказов пока нет.'}</p>`;
  $$('[data-refund]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Оформить возврат по заказу ${b.dataset.refund}? Все билеты заказа перестанут действовать, места освободятся.`)) return;
    try {
      await adm(`/api/admin/orders/${b.dataset.refund}/refund`, { method: 'POST' });
      toast('Возврат оформлен');
      loadReport();
    } catch (err) { toast(err.message, { error: true }); }
  }));
}

const RESULT = {
  ok: ['ok', 'Проходите'],
  already_used: ['warn', 'Билет уже использован'],
  wrong_event: ['bad', 'Билет на другое событие'],
  invalid: ['bad', 'Билет недействителен'],
};

let lastScan = '';
async function checkIn(code) {
  if (!code.trim()) return;
  try {
    const r = await adm('/api/admin/checkin', { method: 'POST', body: { code, eventId: currentId } });
    const [cls, title] = RESULT[r.result];
    const t = r.ticket;
    $('#scan-result').innerHTML = `<div class="scan-result ${cls}">${title}
      <span>${esc(t.guestName || 'Гость')}, ${esc(t.hall)}, стол ${esc(t.table)}, место ${t.seat}</span>
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

async function createEvent(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const data = Object.fromEntries(new FormData(f));
  data.halls = $$('[name=halls]:checked', f).map((i) => i.value);
  data.startsAt = data.startsAt ? new Date(data.startsAt).toISOString() : '';
  data.doorsAt = data.doorsAt ? new Date(data.doorsAt).toISOString() : '';
  try {
    const ev = await adm('/api/admin/events', { method: 'POST', body: data });
    currentId = ev.id;
    toast('Событие создано, продажа открыта');
    start();
  } catch (err) { $('#new-error').textContent = err.message; }
}

token ? start() : login();
