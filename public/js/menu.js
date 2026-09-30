import { esc, money, renderHeader, renderFooter, $, $$ } from './common.js';
import { KITCHEN } from './menu-data.js';

renderHeader('menu');
const app = $('#app');
let query = '';

function dish(item) {
  return `<li class="dish">
    <span class="name">${esc(item.n)}${item.w ? ` <span class="w">${esc(item.w)}</span>` : ''}</span>
    <span class="price">${money(item.p)}</span>
    ${item.d ? `<p class="desc">${esc(item.d)}</p>` : ''}
  </li>`;
}

const matches = (item) => !query || `${item.n} ${item.d || ''}`.toLowerCase().includes(query);

function sectionHtml(s) {
  const items = s.items.filter(matches);
  if (!items.length) return '';
  return `<section class="menu-section" id="s-${s.id}"><h2>${esc(s.title)}</h2>
    <ul class="dishes">${items.map(dish).join('')}</ul></section>`;
}

function draw() {
  $('#menu-nav').innerHTML = KITCHEN.map((s) => `<a href="#s-${s.id}">${esc(s.title)}</a>`).join('');
  $('#menu-body').innerHTML = KITCHEN.map(sectionHtml).join('') || `<p class="menu-empty">Ничего не нашлось по запросу «${esc(query)}». Попробуйте другое слово.</p>`;
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
  <h1>Меню кухни</h1>
  <div class="menu-layout">
    <nav class="menu-nav" id="menu-nav" aria-label="Разделы меню"></nav>
    <div>
      <label class="field menu-search"><span class="visually-hidden">Поиск по меню</span>
        <input class="input" id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Найти блюдо: краб, роллы, чизкейк"></label>
      <div id="menu-body"></div>
      <p class="menu-legal">Меню с полной информацией о составе, выходе и энергетической ценности каждого блюда находится в уголке потребителя. Если у вас аллергия на какой-либо ингредиент, сообщите об этом официанту. Цены в рублях.</p>
    </div>
  </div>
</section>`;

$('#q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); draw(); });
draw();
renderFooter();
