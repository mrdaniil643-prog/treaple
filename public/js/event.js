import { api, esc, fmt, money, seatsWord, plural, renderHeader, renderFooter, toast, savedOrders, orderLink, $, $$ } from './common.js';
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
  blocked: '', // почему продажа недоступна — показываем при каждой перерисовке корзины
  map: null,
  // на телефоне схема открывается чуть приближенной: так столы крупнее пальца
  zoom: matchMedia('(max-width: 1000px)').matches ? 1.25 : 1,
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
    <div class="event-meta">${e.genre ? `<span class="genre">${esc(e.genre)}</span>` : ''}<span>${fmt.full(e.starts_at)}</span><span>Двери открываются в ${fmt.time(e.doors_at)}</span></div>
    <p class="desc">${esc(e.description)}</p>
    ${e.lineup ? `<p class="desc"><b>${esc(e.lineup)}</b></p>` : ''}
  </section>
  <section class="wrap booking">
    <div class="map-card">
      <div class="map-toolbar">
        <div class="hall-tabs" role="tablist" aria-label="Залы">
          ${halls.map((h) => `<button role="tab" data-hall="${h.id}" aria-selected="${h.id === state.hallId}">${esc(h.title)}</button>`).join('')}
        </div>
        <div class="zoom-ctl" role="group" aria-label="Масштаб схемы">
          <button type="button" data-zoom="-1" aria-label="Отдалить схему">−</button>
          <button type="button" data-zoom="1" aria-label="Приблизить схему">+</button>
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
  $$('.zoom-ctl button').forEach((b) => b.addEventListener('click', () => setZoom(state.zoom + Number(b.dataset.zoom) * 0.5)));
  mountCurrentHall();
  renderCart();
}

const wide = matchMedia('(min-width: 1000px)');

// На телефоне схему можно приблизить кнопками: столы становятся крупнее пальца.
function setZoom(z) {
  state.zoom = Math.min(2.5, Math.max(1, z));
  const hall = $('#hall');
  if (!hall) return;
  hall.style.width = `${state.zoom * 100}%`;
  $$('.zoom-ctl button').forEach((b) => { b.disabled = b.dataset.zoom === '1' ? state.zoom >= 2.5 : state.zoom <= 1; });
}

// Выбранный стол не должен прятаться под нижней шторкой.
function revealTable(id) {
  if (wide.matches) return;
  const g = state.map?.svg.querySelector(`[data-id="${id}"]`);
  const stage = $('.map-stage');
  if (!g || !stage) return;
  const r = g.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  if (stage.scrollWidth > stage.clientWidth) stage.scrollBy({ left: r.left - sr.left - sr.width / 2 + r.width / 2, behavior: 'smooth' });
  const headerH = $('.site-header')?.offsetHeight || 64;
  const want = headerH + 24;
  if (r.top < want || r.bottom > innerHeight * 0.45) window.scrollBy({ top: r.top - want, behavior: 'smooth' });
}
wide.addEventListener('change', () => state.map && mountCurrentHall());

function mountCurrentHall() {
  const hall = state.config.halls.find((h) => h.id === state.hallId);
  const [, , w, h] = hall.viewBox;
  state.map = mountHall($('#hall'), hall, { onPick: openTable, rotate: wide.matches && h > w * 1.3 });
  setZoom(wide.matches ? 1 : state.zoom);
  state.map.update(state.availability, state.selection, state.activeTable);
}

function switchHall(id) {
  state.hallId = id;
  state.activeTable = null;
  $('#pop').hidden = true;
  document.body.classList.remove('sheet-open');
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
      <p>Стол на ${t.seats}, свободно ${a.free}. Место стоит ${money(a.price)}${state.event.deposit ? `, из них ${money(state.event.deposit)} уйдут в депозит на еду и напитки` : ''}.</p>
      ${a.sold + a.held > 0 ? `<p class="muted">${a.sold + a.held} ${plural(a.sold + a.held, 'место уже занято', 'места уже заняты', 'мест уже занято')}, сядете с другими гостями.</p>` : ''}
      ${t.wholeOnly ? '<p class="muted">VIP-комнату с караоке берут только целиком.</p>' : `
      <div class="pop-row">
        <div class="stepper" role="group" aria-label="Количество мест">
          <button data-d="-1" aria-label="Меньше" ${whole || seats <= 1 ? 'disabled' : ''}>−</button>
          <output aria-live="polite">${count}</output>
          <button data-d="1" aria-label="Больше" ${whole || seats >= a.free ? 'disabled' : ''}>+</button>
        </div>
        ${a.wholeAvailable ? `<label class="check"><input type="checkbox" id="whole" ${whole ? 'checked' : ''}> Весь стол</label>` : ''}
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
  document.body.classList.add('sheet-open');
  revealTable(id);
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
  document.body.classList.remove('sheet-open');
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
  $('#cart').classList.toggle('is-empty', !seats);
  const items = [...state.selection].map(([id, s]) => {
    const t = tableById(id);
    const a = state.availability[id];
    return `<li><div><b>Стол ${t.n}</b><small>${esc(t.hall.title)}, ${s.whole ? `весь стол, ${seatsWord(s.seats)}` : seatsWord(s.seats)}</small></div>
      <span>${money(s.seats * a.price)}</span><button class="remove" data-remove="${id}" aria-label="Убрать стол ${t.n}">×</button></li>`;
  }).join('');
  cart.innerHTML = `
    <div class="pop-row"><h3>Ваш выбор</h3><span class="live-dot" id="live">Схема обновляется сама</span></div>
    ${items ? `<ul class="cart-list">${items}</ul>` : '<p class="cart-empty">Нажмите на стол на схеме. В один заказ можно взять несколько столов.</p>'}
    <div class="cart-total"><span>${seats ? `${seatsWord(seats)}` : 'Итого'}</span><b>${money(total)}</b></div>
    ${state.blocked ? `<p class="form-error">${esc(state.blocked)}</p>` : ''}
    <button class="btn block" id="go" ${seats && !state.blocked ? '' : 'disabled'}>Забронировать на ${state.config.holdMinutes} минут</button>
    <p class="cart-note">Места держатся за вами, пока вы оплачиваете. Каждый гость получит свой билет.</p>`;
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
  if ($('#live')) $('#live').textContent = on ? 'Схема обновляется сама' : 'Нет связи, переподключаемся…';
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
        toast(`Стол ${tableById(id).n} только что забрали другие гости. Выберите другой.`, { error: true });
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
      for (const c of err.data?.conflicts || []) state.selection.delete(c.tableId);
      try {
        state.availability = (await api(`/api/events/${eventId}/availability`)).tables;
      } catch { /* схема обновится из живого потока */ }
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
    <div class="dlg-head"><h2 id="checkout-title">Оформление</h2><span class="timer" id="timer-box" title="Столько времени места держатся за вами"><small>Места за вами</small> <b id="timer"></b></span></div>
    <form class="dlg-body" id="pay-form" novalidate>
      <div class="summary-lines">
        ${[...grouped].map(([k, n]) => `<div><span>${esc(k)}</span><span>${seatsWord(n)}</span></div>`).join('')}
        <div><b>К оплате</b><b>${money(o.total)}</b></div>
      </div>
      <label class="field"><span>Имя</span><input class="input" name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" required></label>
      <label class="field"><span>Телефон (по нему найдём заказ)</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="+7 900 000-00-00" required></label>
      <label class="field"><span>Почта для билетов (необязательно)</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" enterkeyhint="done"></label>
      ${o.tickets.length > 1 ? `<details class="guest-names"><summary>Подписать билеты именами гостей</summary>
        <div class="grid">${o.tickets.map((t, i) => `<label class="field"><span>Стол ${t.table}, место ${t.seat}</span><input class="input" data-guest="${t.code}" autocomplete="off" autocapitalize="words" placeholder="${i === 0 ? 'Вы' : `Гость ${i + 1}`}"></label>`).join('')}</div>
      </details>` : ''}
      <p class="form-error" id="pay-error"></p>
      <div class="dlg-actions">
        <button class="btn block" type="submit">Оплатить ${money(o.total)}</button>
        <button class="btn ghost block" type="button" id="release">Отменить бронь</button>
      </div>
      <p class="demo-note">Тестовый режим: деньги не списываются.</p>
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
      toast('10 минут прошло, бронь снята. Выберите столы заново.', { error: true, ms: 7000 });
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
    btn.disabled = true;
    btn.textContent = 'Проводим оплату…';
    $('#pay-error').textContent = '';
    try {
      const paid = await api(`/api/orders/${o.secret}/pay`, {
        method: 'POST', body: { name: form.name.value, phone: form.phone.value, email: form.email.value, guests },
      });
      savedOrders.add(paid);
      clearInterval(timerId);
      location.href = orderLink(paid.secret, '&new=1');
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
    if (event.status !== 'on_sale' || !config.paymentsEnabled) {
      state.blocked = !config.paymentsEnabled ? 'Онлайн-продажа пока закрыта. Стол можно забронировать по телефону.'
        : event.status === 'cancelled' ? 'Событие отменено.' : 'Продажа билетов закрыта.';
      renderCart();
    }
    if (event.status === 'on_sale') connectStream();
  } catch (err) {
    app.innerHTML = `<section class="wrap page-head"><h1>Не удалось открыть событие</h1><p>${esc(err.message)}</p><p><a href="/#afisha">Вернуться к афише</a></p></section>`;
  }
  renderFooter();
}

main();
