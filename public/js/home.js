import { api, esc, fmt, money, ticketsWord, renderHeader, renderFooter, LOGO, VENUE, $ } from './common.js';
import { mountTableRequest } from './table-request.js';

renderHeader('afisha');
const app = $('#app');

function eventRow(e) {
  const pct = e.capacity ? Math.round(((e.capacity - e.ticketsLeft) / e.capacity) * 100) : 100;
  const low = e.ticketsLeft > 0 && e.ticketsLeft <= 12;
  const soldOut = e.ticketsLeft === 0 || e.status !== 'on_sale';
  return `<a class="stub event-row" href="/event?id=${e.id}">
    <div class="stub-date"><b>${fmt.day(e.starts_at)}</b><span>${fmt.month(e.starts_at)}, ${fmt.weekdayShort(e.starts_at)}</span></div>
    <div class="stub-body">
      <h3>${esc(e.title)}</h3>
      <div class="event-meta">${e.genre ? `<span class="genre">${esc(e.genre)}</span>` : ''}${e.lineup ? `<span>${esc(e.lineup)}</span>` : ''}<span>Начало в ${fmt.time(e.starts_at)}</span></div>
    </div>
    <div class="event-side">
      <span class="price">${soldOut ? 'Мест нет' : money(e.price)}</span>
      <span class="seats-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <span class="seats-left${low ? ' low' : ''}">${soldOut ? (e.status === 'on_sale' ? 'Билеты закончились' : 'Продажа закрыта') : `Осталось ${ticketsWord(e.ticketsLeft)}`}</span>
    </div>
  </a>`;
}

function heroStub(e) {
  if (!e) return '';
  return `<div class="stub" style="--cut:104px">
    <div class="stub-date"><b>${fmt.day(e.starts_at)}</b><span>${fmt.month(e.starts_at)}</span></div>
    <div class="stub-body">
      <span class="stub-kicker">${fmt.weekday(e.starts_at)}, ${fmt.time(e.starts_at)}</span>
      <h3>${esc(e.title)}</h3>
      ${e.lineup ? `<p>${esc(e.lineup)}</p>` : ''}
      <a class="btn" href="/event?id=${e.id}">Купить билет, ${money(e.price)}</a>
    </div>
  </div>`;
}

async function main() {
  app.innerHTML = `
  <section class="hero" id="afisha">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap">
      <div>
        <div class="hero-mark"><i class="corner tr"></i>${LOGO}<i class="corner bl"></i></div>
        <h1 class="hero-sub">Музыкальный бар и караоке в Хабаровске</h1>
        <p class="hero-lead">Билеты на концерты онлайн. Стол можно забронировать заявкой, администратор перезвонит.</p>
      </div>
      <div id="hero-stub"></div>
    </div>
  </section>

  <section class="section wrap" id="more" hidden>
    <div class="section-head"><h2>Афиша</h2></div>
    <div class="events" id="events"></div>
  </section>

  <section class="section wrap">
    <div class="section-head"><h2>Меню</h2></div>
    <a class="menu-card" href="/menu" style="--img:url('/img/kitchen.jpg')"><span class="brush">Кухня</span><p>Живые гребешки, тартары, роллы и баскский чизкейк.</p></a>
  </section>

  <section class="section wrap" id="table">
    <div class="section-head"><h2>Бронь стола</h2><p class="table-deposit">Депозит на стол от ${money(VENUE.tableDeposit)}</p><p>Депозит тратите на еду и напитки. Оставьте заявку, администратор перезвонит и подтвердит стол. На концерт каждому гостю нужен билет.</p></div>
    <div class="request-card home-request" id="request"></div>
  </section>`;

  try {
    const events = await api('/api/events');
    const hero = events.find((e) => e.status === 'on_sale' && e.ticketsLeft > 0);
    $('#hero-stub').innerHTML = heroStub(hero);
    // ближайшее событие уже в шапке, списком показываем только остальные
    const rest = events.filter((e) => e !== hero);
    if (rest.length || !hero) {
      $('#more h2').textContent = hero ? 'Ещё в афише' : 'Афиша';
      $('#events').innerHTML = rest.length ? rest.map(eventRow).join('') : '<p class="muted">Афиша на ближайшие дни пока пустая. Стол на обычный вечер можно забронировать заявкой ниже.</p>';
      $('#more').hidden = false;
    }
    mountTableRequest($('#request'), { events: events.filter((e) => e.status === 'on_sale') });
  } catch (err) {
    $('#events').innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    $('#more').hidden = false;
  }
  renderFooter();
}

main();
