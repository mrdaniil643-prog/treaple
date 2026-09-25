import { api, $ } from './common.js';
import { showGateResult } from './gate-result.js';

// Сюда ведёт живой QR с билета: /c/<код>.<подпись>.
// Телефон контролёра гасит билет сразу; у остальных ничего не происходит.
const app = $('#app');
const payload = decodeURIComponent(location.pathname.replace(/^\/c\//, ''));

async function main() {
  try {
    const r = await api('/api/staff/checkin', { method: 'POST', body: { code: payload, source: 'scan' } });
    showGateResult(app, r, { next: () => { location.href = '/staff'; } });
  } catch (err) {
    if (err.status === 401) {
      app.innerHTML = `<section class="wrap page-head" style="max-width:520px">
        <h1 style="font-size:32px">Это билет в МТ</h1>
        <p>Его проверяет контролёр на входе. Если это ваш билет — просто покажите экран телефона.</p>
        <p class="cart-note" style="margin-top:20px">Вы контролёр? Откройте приглашение от администратора в этом браузере, и дальше QR будут гаситься сразу при скане.</p>
      </section>`;
      return;
    }
    showGateResult(app, { result: err.status === 404 ? 'not_found' : 'invalid', error: err.status === 404 ? '' : err.message }, { next: () => { location.href = '/staff'; } });
  }
}
main();
