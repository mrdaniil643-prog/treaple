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
  return `${e.image ? `<a class="hero-poster" href="/event?id=${e.id}"><img src="${esc(e.image)}" alt="Афиша: ${esc(e.title)}" width="1024" height="1536" decoding="async"></a>` : ''}<div class="stub" style="--cut:104px">
    <div class="stub-date"><b>${fmt.day(e.starts_at)}</b><span>${fmt.month(e.starts_at)}</span></div>
    <div class="stub-body">
      <span class="stub-kicker">${fmt.weekday(e.starts_at)}, ${fmt.time(e.starts_at)}</span>
      <h3>${esc(e.title)}</h3>
      ${e.lineup ? `<p>${esc(e.lineup)}</p>` : ''}
      <a class="btn" href="/event?id=${e.id}">Выбрать стол</a>
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
        <h1 class="hero-sub">Музыкальный бар и караоке</h1>
        <p class="hero-lead">Билет берёте сразу на место за столом. Стол выбираете на схеме зала.</p>
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
    <div class="menu-duo">
      <a class="menu-card" href="/menu#kitchen" style="--img:url('/img/kitchen.jpg')"><span class="brush">Кухня</span><p>Живые гребешки, тартары, роллы и баскский чизкейк.</p></a>
      <a class="menu-card" href="/menu#bar" style="--img:url('/img/bottles.jpg')"><span class="brush">Бар</span><p>Авторские коктейли, шоты сетами по 10 штук и разливное пиво.</p></a>
    </div>
  </section>

  <section class="section wrap">
    <div class="section-head"><h2>Как купить билет</h2></div>
    <ol class="steps">
      <li><h3>Выберите стол</h3><p>Светлые столы свободны, медные заняты частично, серые заняты целиком.</p></li>
      <li><h3>Укажите число мест</h3><p>Одно место или весь стол. Пока вы оплачиваете, места держатся за вами 10 минут.</p></li>
      <li><h3>Оплатите</h3><p>Часть цены билета идёт в депозит. Его вы тратите на еду и напитки в тот же вечер.</p></li>
      <li><h3>Покажите билет на входе</h3><p>У каждого гостя свой билет, друзьям отправьте его ссылкой. QR меняется каждые 30 секунд, поэтому скриншот не подойдёт. Можно скачать PDF.</p></li>
    </ol>
  </section>`;

  try {
    const events = await api('/api/events');
    const hero = events.find((e) => e.status === 'on_sale' && e.seatsFree > 0);
    $('#hero-stub').innerHTML = heroStub(hero);
    // ближайшее событие уже в шапке, списком показываем только остальные
    const rest = events.filter((e) => e !== hero);
    if (rest.length || !hero) {
      $('#more h2').textContent = hero ? 'Ещё в афише' : 'Афиша';
      $('#events').innerHTML = rest.length ? rest.map(eventRow).join('') : '<p class="muted">Афиша на ближайшие дни пока пустая. Стол на обычный вечер можно забронировать по телефону.</p>';
      $('#more').hidden = false;
    }
  } catch (err) {
    $('#events').innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    $('#more').hidden = false;
  }
  renderFooter();
}

main();
