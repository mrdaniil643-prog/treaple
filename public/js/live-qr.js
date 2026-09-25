import { fmt, qrSvg, toast, STATUS_TEXT, TZ, $$ } from './common.js';

// Живые QR: сервер присылает подписанный код на текущие 30 секунд и статус билета.
// Скриншот QR устаревает через минуту, а при проходе экран гостя сразу меняется.
export function startLiveTickets(root) {
  const cards = $$('.ticket[data-code]', root).filter((c) => c.dataset.status === 'active' || c.dataset.status === 'used');
  if (!cards.length) return () => {};
  const byCode = new Map(cards.map((c) => [c.dataset.code, c]));
  let lastMessage = 0, validUntil = 0, windowSec = 30, es = null, retry = null, stopped = false;
  const startedAt = Date.now();

  // Браузер сам переподключается не всегда (после 502 или 429 поток закрывается) —
  // переподключаемся сами с нарастающей паузой.
  let backoff = 2000;
  const connect = () => {
    if (stopped) return;
    es = new EventSource(`/api/tickets/live?codes=${[...byCode.keys()].join(',')}`);
    es.onmessage = onMessage;
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return;
      clearTimeout(retry);
      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30000);
    };
  };

  const onMessage = (m) => {
    backoff = 2000;
    const data = JSON.parse(m.data);
    lastMessage = Date.now();
    windowSec = data.window;
    validUntil = Date.now() + data.validFor * 1000;
    for (const [code, t] of Object.entries(data.tickets)) {
      const card = byCode.get(code);
      if (!card) continue;
      const was = card.dataset.status;
      card.dataset.status = t.status;
      if (t.table) {
        const [hall, table, seat] = card.querySelectorAll('.t-place b');
        hall.textContent = t.hall;
        table.textContent = t.table;
        seat.textContent = t.seat;
        card.querySelector('.t-place small').textContent = t.whole ? 'Стол целиком' : 'Зал';
        card.querySelector('.t-guest span').textContent = t.guestName || 'Гость';
      }
      const pin = card.querySelector('.t-pin b');
      if (t.status === 'active' && t.qr) {
        card.querySelector('.qr').innerHTML = qrSvg(`${location.origin}/c/${t.qr}`);
        if (pin) pin.textContent = t.pin.replace(/(.{3})/, '$1 ');
      } else {
        card.querySelector('.qr').innerHTML = '';
        card.querySelector('.t-pin')?.remove();
      }
      const status = card.querySelector('.status');
      status.className = `status ${t.status}`;
      status.textContent = STATUS_TEXT[t.status] || t.status;
      card.classList.toggle('is-used', t.status === 'used');
      card.classList.toggle('is-cancelled', t.status === 'cancelled');
      if (t.status === 'used') {
        card.querySelector('.stamp').innerHTML = `Прошёл${t.checkedInAt ? `<small>${fmt.time(t.checkedInAt)}</small>` : ''}`;
        card.querySelector('.ticket-actions')?.remove();
        if (was === 'active') {
          card.classList.add('just-used');
          navigator.vibrate?.(120);
          toast('Вы прошли, билет погашен.');
        }
      }
    }
  };

  connect();

  // Часы и убывающая полоска: контролёр видит, что экран живой, а не картинка.
  const tick = () => {
    const now = Date.now();
    // Сервер принимает QR ещё один интервал после смены; предупреждаем заранее, с запасом 5 секунд.
    const stale = lastMessage ? now > validUntil + (windowSec - 5) * 1000 : now - startedAt > 10000;
    const left = Math.max(0, validUntil - now) / (windowSec * 1000);
    const clock = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
    for (const card of byCode.values()) {
      card.classList.toggle('is-offline', stale && card.dataset.status === 'active');
      const bar = card.querySelector('.qr-live i');
      if (bar) bar.style.transform = `scaleX(${left})`;
      const time = card.querySelector('.t-clock');
      if (time) time.textContent = card.dataset.status === 'active' ? clock : '';
    }
  };
  const timer = setInterval(tick, 250);
  tick();
  return () => { stopped = true; clearInterval(timer); clearTimeout(retry); es?.close(); };
}
