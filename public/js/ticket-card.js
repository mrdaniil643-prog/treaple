import { esc, fmt, money, STATUS_TEXT } from './common.js';

// QR внутри карточки живой: его рисует live-qr.js и обновляет каждые 30 секунд.
export function ticketCard(t, event, { actions = true } = {}) {
  const cls = t.status === 'used' ? ' is-used' : t.status === 'cancelled' ? ' is-cancelled' : '';
  return `<article class="ticket${cls}" data-code="${t.code}" data-status="${t.status}">
    <div class="ticket-top">
      <span class="t-when">${fmt.full(event.startsAt)}</span>
      <span class="t-event">${esc(event.title)}</span>
      <div class="t-place">
        <div><small>${t.whole ? 'Стол целиком' : 'Зал'}</small><b style="font-size:15px;line-height:1.9">${esc(t.hall)}</b></div>
        <div><small>Стол</small><b>${esc(t.table)}</b></div>
        <div><small>Место</small><b>${t.seat}</b></div>
      </div>
      <div class="t-guest"><span>${esc(t.guestName || 'Гость')}</span><span class="status ${t.status}">${STATUS_TEXT[t.status]}</span></div>
    </div>
    <div class="ticket-bottom">
      <div class="qr-wrap">
        <div class="qr" aria-label="Живой QR-код билета">${t.status === 'active' ? '<span class="qr-wait">QR загружается…</span>' : ''}</div>
        <div class="qr-live" aria-hidden="true"><i></i></div>
        <span class="stamp" aria-hidden="true">Прошёл${t.checkedInAt ? `<small>${fmt.time(t.checkedInAt)}</small>` : ''}</span>
      </div>
      <div>
        <time class="t-clock" aria-hidden="true"></time>
        <div class="t-pin"><small>Код для входа</small><b>······</b></div>
        <small>${money(t.price)}${event.deposit ? `, депозит ${money(event.deposit)}` : ''}</small>
        <p class="t-offline">Нет связи — QR устарел. Включите интернет или назовите имя администратору на входе.</p>
        ${actions && t.status === 'active' ? `<div class="ticket-actions">
          <button data-share="${t.code}">Отправить гостю</button>
          <button data-rename="${t.code}">Изменить имя</button>
        </div>` : ''}
      </div>
    </div>
  </article>`;
}
