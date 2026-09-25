import { api, esc, fmt, renderHeader, renderFooter, toast, $ } from './common.js';
import { ticketCard } from './ticket-card.js';
import { startLiveTickets } from './live-qr.js';
import { downloadTicketsPdf } from './ticket-pdf.js';

renderHeader('tickets');
const app = $('#app');
const code = new URLSearchParams(location.search).get('t') || '';

async function main() {
  try {
    const t = await api(`/api/tickets/${encodeURIComponent(code)}`);
    document.title = `Билет: ${t.event.title} — МТ`;
    app.innerHTML = `<section class="wrap page-head" style="max-width:460px">
      <h1 style="font-size:32px">Ваш билет</h1>
      <p>Покажите этот экран на входе. Двери открываются в ${fmt.time(t.event.doorsAt)}.</p>
      <div class="ticket-grid" style="grid-template-columns:1fr">${ticketCard(t, t.event, { actions: false })}</div>
      <p class="cart-note" style="margin-top:16px">Билет на одного гостя. Скриншот не подойдёт: QR меняется каждые 30 секунд. Для печати скачайте PDF: в нём постоянный QR, он пускает один раз.</p>
      ${t.status === 'active' ? '<button class="btn ghost small" id="pdf" style="margin-top:12px">Скачать PDF</button>' : ''}
    </section>`;
    $('#pdf')?.addEventListener('click', async ({ currentTarget: btn }) => {
      btn.disabled = true;
      try { await downloadTicketsPdf([t], t.event); } catch (err) { toast(err.message, { error: true }); }
      btn.disabled = false;
    });
    app.querySelector('.ticket')?.classList.add('printing');
    startLiveTickets(app);
  } catch (err) {
    app.innerHTML = `<section class="wrap page-head"><h1>Билет не найден</h1><p>${esc(err.message)}. Проверьте ссылку или попросите того, кто покупал, прислать её ещё раз.</p></section>`;
  }
  renderFooter();
}
main();
