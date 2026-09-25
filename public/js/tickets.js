import { api, esc, fmt, money, seatsWord, renderHeader, renderFooter, toast, savedOrders, ticketUrl, STATUS_TEXT, $ } from './common.js';
import { ticketCard } from './ticket-card.js';

renderHeader('tickets');
const app = $('#app');
const params = new URLSearchParams(location.search);

function renderOrder(o, { fresh = false } = {}) {
  const box = $('#order');
  const active = o.tickets.filter((t) => t.status === 'active').length;
  box.innerHTML = `<section class="order">
    <div class="order-head">
      <div>
        <p class="muted">Заказ ${esc(o.code)}, ${seatsWord(o.tickets.length)}, ${money(o.total)}</p>
        <h2>${esc(o.event.title)}</h2>
        <p class="muted">${fmt.full(o.event.startsAt)}, двери в ${fmt.time(o.event.doorsAt)}</p>
      </div>
      <span class="status ${o.status}">${STATUS_TEXT[o.status]}</span>
    </div>
    ${fresh ? `<p style="margin-top:18px">Готово! Билеты ниже. Покажите QR-код на входе или отправьте каждому гостю его билет ссылкой. Номер заказа <b>${esc(o.code)}</b> и телефон помогут найти билеты с любого устройства.</p>` : ''}
    <div class="ticket-grid">${o.tickets.map((t) => ticketCard(t, o.event)).join('')}</div>
    <div class="row" style="margin-top:24px">
      ${active ? '<button class="btn ghost small" id="share-all">Скопировать ссылки на все билеты</button>' : ''}
      ${o.canCancel ? '<button class="btn ghost small" id="cancel">Вернуть билеты</button>' : ''}
    </div>
    ${o.status === 'paid' && !o.canCancel ? '<p class="cart-note" style="margin-top:12px">Вернуть билеты онлайн можно не позднее чем за сутки до начала. Позже — через администратора.</p>' : ''}
  </section>`;
  if (fresh) box.querySelectorAll('.ticket').forEach((el) => el.classList.add('printing'));

  box.onclick = async (ev) => {
    const share = ev.target.closest('[data-share]')?.dataset.share;
    const rename = ev.target.closest('[data-rename]')?.dataset.rename;
    if (share) {
      const t = o.tickets.find((x) => x.code === share);
      const url = ticketUrl(share);
      const text = `Твой билет в МТ: ${o.event.title}, ${fmt.full(o.event.startsAt)}, стол ${t.table}`;
      if (navigator.share) navigator.share({ title: 'Билет в МТ', text, url }).catch(() => {});
      else { await navigator.clipboard?.writeText(`${text}\n${url}`); toast('Ссылка на билет скопирована'); }
    }
    if (rename) {
      const name = prompt('Имя гостя на билете');
      if (name === null) return;
      try {
        const updated = await api(`/api/orders/${o.secret}/guest`, { method: 'POST', body: { ticket: rename, name } });
        renderOrder(updated);
        toast('Имя на билете изменено');
      } catch (err) { toast(err.message, { error: true }); }
    }
    if (ev.target.id === 'share-all') {
      const lines = o.tickets.filter((t) => t.status === 'active').map((t) => `Стол ${t.table}, место ${t.seat} (${t.guestName}): ${ticketUrl(t.code)}`);
      await navigator.clipboard?.writeText(`${o.event.title}, ${fmt.full(o.event.startsAt)}\n${lines.join('\n')}`);
      toast('Ссылки на все билеты скопированы');
    }
    if (ev.target.id === 'cancel') {
      if (!confirm(`Вернуть все билеты заказа ${o.code}? Места освободятся, деньги вернутся на карту.`)) return;
      try {
        const updated = await api(`/api/orders/${o.secret}/cancel`, { method: 'POST' });
        renderOrder(updated);
        toast('Возврат оформлен, места освобождены');
      } catch (err) { toast(err.message, { error: true }); }
    }
  };
}

function renderSaved() {
  const list = savedOrders.list();
  $('#saved').innerHTML = list.length ? `<h3 style="margin-top:36px;color:var(--cream)">Заказы с этого устройства</h3>
    <div class="saved-orders">${list.map((o) => `<a href="/tickets?order=${encodeURIComponent(o.secret)}">
      <span><b>${esc(o.title)}</b><br><span class="muted">${fmt.full(o.startsAt)}</span></span>
      <span class="muted">${esc(o.code)}, ${seatsWord(o.count)}</span></a>`).join('')}</div>` : '';
}

async function main() {
  app.innerHTML = `<section class="wrap page-head">
    <h1>Мои билеты</h1>
    <p>Билеты, купленные на этом устройстве, видны сразу. Чтобы найти другие, введите номер заказа и телефон, указанный при покупке.</p>
    <form class="lookup" id="lookup" style="margin-top:24px">
      <label class="field"><span>Номер заказа</span><input class="input" name="code" placeholder="MT-XXXXXX" required></label>
      <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" placeholder="+7 900 000-00-00" required></label>
      <button class="btn" type="submit">Найти билеты</button>
    </form>
    <p class="form-error" id="lookup-error"></p>
    <div id="order"></div>
    <div id="saved"></div>
  </section>`;

  $('#lookup').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    $('#lookup-error').textContent = '';
    try {
      const o = await api(`/api/orders/lookup?code=${encodeURIComponent(f.code.value)}&phone=${encodeURIComponent(f.phone.value)}`);
      savedOrders.add(o);
      history.replaceState(null, '', `/tickets?order=${encodeURIComponent(o.secret)}`);
      renderOrder(o);
      renderSaved();
    } catch (err) { $('#lookup-error').textContent = err.message; }
  });

  const secret = params.get('order');
  if (secret) {
    try {
      const o = await api(`/api/orders/${encodeURIComponent(secret)}`);
      if (o.status === 'paid') savedOrders.add(o);
      renderOrder(o, { fresh: params.has('new') });
      if (params.has('new')) history.replaceState(null, '', `/tickets?order=${encodeURIComponent(secret)}`);
    } catch (err) { $('#lookup-error').textContent = err.message; }
  }
  renderSaved();
  renderFooter();
}

main();
