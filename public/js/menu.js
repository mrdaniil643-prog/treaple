import { esc, money, renderHeader, renderFooter, $, $$ } from './common.js';
import { KITCHEN, BAR, BAR_GROUPS } from './menu-data.js';

renderHeader('menu');
const app = $('#app');
let tab = location.hash === '#bar' ? 'bar' : 'kitchen';
let query = '';

const priceHtml = (item, section) => {
  if (Array.isArray(item.p)) {
    const vol = item.d && /мл|л$/.test(item.d) ? item.d : section.en && /мл|бутылка|л/.test(section.en) ? section.en : '';
    return `${money(item.p[0])} / ${money(item.p[1])}${vol ? `<small>${esc(vol)}</small>` : ''}`;
  }
  return money(item.p);
};

function dish(item, section) {
  const desc = item.d && !/^\d+ мл/.test(item.d) ? item.d : '';
  return `<li class="dish">
    <span class="name">${esc(item.n)}${item.w ? ` <span class="w">${esc(item.w)}</span>` : ''}</span>
    <span class="price">${priceHtml(item, section)}</span>
    ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
  </li>`;
}

const matches = (item) => !query || `${item.n} ${item.d || ''}`.toLowerCase().includes(query);

function sectionHtml(s) {
  const items = s.items.filter(matches);
  if (!items.length) return '';
  const sub = s.en && !/мл|бутылка|л$/.test(s.en) ? s.en : '';
  return `<section class="menu-section" id="s-${s.id}"><h2>${esc(s.title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h2>
    <ul class="dishes">${items.map((i) => dish(i, s)).join('')}</ul></section>`;
}

function draw() {
  const nav = tab === 'kitchen'
    ? KITCHEN.map((s) => `<a href="#s-${s.id}">${esc(s.title)}</a>`).join('')
    : BAR_GROUPS.map((g) => `<span class="group">${esc(g.title)}</span>${g.ids.map((id) => BAR.find((s) => s.id === id)).map((s) => `<a href="#s-${s.id}">${esc(s.title)}</a>`).join('')}`).join('');
  const body = tab === 'kitchen'
    ? KITCHEN.map(sectionHtml).join('')
    : BAR_GROUPS.flatMap((g) => g.ids.map((id) => sectionHtml(BAR.find((s) => s.id === id)))).join('');
  $('#menu-nav').innerHTML = nav;
  $('#menu-body').innerHTML = body || `<p class="menu-empty">Ничего не нашлось по запросу «${esc(query)}». Попробуйте другое слово или откройте ${tab === 'kitchen' ? 'барную карту' : 'меню кухни'}.</p>`;
  $$('.menu-switch button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  observe();
}

let observer;
function observe() {
  observer?.disconnect();
  const links = new Map($$('#menu-nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('current'));
      const a = links.get(e.target.id);
      a?.classList.add('current');
      // прокручиваем только ленту разделов, не всю страницу (scrollIntoView на телефоне сдвигал страницу вбок)
      const nav = $('#menu-nav');
      if (a) {
        const ar = a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: nav.scrollLeft + ar.left - nr.left - 16, behavior: 'smooth' });
        else if (nav.scrollHeight > nav.clientHeight) nav.scrollTo({ top: nav.scrollTop + ar.top - nr.top - 40, behavior: 'smooth' });
      }
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  $$('.menu-section').forEach((s) => observer.observe(s));
}

app.innerHTML = `<section class="wrap page-head">
  <h1>Меню</h1>
  <div class="menu-switch" role="tablist">
    <button role="tab" data-tab="kitchen">Кухня</button>
    <button role="tab" data-tab="bar">Бар</button>
  </div>
  <div class="menu-layout">
    <nav class="menu-nav" id="menu-nav" aria-label="Разделы меню"></nav>
    <div>
      <label class="field menu-search"><span class="visually-hidden">Поиск по меню</span>
        <input class="input" id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Найти блюдо или напиток: краб, негрони, чизкейк"></label>
      <div id="menu-body"></div>
      <p class="menu-legal">Меню с полной информацией о составе, выходе и энергетической ценности каждого блюда находится в уголке потребителя. Если у вас аллергия на какой-либо ингредиент, сообщите об этом официанту. Цены в рублях.</p>
    </div>
  </div>
</section>`;

$$('.menu-switch button').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  history.replaceState(null, '', `#${tab}`);
  draw();
  $('#menu-body').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
}));
$('#q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); draw(); });
draw();
renderFooter();
