import { api, esc, fmt, money, ticketsWord, renderHeader, renderFooter, toast, copyText, savedOrders, ticketUrl, orderLink, STATUS_TEXT, $ } from './common.js';
import { ticketCard } from './ticket-card.js';
import { startLiveTickets } from './live-qr.js';
import { downloadTicketsPdf } from './ticket-pdf.js';

let stopLive = () => {};

renderHeader('tickets');
const app = $('#app');
// Старые ссылки вида ?order= переносим во фрагмент и убираем из адресной строки.
const params = new URLSearchParams(location.hash.slice(1) || location.search);

// Что с заявкой на возврат: ждёт администратора, отказ или ничего
function refundNote(o) {
  const r = o.refundRequest;
  if (o.status !== 'paid' || !r) return '';
  if (r.status === 'pending') return `<p class="refund-state">Заявка на возврат отправлена ${fmt.date(r.at)} в ${fmt.time(r.at)}. Администратор рассмотрит её и вернёт деньги на карту или счёт, с которых вы платили. Пока билеты действуют.</p>`;
  if (r.status === 'declined') return `<p class="refund-state declined">В возврате отказано${r.note ? `: ${esc(r.note)}` : ''}. Билеты действуют. Вопросы — по телефону администратора.</p>`;
  return '';
}

function renderOrder(o, { fresh = false } = {}) {
  const box = $('#order');
  const active = o.tickets.filter((t) => t.status === 'active').length;
  box.innerHTML = `<section class="order">
    <div class="order-head">
      <div>
        <p class="muted">Заказ ${esc(o.code)}, ${ticketsWord(o.tickets.length)}, ${money(o.total)}</p>
        <h2>${esc(o.event.title)}</h2>
        <p class="muted">${fmt.full(o.event.startsAt)}, двери в ${fmt.time(o.event.doorsAt)}</p>
      </div>
      <span class="status ${o.status}">${STATUS_TEXT[o.status]}</span>
    </div>
    ${fresh ? `<p style="margin-top:18px">Оплата прошла. Друзьям отправьте их билеты кнопкой «Отправить гостю». Запишите номер заказа <b>${esc(o.code)}</b>: по нему и телефону билеты найдутся на любом устройстве.</p>` : ''}
    <div class="ticket-grid">${o.tickets.map((t) => ticketCard(t, o.event)).join('')}</div>
    <div class="row" style="margin-top:24px">
      ${active > 1 ? '<button class="btn ghost small" id="pdf-all">Скачать все билеты в PDF</button>' : ''}
      ${active ? '<button class="btn ghost small" id="share-all">Скопировать ссылки на все билеты</button>' : ''}
      ${o.canRequestRefund ? '<button class="btn ghost small" id="refund-ask">Вернуть билеты</button>' : ''}
    </div>
    <div id="refund-box">${refundNote(o)}</div>
  </section>`;
  if (fresh) box.querySelectorAll('.ticket').forEach((el) => el.classList.add('printing'));
  stopLive();
  stopLive = startLiveTickets(box);

  box.onclick = async (ev) => {
    const share = ev.target.closest('[data-share]')?.dataset.share;
    const rename = ev.target.closest('[data-rename]')?.dataset.rename;
    const pdf = ev.target.closest('[data-pdf]')?.dataset.pdf;
    if (pdf || ev.target.id === 'pdf-all') {
      const btn = ev.target.closest('button');
      btn.disabled = true;
      try {
        await downloadTicketsPdf(pdf ? o.tickets.filter((t) => t.code === pdf) : o.tickets, o.event);
      } catch (err) { toast(err.message, { error: true }); }
      btn.disabled = false;
      return;
    }
    if (share) {
      const url = ticketUrl(share);
      const text = `Твой билет в МТ: ${o.event.title}, ${fmt.full(o.event.startsAt)}`;
      if (navigator.share) navigator.share({ title: 'Билет в МТ', text, url }).catch(() => {});
      else if (await copyText(`${text}\n${url}`)) toast('Ссылка на билет скопирована');
      else toast(`Не удалось скопировать. Ссылка: ${url}`, { ms: 12000 });
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
      const lines = o.tickets.filter((t) => t.status === 'active').map((t) => `${t.guestName}: ${ticketUrl(t.code)}`);
      if (await copyText(`${o.event.title}, ${fmt.full(o.event.startsAt)}\n${lines.join('\n')}`)) toast('Ссылки на все билеты скопированы');
      else toast('Не удалось скопировать. Отправьте билеты по одному кнопкой «Отправить гостю».', { error: true });
    }
    if (ev.target.id === 'refund-ask') {
      ev.target.hidden = true;
      $('#refund-box').innerHTML = `<form class="refund-form" id="refund-form">
        <h3>Заявка на возврат</h3>
        <p class="muted">Администратор рассмотрит заявку и вернёт деньги на карту или счёт, с которых вы платили. Пока заявку не одобрили, билеты действуют. Условия — на странице <a href="/refund">«Возврат билетов»</a>.</p>
        <label class="field"><span>Причина (необязательно)</span><textarea class="input" name="reason" maxlength="500" rows="2"></textarea></label>
        <div class="row"><button class="btn small" type="submit">Отправить заявку</button><button class="btn ghost small" type="button" id="refund-cancel">Не нужно</button></div>
      </form>`;
    }
    if (ev.target.id === 'refund-cancel') renderOrder(o);
    if (ev.target.closest('#refund-form') && ev.target.type === 'submit') {
      ev.preventDefault();
      ev.target.disabled = true;
      try {
        const updated = await api(`/api/orders/${o.secret}/refund-request`, { method: 'POST', body: { reason: $('#refund-form').reason.value } });
        renderOrder(updated);
        toast('Заявка на возврат отправлена');
      } catch (err) {
        ev.target.disabled = false;
        toast(err.message, { error: true });
      }
    }
  };
}

// ЮKassa присылает подтверждение на сервер за секунды; ждём его до 5 минут
async function waitForPayment(secret) {
  const box = $('#order');
  box.innerHTML = `<section class="order"><h2>Проверяем оплату…</h2>
    <p class="muted" style="margin-top:8px">Обычно это несколько секунд. Не закрывайте страницу: билеты появятся здесь.</p></section>`;
  const until = Date.now() + 5 * 60e3;
  while (Date.now() < until) {
    let o;
    try { o = await api(`/api/orders/${encodeURIComponent(secret)}`); } catch { o = null; }
    if (o?.status === 'paid') {
      savedOrders.add(o);
      renderOrder(o, { fresh: true });
      renderSaved();
      return;
    }
    if (o && !o.paymentPending) {
      const text = o.status === 'refunded'
        ? 'Билеты не выданы: пока шла оплата, их раскупили или событие отменили. Деньги возвращены на карту, чек возврата придёт на почту или по СМС.'
        : 'Оплата не прошла, деньги не списаны. Попробуйте купить билеты ещё раз.';
      box.innerHTML = `<section class="order"><h2>${o.status === 'refunded' ? 'Деньги возвращены' : 'Оплата не прошла'}</h2><p style="margin-top:8px">${text}</p>
        <a class="btn" style="margin-top:16px" href="/event?id=${o.event.id}">Купить билеты</a></section>`;
      return;
    }
    await new Promise((r) => { setTimeout(r, 2000); });
  }
  box.innerHTML = `<section class="order"><h2>Оплата ещё не подтверждена</h2>
    <p style="margin-top:8px">Если деньги списались, билеты появятся здесь сами в течение нескольких минут. Можно обновить страницу позже.</p></section>`;
}

function renderSaved() {
  const list = savedOrders.list();
  $('#saved').innerHTML = list.length ? `<h3 style="margin-top:36px;color:var(--cream)">Заказы с этого устройства</h3>
    <div class="saved-orders">${list.map((o) => `<a href="${orderLink(o.secret)}">
      <span><b>${esc(o.title)}</b><br><span class="muted">${fmt.full(o.startsAt)}</span></span>
      <span class="muted">${esc(o.code)}, ${ticketsWord(o.count)}</span></a>`).join('')}</div>` : '';
}

async function main() {
  app.innerHTML = `<section class="wrap page-head">
    <h1>Мои билеты</h1>
    <p>Здесь билеты, купленные с этого телефона. Если покупали с другого устройства, введите номер заказа и телефон.</p>
    <form class="lookup" id="lookup" style="margin-top:24px">
      <label class="field"><span>Номер заказа</span><input class="input" name="code" placeholder="MT-XXXXXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" required></label>
      <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="search" placeholder="+7 900 000-00-00" required></label>
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
      history.replaceState(null, '', orderLink(o.secret));
      renderOrder(o);
      renderSaved();
    } catch (err) { $('#lookup-error').textContent = err.message; }
  });

  // С платёжной страницы ЮKassa возвращаемся с номером заказа (#return=MT-…), секрет заказа знает только этот телефон
  const back = params.get('return');
  const secret = params.get('order') || (back && savedOrders.list().find((x) => x.code === back)?.secret);
  if (back && !secret) {
    $('#lookup-error').textContent = `Оплату заказа ${back} проверим по номеру и телефону: введите их выше.`;
  } else if (secret) {
    try {
      const o = await api(`/api/orders/${encodeURIComponent(secret)}`);
      history.replaceState(null, '', orderLink(secret));
      if (o.paymentPending || (back && o.status !== 'paid')) waitForPayment(secret);
      else {
        if (o.status === 'paid') savedOrders.add(o);
        renderOrder(o, { fresh: params.has('new') || Boolean(back) });
      }
    } catch (err) { $('#lookup-error').textContent = err.message; }
  }
  renderSaved();
  renderFooter();
}

window.addEventListener('hashchange', () => location.reload());
main();
