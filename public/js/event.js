import { api, esc, fmt, money, ticketsWord, renderHeader, renderFooter, toast, savedOrders, orderLink, VENUE, $, $$ } from './common.js';
import { mountTableRequest } from './table-request.js';

renderHeader('afisha');
const app = $('#app');
const eventId = Number(new URLSearchParams(location.search).get('id'));

const state = {
  config: null,
  event: null,
  availability: null,
  qty: 1,
  order: null,
  blocked: '', // почему продажа недоступна
};
const wide = matchMedia('(min-width: 900px)');

function render() {
  const e = state.event;
  app.innerHTML = `
  <section class="wrap event-hero${e.image ? ' has-poster' : ''}">
    <a class="back" href="/#afisha">← Вся афиша</a>
    <h1>${esc(e.title)}</h1>
    ${e.image ? `<img class="poster" src="${esc(e.image)}" alt="Афиша: ${esc(e.title)}" width="720" height="1280" decoding="async">` : ''}
    <div class="event-meta">${e.genre ? `<span class="genre">${esc(e.genre)}</span>` : ''}<span>${fmt.full(e.starts_at)}</span><span>Двери открываются в ${fmt.time(e.doors_at)}</span></div>
    ${e.description || e.lineup ? `<p class="desc">${esc(e.description || e.lineup)}</p>` : ''}
    <p class="desc muted">${esc(VENUE.address)}. ${esc(VENUE.entry)}.</p>
  </section>
  <section class="wrap buy-grid">
    <div class="buy-card" id="buy" aria-live="polite"></div>
    <div class="request-card">
      <h2>Бронь стола</h2>
      <p class="table-deposit">Депозит на стол ${money(VENUE.tableDeposit)}</p>
      <p class="muted">Депозит тратите на еду и напитки в этот вечер. Оставьте заявку, администратор перезвонит и подтвердит стол. Билет на вход нужен каждому гостю, его покупают отдельно.</p>
      <div id="request"></div>
    </div>
  </section>
  <div class="buy-bar" id="buy-bar" hidden><button class="btn block" type="button">Купить билет, ${money(e.price)}</button></div>
  <dialog id="checkout"></dialog>`;
  mountTableRequest($('#request'), { eventId: e.id });
  renderBuy();
  // на телефоне блок покупки ниже описания: пока его не видно, внизу экрана кнопка «Купить»
  const bar = $('#buy-bar');
  $('button', bar).addEventListener('click', () => $('#buy').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  new IntersectionObserver(([entry]) => {
    bar.hidden = wide.matches || state.blocked || !state.availability?.free || entry.isIntersecting || entry.boundingClientRect.top < 0;
  }).observe($('#buy'));
}

function renderBuy() {
  const box = $('#buy');
  if (!box) return;
  const e = state.event;
  const left = state.availability?.free ?? 0;
  const max = Math.min(state.config.maxTickets, left);
  state.qty = Math.max(1, Math.min(state.qty, max || 1));
  const closed = state.blocked || !left;
  box.innerHTML = `
    <span class="buy-kicker">Входной билет</span>
    <div class="buy-price">${money(e.price)}</div>
    ${closed ? `<p class="form-error">${esc(state.blocked || 'Билеты закончились')}</p>` : `
    <div class="buy-row">
      <div class="stepper big" role="group" aria-label="Количество билетов">
        <button type="button" data-d="-1" aria-label="Меньше" ${state.qty <= 1 ? 'disabled' : ''}>−</button>
        <output aria-live="polite">${state.qty}</output>
        <button type="button" data-d="1" aria-label="Больше" ${state.qty >= max ? 'disabled' : ''}>+</button>
      </div>
      <b class="buy-total">${money(e.price * state.qty)}</b>
    </div>
    <button class="btn block buy-go" id="go">Купить ${state.qty > 1 ? ticketsWord(state.qty) : 'билет'}</button>
    <p class="buy-left${left <= 12 ? ' low' : ''}">Осталось ${ticketsWord(left)}</p>`}
    <p class="buy-pay">Оплата картой или через СБП на странице ЮKassa, чек придёт на почту или по СМС. <a href="/prices">Цены и оплата</a></p>`;
  $$('[data-d]', box).forEach((b) => b.addEventListener('click', () => {
    state.qty += Number(b.dataset.d);
    renderBuy();
  }));
  $('#go')?.addEventListener('click', hold);
}

function connectStream() {
  const es = new EventSource(`/api/events/${eventId}/stream`);
  es.onmessage = (m) => {
    state.availability = JSON.parse(m.data);
    if (!state.order) renderBuy();
  };
}

async function hold() {
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Бронируем…';
  try {
    state.order = await api(`/api/events/${eventId}/hold`, { method: 'POST', body: { qty: state.qty } });
    openCheckout();
  } catch (err) {
    toast(err.message, { error: true, ms: 6000 });
    try {
      state.availability = await api(`/api/events/${eventId}/availability`);
    } catch { /* обновится из живого потока */ }
    renderBuy();
  }
}

let timerId;
function openCheckout() {
  const o = state.order;
  const dlg = $('#checkout');
  dlg.innerHTML = `
    <div class="dlg-head"><h2 id="checkout-title" tabindex="-1" autofocus>Оформление</h2><span class="timer" id="timer-box" title="Столько времени билеты держатся за вами"><small>Бронь</small> <b id="timer"></b></span></div>
    <form class="dlg-body" id="pay-form" novalidate>
      <div class="summary-lines">
        <div><span>Входной билет × ${o.tickets.length}</span><span>${money(o.total)}</span></div>
        <div><b>К оплате</b><b>${money(o.total)}</b></div>
      </div>
      <label class="field"><span>Имя</span><input class="input" name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" required></label>
      <label class="field"><span>Телефон (по нему найдём заказ)</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="+7 900 000-00-00" required></label>
      <label class="field"><span>Почта для билетов (необязательно)</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" enterkeyhint="done"></label>
      ${o.tickets.length > 1 ? `<details class="guest-names"><summary>Подписать билеты именами гостей</summary>
        <div class="grid">${o.tickets.map((t, i) => `<label class="field"><span>Билет ${i + 1}</span><input class="input" data-guest="${t.code}" autocomplete="off" autocapitalize="words" placeholder="${i === 0 ? 'Вы' : `Гость ${i + 1}`}"></label>`).join('')}</div>
      </details>` : ''}
      <label class="check consent"><input type="checkbox" name="consent" required> <span>Я даю <a href="/consent" target="_blank">согласие на обработку персональных данных</a></span></label>
      <p class="offer-note">Оплачивая заказ, вы принимаете условия <a href="/offer" target="_blank">оферты</a> и <a href="/refund" target="_blank">правила возврата</a>.</p>
      <p class="form-error" id="pay-error"></p>
      <div class="dlg-actions">
        <button class="btn block" type="submit">Оплатить ${money(o.total)}</button>
        <button class="btn ghost block" type="button" id="release">Отменить бронь</button>
      </div>
      <p class="demo-note">${state.config.paymentMode === 'yookassa' && !state.config.paymentTest ? 'Оплата картой или через СБП на странице ЮKassa. Чек придёт на почту или по СМС.' : 'Тестовый режим: деньги не списываются.'}</p>
    </form>`;
  dlg.setAttribute('aria-labelledby', 'checkout-title');
  dlg.showModal();
  // на телефоне не открываем клавиатуру сразу: сначала человек видит сумму и таймер
  if (wide.matches) dlg.querySelector('[name=name]').focus();
  // Esc не закрывает окно молча: иначе бронь осталась бы висеть. Закрывает только «Отменить бронь».
  dlg.oncancel = (ev) => ev.preventDefault();

  const expires = Date.now() + (o.expiresIn ?? 0) * 1000;
  clearInterval(timerId);
  const tick = () => {
    const left = Math.max(0, expires - Date.now());
    const m = Math.floor(left / 60e3), s = Math.floor((left % 60e3) / 1e3);
    const el = $('#timer');
    if (!el) return;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('#timer-box')?.classList.toggle('low', left < 60e3);
    if (left === 0) {
      clearInterval(timerId);
      closeCheckout();
      toast('10 минут прошло, бронь снята. Оформите билеты заново.', { error: true, ms: 7000 });
    }
  };
  tick();
  timerId = setInterval(tick, 1000);

  $('#release').addEventListener('click', async () => {
    await api(`/api/orders/${o.secret}/release`, { method: 'POST' }).catch(() => {});
    closeCheckout();
    toast('Бронь снята.');
  });

  $('#pay-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const btn = form.querySelector('[type=submit]');
    const guests = Object.fromEntries($$('[data-guest]', form).map((i) => [i.dataset.guest, i.value]));
    if (!form.consent.checked) {
      $('#pay-error').textContent = 'Отметьте согласие на обработку персональных данных';
      form.consent.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = state.config.paymentMode === 'yookassa' ? 'Переходим к оплате…' : 'Проводим оплату…';
    $('#pay-error').textContent = '';
    try {
      const r = await api(`/api/orders/${o.secret}/pay`, {
        method: 'POST', body: { name: form.name.value, phone: form.phone.value, email: form.email.value, guests, consent: form.consent.checked },
      });
      // ЮKassa: заказ запоминаем на телефоне и уходим на платёжную страницу, обратно она вернёт в «Мои билеты»
      const order = r.order || r;
      savedOrders.add(order);
      clearInterval(timerId);
      if (r.redirect) { location.href = r.redirect; return; }
      location.href = orderLink(order.secret, '&new=1');
    } catch (err) {
      $('#pay-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = `Оплатить ${money(o.total)}`;
      if (err.status === 410) setTimeout(closeCheckout, 2500);
    }
  });
}

function closeCheckout() {
  clearInterval(timerId);
  $('#checkout').close();
  state.order = null;
  renderBuy();
}

async function main() {
  if (!eventId) {
    app.innerHTML = '<section class="wrap page-head"><h1>Событие не выбрано</h1><p><a href="/#afisha">Открыть афишу</a></p></section>';
    return;
  }
  try {
    const [config, event, av] = await Promise.all([api('/api/config'), api(`/api/events/${eventId}`), api(`/api/events/${eventId}/availability`)]);
    Object.assign(state, { config, event, availability: av });
    document.title = `${event.title} — ${fmt.date(event.starts_at)}, билеты | Бар МТ, Хабаровск`;
    if (event.status !== 'on_sale' || !config.paymentsEnabled) {
      state.blocked = !config.paymentsEnabled ? 'Онлайн-продажа пока закрыта.'
        : event.status === 'cancelled' ? 'Событие отменено.' : 'Продажа билетов закрыта.';
    }
    render();
    if (event.status === 'on_sale') connectStream();
  } catch (err) {
    app.innerHTML = `<section class="wrap page-head"><h1>Не удалось открыть событие</h1><p>${esc(err.message)}</p><p><a href="/#afisha">Вернуться к афише</a></p></section>`;
  }
  renderFooter();
}

main();
