import { api, esc, fmt, money, plural, renderHeader, renderFooter, LOGO, $ } from './common.js';

renderHeader('afisha');
const app = $('#app');

function eventRow(e) {
  const pct = e.seatsTotal ? Math.round(((e.seatsTotal - e.seatsFree) / e.seatsTotal) * 100) : 100;
  const low = e.seatsFree > 0 && e.seatsFree <= 12;
  const soldOut = e.seatsFree === 0 || e.status !== 'on_sale';
  return `<a class="stub event-row" href="/event?id=${e.id}">
    <div class="stub-date"><b>${fmt.day(e.starts_at)}</b><span>${fmt.month(e.starts_at)}, ${fmt.weekdayShort(e.starts_at)}</span></div>
    <div class="stub-body">
      <h3>${esc(e.title)}</h3>
      <div class="event-meta">${e.genre ? `<span class="genre">${esc(e.genre)}</span>` : ''}${e.lineup ? `<span>${esc(e.lineup)}</span>` : ''}<span>Начало в ${fmt.time(e.starts_at)}</span></div>
    </div>
    <div class="event-side">
      <span class="price">${soldOut ? 'Мест нет' : `от ${money(e.minPrice)}`}</span>
      <span class="seats-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <span class="seats-left${low ? ' low' : ''}">${soldOut ? (e.status === 'on_sale' ? 'Все столы заняты' : 'Продажа закрыта') : `Осталось ${e.seatsFree} ${plural(e.seatsFree, 'место', 'места', 'мест')}`}</span>
    </div>
  </a>`;
}

function heroStub(e) {
  if (!e) return '';
  return `<div class="stub" style="--cut:104px">
    <div class="stub-date"><b>${fmt.day(e.starts_at)}</b><span>${fmt.month(e.starts_at)}</span></div>
    <div class="stub-body">
      <span class="stub-kicker">Ближайшее событие, ${fmt.weekday(e.starts_at)} в ${fmt.time(e.starts_at)}</span>
      <h3>${esc(e.title)}</h3>
      <p>${esc(e.lineup)}</p>
      <a class="btn" href="/event?id=${e.id}">Выбрать стол</a>
    </div>
  </div>`;
}

async function main() {
  app.innerHTML = `
  <section class="hero">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="wrap">
      <div>
        <div class="hero-mark"><i class="corner tr"></i>${LOGO}<i class="corner bl"></i></div>
        <h1 class="hero-sub">Музыкальный бар и караоке</h1>
        <p class="hero-lead">Живая музыка, караоке до утра и кухня с морепродуктами. Билет покупается на конкретный стол — выберите место на схеме зала, как в кинотеатре.</p>
      </div>
      <div id="hero-stub"></div>
    </div>
  </section>

  <section class="section wrap" id="afisha">
    <div class="section-head"><h2>Афиша</h2><p>Нажмите на событие, чтобы открыть схему зала и выбрать стол.</p></div>
    <div class="events" id="events"><p class="muted">Загружаем афишу…</p></div>
  </section>

  <section class="section wrap">
    <div class="section-head"><h2>Меню</h2><p>Кухня с морепродуктами и азиатскими нотами, авторские коктейли, большая винная карта.</p></div>
    <div class="menu-duo">
      <a class="menu-card" href="/menu#kitchen" style="--img:url('/img/kitchen.jpg')"><span class="brush">Кухня</span><p>Устрицы и живые гребешки, тартары, роллы, мясо на гриле и баскский чизкейк.</p></a>
      <a class="menu-card" href="/menu#bar" style="--img:url('/img/bottles.jpg')"><span class="brush">Бар</span><p>Авторские коктейли, шоты на компанию, спритцы, вино, виски и разливное пиво.</p></a>
    </div>
  </section>

  <section class="section wrap">
    <div class="section-head"><h2>Как купить билет</h2></div>
    <ol class="steps">
      <li><h3>Выберите стол</h3><p>На схеме видно, какие столы свободны, где уже сидят гости и сколько мест осталось.</p></li>
      <li><h3>Укажите число мест</h3><p>Можно взять одно место, несколько или весь стол целиком. Места держатся за вами 10 минут.</p></li>
      <li><h3>Оплатите</h3><p>Часть стоимости билета — депозит: его можно потратить на еду и напитки в тот же вечер.</p></li>
      <li><h3>Покажите билет на входе</h3><p>У каждого гостя свой билет с живым QR: он меняется каждые 30 секунд, поэтому скриншот не пройдёт. После скана билет гасится.</p></li>
    </ol>
  </section>`;

  try {
    const events = await api('/api/events');
    $('#events').innerHTML = events.length ? events.map(eventRow).join('') : '<p class="muted">Новые события скоро появятся. Загляните позже или позвоните нам, чтобы забронировать стол на обычный вечер.</p>';
    $('#hero-stub').innerHTML = heroStub(events.find((e) => e.status === 'on_sale' && e.seatsFree > 0));
  } catch (err) {
    $('#events').innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
  }
  renderFooter();
}

main();
