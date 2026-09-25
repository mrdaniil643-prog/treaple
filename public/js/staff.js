import { api, esc, fmt, toast, renderHeader, $ } from './common.js';
import { showGateResult } from './gate-result.js';

renderHeader('');
const app = $('#app');
const history = [];

async function activateFromHash() {
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (!invite) return;
  window.history.replaceState(null, '', '/staff');
  try {
    const { name } = await api('/api/staff/activate', { method: 'POST', body: { invite } });
    toast(`Готово, ${name}: этот телефон теперь контролёр`);
  } catch (err) {
    toast(err.message, { error: true, ms: 7000 });
  }
}

function notStaff() {
  app.innerHTML = `<section class="wrap page-head" style="max-width:560px">
    <h1 style="font-size:34px">Контролёр</h1>
    <p>Этот телефон пока не подключён. Попросите администратора создать приглашение в админке и откройте его ссылку или QR на этом телефоне.</p>
  </section>`;
}

function renderHome(me) {
  app.innerHTML = `<section class="wrap page-head" style="max-width:640px">
    <h1 style="font-size:34px">Вход гостей</h1>
    <p>Контролёр: <b>${esc(me.name)}</b>. Наведите камеру телефона на QR билета — билет погасится сам. Или сканируйте здесь, без переходов.</p>
    <div class="dlg-body" style="padding:24px 0 0">
      <button class="btn block" id="scan">Сканировать</button>
      <video class="scanner" id="video" hidden playsinline muted></video>
      <form class="row" id="manual">
        <label class="field"><span>Код для входа с билета, если QR не читается</span><input class="input" name="code" placeholder="6 символов" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
        <button class="btn ghost" type="submit">Погасить</button>
      </form>
      <p class="cart-note">Код для входа меняется каждые 30 секунд, как и QR. Со встроенным сканером слышен звук результата — удобнее в шумном зале.</p>
      <div id="history"></div>
      <button class="link-btn" id="logout" style="justify-self:start">Отключить этот телефон</button>
    </div>
  </section>
  <div id="overlay"></div>`;
  $('#scan').addEventListener('click', toggleCamera);
  $('#manual').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = e.currentTarget.code.value.trim();
    e.currentTarget.code.value = '';
    if (code) check(code, 'manual');
  });
  $('#logout').addEventListener('click', async () => {
    if (!confirm('Отключить телефон? Чтобы снова проверять билеты, понадобится новое приглашение.')) return;
    await api('/api/staff/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });
  drawHistory();
}

function drawHistory() {
  $('#history').innerHTML = history.length ? `<h3 style="color:var(--cream);margin-top:12px">Последние проверки</h3>
    <ul class="cart-list">${history.map((h) => `<li><div><b>${esc(h.title)}</b><small>${esc(h.who)}</small></div><span>${fmt.time(h.at)}</span><span></span></li>`).join('')}</ul>` : '';
}

let busy = false;
// Один и тот же QR, оставшийся перед камерой, не проверяем повторно несколько секунд.
let lastScan = '', lastScanAt = 0;
async function check(code, source) {
  if (busy) return;
  if (source === 'scan' && code === lastScan && Date.now() - lastScanAt < 8000) return;
  lastScan = code;
  lastScanAt = Date.now();
  busy = true;
  let r;
  try {
    r = await api('/api/staff/checkin', { method: 'POST', body: { code, source } });
  } catch (err) {
    if (err.status === 401) { busy = false; return notStaff(); }
    r = { result: err.status === 404 ? 'not_found' : 'invalid', error: err.status === 404 ? '' : err.message };
  }
  const overlay = $('#overlay');
  overlay.className = 'gate-overlay';
  showGateResult(overlay, r, { next: () => { overlay.innerHTML = ''; overlay.className = ''; busy = false; } });
  history.unshift({ title: overlay.querySelector('h1').textContent, who: r.ticket ? `${r.ticket.guestName || 'Гость'}, стол ${r.ticket.table}` : code, at: new Date().toISOString() });
  history.length = Math.min(history.length, 8);
  drawHistory();
}

let stream = null;
async function toggleCamera() {
  const video = $('#video');
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    $('#scan').textContent = 'Сканировать';
    return;
  }
  if (!('BarcodeDetector' in window)) {
    toast('Этот браузер не читает QR сам. Сканируйте обычной камерой телефона — ссылка откроется и билет погасится.', { error: true, ms: 7000 });
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
  $('#scan').textContent = 'Выключить камеру';
  await video.play();
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  const loop = async () => {
    if (!stream) return;
    if (!busy) {
      try {
        const [c] = await detector.detect(video);
        if (c) await check(c.rawValue, 'scan');
      } catch { /* кадр не распознан */ }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

async function main() {
  await activateFromHash();
  try {
    renderHome(await api('/api/staff/me'));
  } catch (err) {
    if (err.status === 401) notStaff();
    else app.innerHTML = `<section class="wrap page-head"><p class="form-error">${esc(err.message)}</p></section>`;
  }
}
main();
