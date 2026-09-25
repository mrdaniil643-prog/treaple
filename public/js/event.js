import { api, esc, fmt, money, seatsWord, plural, renderHeader, renderFooter, toast, savedOrders, $, $$ } from './common.js';
import { mountHall } from './hallmap.js';

renderHeader('afisha');
const app = $('#app');
const eventId = Number(new URLSearchParams(location.search).get('id'));

const state = {
  config: null,
  event: null,
  availability: {},
  selection: new Map(), // tableId -> { seats, whole }
  hallId: null,
  activeTable: null,
  order: null,
  holding: false,
  map: null,
};

const tableById = (id) => {
  for (const h of state.config.halls) {
    const t = h.tables.find((x) => x.id === id);
    if (t) return { ...t, hall: h };
  }
  return null;
};

function render() {
  const e = state.event;
  const halls = state.config.halls.filter((h) => e.halls.includes(h.id));
  app.innerHTML = `
  <section class="wrap event-hero">
    <a class="back" href="/#afisha">← Вся афиша</a>
    <h1>${esc(e.title)}</h1>
    <div class="event-meta"><span class="genre">${esc(e.genre)}</span><span>${fmt.full(e.starts_at)}</span><span>Двери открываются в ${fmt.time(e.doors_at)}</span></div>
    <p class="desc">${esc(e.description)}</p>
    ${e.lineup ? `<p class="desc"><b>${esc(e.lineup)}</b></p>` : ''}
  </section>
  <section class="wrap booking">
    <div class="map-card">
      <div class="map-toolbar">
        <div class="hall-tabs" role="tablist" aria-label="Залы">
          ${halls.map((h) => `<button role="tab" data-hall="${h.id}" aria-selected="${h.id === state.hallId}">${esc(h.title)}</button>`).join('')}
        </div>
        <div class="legend" aria-hidden="true">
          <span><i class="l-free"></i>Свободен</span><span><i class="l-partial"></i>Есть места</span>
          <span><i class="l-full"></i>Занят</span><span><i class="l-sel"></i>Ваш выбор</span>
        </div>
      </div>
      <div class="map-stage"><div id="hall" style="width:100%"></div></div>
    </div>
    <aside class="cart" id="cart">
      <div class="table-pop" id="pop" hidden></div>
      <div class="cart-body" id="cart-body" aria-live="polite"></div>
    </aside>
  </section>
  <dialog id="checkout"></dialog>`;

  $$('.hall-tabs button').forEach((b) => b.addEventListener('click', () => switchHall(b.dataset.hall)));
  mountCurrentHall();
  renderCart();
}

const wide = matchMedia('(min-width: 1000px)');
wide.addEventListener('change', () => state.map && mountCurrentHall());

function mountCurrentHall() {
  const hall = state.config.halls.find((h) => h.id === state.hallId);
  const [, , w, h] = hall.viewBox;
  state.map = mountHall($('#hall'), hall, { onPick: openTable, rotate: wide.matches && h > w * 1.3 });
  state.map.update(state.availability, state.selection, state.activeTable);
}

function switchHall(id) {
  state.hallId = id;
  state.activeTable = null;
  $('#pop').hidden = true;
  $$('.hall-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.hall === id)));
  mountCurrentHall();
}

function refreshMap() {
  state.map?.update(state.availability, state.selection, state.activeTable);
}

function openTable(id) {
  const t = tableById(id);
  const a = state.availability[id];
  if (!t || !a) return;
  const current = state.selection.get(id);
  if (a.free === 0 && !current) {
    toast(`Стол ${t.n} уже занят. Выберите другой.`);
    return;
  }
  state.activeTable = id;
  let seats = current?.seats || Math.min(2, a.free);
  let whole = current?.whole || Boolean(t.wholeOnly);
  const zone = state.config.zones[t.zone];
  const pop = $('#pop');

  const draw = () => {
    const count = whole ? t.seats : seats;
    pop.innerHTML = `
      <header>
        <div><h3>Стол ${t.n}</h3><p class="muted">${esc(t.hall.title)}${t.zone !== 'standard' ? `, зона «${esc(zone.title)}»` : ''}</p></div>
        <button class="close" aria-label="Закрыть">×</button>
      </header>
      <p>${seatsWord(t.seats)} за столом, свободно ${a.free}. ${money(a.price)} за место${state.event.deposit ? `, из них ${money(state.event.deposit)} — депозит на меню` : ''}.</p>
      ${a.sold + a.held > 0 ? `<p class="muted">За этим столом уже будут другие гости: ${a.sold + a.held} ${plural(a.sold + a.held, 'место занято', 'места заняты', 'мест занято')}.</p>` : ''}
      ${t.wholeOnly ? '<p class="muted">VIP-комната с караоке бронируется только целиком.</p>' : `
      <div class="pop-row">
        <div class="stepper" role="group" aria-label="Количество мест">
          <button data-d="-1" aria-label="Меньше" ${whole || seats <= 1 ? 'disabled' : ''}>−</button>
          <output aria-live="polite">${count}</output>
          <button data-d="1" aria-label="Больше" ${whole || seats >= a.free ? 'disabled' : ''}>+</button>
        </div>
        ${a.wholeAvailable ? `<label class="check"><input type="checkbox" id="whole" ${whole ? 'checked' : ''}> Весь стол, без соседей</label>` : ''}
      </div>`}
      <div class="pop-row">
        <b style="font:700 22px var(--f-display);color:var(--cream)">${money(a.price * count)}</b>
        <div style="display:flex;gap:8px">
          ${current ? '<button class="btn ghost small" data-act="remove">Убрать</button>' : ''}
          <button class="btn small" data-act="add">${current ? 'Сохранить' : `Добавить ${seatsWord(count)}`}</button>
        </div>
      </div>`;
    // подсветить выбираемые места на схеме ещё до добавления
    const preview = new Map(state.selection);
    preview.set(id, { seats: count, whole });
    state.map.update(state.availability, preview, id);
  };
  draw();
  pop.hidden = false;
  pop.onclick = (ev) => {
    const d = ev.target.closest('[data-d]')?.dataset.d;
    if (d) { seats = Math.max(1, Math.min(a.free, seats + Number(d))); draw(); return; }
    if (ev.target.id === 'whole') { whole = ev.target.checked; draw(); return; }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (ev.target.closest('.close')) closePop();
    if (act === 'add') {
      state.selection.set(id, { seats: whole ? t.seats : seats, whole });
      closePop();
      renderCart(true);
    }
    if (act === 'remove') {
      state.selection.delete(id);
      closePop();
      renderCart();
    }
  };
  pop.querySelector('.btn:not(.ghost)')?.focus({ preventScroll: true });
}

function closePop() {
  const last = state.activeTable;
  state.activeTable = null;
  $('#pop').hidden = true;
  refreshMap();
  if (last) state.map.svg.querySelector(`[data-id="${last}"]`)?.focus({ preventScroll: true });
}

function cartTotals() {
  let seats = 0, total = 0;
  for (const [id, s] of state.selection) {
    seats += s.seats;
    total += s.seats * (state.availability[id]?.price || 0);
  }
  return { seats, total };
}

function renderCart(bump = false) {
  const cart = $('#cart-body');
  const { seats, total } = cartTotals();
  const items = [...state.selection].map(([id, s]) => {
    const t = tableById(id);
    const a = state.availability[id];
    return `<li><div><b>Стол ${t.n}</b><small>${esc(t.hall.title)}, ${s.whole ? `весь стол, ${seatsWord(s.seats)}` : seatsWord(s.seats)}</small></div>
      <span>${money(s.seats * a.price)}</span><button class="remove" data-remove="${id}" aria-label="Убрать стол ${t.n}">×</button></li>`;
  }).join('');
  cart.innerHTML = `
    <div class="pop-row"><h3>Ваш выбор</h3><span class="live-dot" id="live">Схема обновляется вживую</span></div>
    ${items ? `<ul class="cart-list">${items}</ul>` : '<p class="cart-empty">Нажмите на стол на схеме, чтобы выбрать места. Можно выбрать несколько столов в одном заказе.</p>'}
    <div class="cart-total"><span>${seats ? `${seatsWord(seats)}` : 'Итого'}</span><b>${money(total)}</b></div>
    <button class="btn block" id="go" ${seats ? '' : 'disabled'}>Забронировать на ${state.config.holdMinutes} минут</button>
    <p class="cart-note">После брони места закрепляются за вами, пока вы оплачиваете. Каждый гость получит свой билет с QR-кодом.</p>`;
  cart.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    state.selection.delete(b.dataset.remove);
    renderCart();
  }));
  $('#go').addEventListener('click', hold);
  if (bump) $('#cart').animate([{ transform: 'scale(1.02)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  refreshMap();
  setLive(liveOn);
}

let liveOn = false;
function setLive(on) {
  liveOn = on;
  $('#live')?.classList.toggle('off', !on);
  if ($('#live')) $('#live').textContent = on ? 'Схема обновляется вживую' : 'Переподключаемся…';
}

function applyAvailability(av) {
  state.availability = av.tables;
  // если кто-то занял места, которые мы выбрали, но ещё не забронировали — поправляем корзину
  let changed = false;
  if (!state.order && !state.holding) {
    for (const [id, s] of state.selection) {
      const a = av.tables[id];
      if (!a || (s.whole ? !a.wholeAvailable : a.free < s.seats)) {
        state.selection.delete(id);
        changed = true;
        toast(`Места за столом ${tableById(id).n} только что заняли — мы убрали его из выбора.`, { error: true });
      }
    }
  }
  if (changed) renderCart();
  else refreshMap();
}

function connectStream() {
  const es = new EventSource(`/api/events/${eventId}/stream`);
  es.onmessage = (m) => { setLive(true); applyAvailability(JSON.parse(m.data)); };
  es.onerror = () => setLive(false);
}

async function hold() {
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Бронируем…';
  state.holding = true;
  try {
    const items = [...state.selection].map(([tableId, s]) => ({ tableId, seats: s.seats, whole: s.whole }));
    state.order = await api(`/api/events/${eventId}/hold`, { method: 'POST', body: { items } });
    openCheckout();
  } catch (err) {
    toast(err.message, { error: true, ms: 6000 });
    if (err.status === 409) {
      const av = await api(`/api/events/${eventId}/availability`);
      state.availability = av.tables;
      for (const c of err.data?.conflicts || []) state.selection.delete(c.tableId);
    }
    renderCart();
  } finally {
    state.holding = false;
  }
}

let timerId;
function openCheckout() {
  const o = state.order;
  const dlg = $('#checkout');
  const grouped = new Map();
  for (const t of o.tickets) {
    const key = `${t.hall}, стол ${t.table}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  dlg.innerHTML = `
    <div class="dlg-head"><h2>Оформление</h2><span class="timer" id="timer"></span></div>
    <form class="dlg-body" id="pay-form" novalidate>
      <div class="summary-lines">
        ${[...grouped].map(([k, n]) => `<div><span>${esc(k)}</span><span>${seatsWord(n)}</span></div>`).join('')}
        <div><b>К оплате</b><b>${money(o.total)}</b></div>
      </div>
      <label class="field"><span>Имя</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Телефон — по нему найдём заказ</span><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="+7 900 000-00-00" required></label>
      <label class="field"><span>Почта для билетов (необязательно)</span><input class="input" name="email" type="email" autocomplete="email"></label>
      ${o.tickets.length > 1 ? `<details class="guest-names"><summary>Подписать билеты именами гостей</summary>
        <div class="grid">${o.tickets.map((t, i) => `<label class="field"><span>Стол ${t.table}, место ${t.seat}</span><input class="input" data-guest="${t.code}" placeholder="${i === 0 ? 'Вы' : `Гость ${i + 1}`}"></label>`).join('')}</div>
      </details>` : ''}
      <p class="form-error" id="pay-error"></p>
      <button class="btn block" type="submit">Оплатить ${money(o.total)}</button>
      <button class="btn ghost block" type="button" id="release">Отменить бронь</button>
      <p class="demo-note">Демо-режим: оплата подтверждается сразу, деньги не списываются. Для приёма платежей подключается эквайринг (ЮKassa, CloudPayments и т. п.).</p>
    </form>`;
  dlg.showModal();
  dlg.querySelector('[name=name]').focus();
  dlg.addEventListener('cancel', (ev) => ev.preventDefault(), { once: true });

  const expires = new Date(o.expiresAt).getTime();
  clearInterval(timerId);
  const tick = () => {
    const left = Math.max(0, expires - Date.now());
    const m = Math.floor(left / 60e3), s = Math.floor((left % 60e3) / 1e3);
    const el = $('#timer');
    if (!el) return;
    el.textContent = `Места ваши ещё ${m}:${String(s).padStart(2, '0')}`;
    el.classList.toggle('low', left < 60e3);
    if (left === 0) {
      clearInterval(timerId);
      closeCheckout();
      toast('Время брони вышло, места снова доступны другим гостям. Выберите столы заново.', { error: true, ms: 7000 });
    }
  };
  tick();
  timerId = setInterval(tick, 1000);

  $('#release').addEventListener('click', async () => {
    await api(`/api/orders/${o.secret}/release`, { method: 'POST' }).catch(() => {});
    closeCheckout();
    toast('Бронь снята, места снова свободны.');
  });

  $('#pay-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const btn = form.querySelector('[type=submit]');
    const guests = Object.fromEntries($$('[data-guest]', form).map((i) => [i.dataset.guest, i.value]));
    btn.disabled = true;
    btn.textContent = 'Проводим оплату…';
    $('#pay-error').textContent = '';
    try {
      const paid = await api(`/api/orders/${o.secret}/pay`, {
        method: 'POST', body: { name: form.name.value, phone: form.phone.value, email: form.email.value, guests },
      });
      savedOrders.add(paid);
      clearInterval(timerId);
      location.href = `/tickets?order=${encodeURIComponent(paid.secret)}&new=1`;
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
  state.selection.clear();
  renderCart();
}

async function main() {
  if (!eventId) {
    app.innerHTML = '<section class="wrap page-head"><h1>Событие не выбрано</h1><p><a href="/#afisha">Открыть афишу</a></p></section>';
    return;
  }
  try {
    const [config, event, av] = await Promise.all([api('/api/config'), api(`/api/events/${eventId}`), api(`/api/events/${eventId}/availability`)]);
    Object.assign(state, { config, event, availability: av.tables, hallId: event.halls[0] });
    document.title = `${event.title} — выбор стола — МТ`;
    render();
    if (event.status !== 'on_sale') {
      $('#go').disabled = true;
      $('#cart-body').insertAdjacentHTML('afterbegin', `<p class="form-error">${event.status === 'cancelled' ? 'Событие отменено.' : 'Продажа билетов закрыта.'}</p>`);
    } else connectStream();
  } catch (err) {
    app.innerHTML = `<section class="wrap page-head"><h1>Не удалось открыть событие</h1><p>${esc(err.message)}</p><p><a href="/#afisha">Вернуться к афише</a></p></section>`;
  }
  renderFooter();
}

main();
