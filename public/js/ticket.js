import { api, esc, fmt, renderHeader, renderFooter, $ } from './common.js';
import { ticketCard } from './ticket-card.js';

renderHeader('tickets');
const app = $('#app');
const code = new URLSearchParams(location.search).get('t') || '';

async function main() {
  try {
    const t = await api(`/api/tickets/${encodeURIComponent(code)}`);
    document.title = `Билет: ${t.event.title} — МТ`;
    app.innerHTML = `<section class="wrap page-head" style="max-width:460px">
      <h1 style="font-size:32px">Ваш билет</h1>
      <p>Покажите QR-код на входе. Двери открываются в ${fmt.time(t.event.doorsAt)}.</p>
      <div class="ticket-grid" style="grid-template-columns:1fr">${ticketCard(t, t.event, { actions: false })}</div>
      <p class="cart-note" style="margin-top:16px">Заказ ${esc(t.order)}. Билет действует для одного гостя.</p>
    </section>`;
    app.querySelector('.ticket')?.classList.add('printing');
  } catch (err) {
    app.innerHTML = `<section class="wrap page-head"><h1>Билет не найден</h1><p>${esc(err.message)}. Проверьте ссылку или попросите того, кто покупал, отправить её ещё раз.</p></section>`;
  }
  renderFooter();
}
main();
