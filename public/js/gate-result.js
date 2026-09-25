import { esc, fmt, STATUS_TEXT } from './common.js';

export const RESULTS = {
  ok: { tone: 'ok', title: 'Проходите' },
  already_used: { tone: 'bad', title: 'Уже прошёл' },
  expired_qr: { tone: 'bad', title: 'QR устарел' },
  wrong_event: { tone: 'bad', title: 'Билет на другое событие' },
  wrong_day: { tone: 'bad', title: 'Билет не на сегодня' },
  invalid: { tone: 'bad', title: 'Билет недействителен' },
  not_found: { tone: 'bad', title: 'Такого билета нет' },
  event_cancelled: { tone: 'bad', title: 'Событие отменено' },
};

function detail(r) {
  const t = r.ticket;
  if (!t) return r.result === 'expired_qr' ? '<p class="gate-hint">Код не подошёл: он устарел или набран с ошибкой. Попросите гостя открыть билет на телефоне.</p>' : '';
  const place = `${esc(t.hall)}, стол ${esc(t.table)}, место ${t.seat}${t.whole ? ' (стол целиком)' : ''}`;
  const hints = {
    already_used: `Вход был в ${t.checkedInAt ? fmt.time(t.checkedInAt) : '—'}. Возможно, билет переслали или показывают скриншот.`,
    expired_qr: 'Это скриншот или старая картинка. Попросите гостя открыть билет на телефоне — QR и код для входа на живом экране меняются каждые 30 секунд.',
    wrong_event: `Билет на «${esc(t.event.title)}», ${fmt.date(t.event.startsAt)}.`,
    wrong_day: `Билет на «${esc(t.event.title)}», ${fmt.full(t.event.startsAt)}.`,
    invalid: `Статус: ${esc(STATUS_TEXT[t.status] || t.status)}.`,
  };
  return `<p class="gate-name">${esc(t.guestName || 'Гость')}</p>
    <p class="gate-place">${place}</p>
    ${hints[r.result] ? `<p class="gate-hint">${hints[r.result]}</p>` : `<p class="gate-hint">${esc(t.event.title)}</p>`}
    <p class="gate-code">Билет …${esc(t.code.slice(-4))}</p>`;
}

let audio;
function signal(ok) {
  navigator.vibrate?.(ok ? 120 : [80, 60, 80, 60, 200]);
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 880 : 220;
    o.type = ok ? 'sine' : 'square';
    g.gain.setValueAtTime(0.15, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (ok ? 0.25 : 0.6));
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (ok ? 0.25 : 0.6));
  } catch { /* звук необязателен */ }
}

// Полноэкранный результат проверки: зелёный — пропустить, красный — остановить.
export function showGateResult(container, r, { next } = {}) {
  const info = r.result === 'expired_qr' && !r.ticket ? { tone: 'bad', title: 'Код не подошёл' } : RESULTS[r.result] || RESULTS.invalid;
  container.innerHTML = `<section class="gate gate-${info.tone}" role="alert">
    <div class="gate-mark" aria-hidden="true">${info.tone === 'ok' ? '✓' : '✕'}</div>
    <h1>${info.title}</h1>
    ${r.error ? `<p class="gate-hint">${esc(r.error)}</p>` : detail(r)}
    ${next ? '<button class="btn cream gate-next" type="button">Сканировать следующий</button>' : ''}
  </section>`;
  signal(info.tone === 'ok');
  container.querySelector('.gate-next')?.addEventListener('click', next);
  container.querySelector('.gate-next')?.focus();
}
