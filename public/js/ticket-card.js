import { esc, fmt, money, qrSvg, ticketUrl, prettyCode, STATUS_TEXT } from './common.js';

export function ticketCard(t, event, { actions = true } = {}) {
  const cls = t.status === 'used' ? ' is-used' : t.status === 'cancelled' ? ' is-cancelled' : '';
  return `<article class="ticket${cls}" data-code="${t.code}">
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
      <div class="qr" aria-label="QR-код билета">${t.status === 'active' ? qrSvg(ticketUrl(t.code)) : ''}</div>
      <div>
        <div class="t-code">${prettyCode(t.code)}</div>
        <small>${money(t.price)}${event.deposit ? `, депозит ${money(event.deposit)}` : ''}</small>
        ${actions && t.status === 'active' ? `<div class="ticket-actions">
          <button data-share="${t.code}">Отправить гостю</button>
          <button data-rename="${t.code}">Изменить имя</button>
        </div>` : ''}
      </div>
    </div>
  </article>`;
}
