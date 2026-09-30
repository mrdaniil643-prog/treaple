import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb, seedEvents } from '../server/db.js';
import { createBooking } from '../server/booking.js';
import { createSeo } from '../server/seo.js';

process.env.TZ ||= 'Asia/Vladivostok';
const ORIGIN = 'https://bilety-mt.ru';

function setup() {
  const db = openDb(':memory:');
  seedEvents(db);
  const booking = createBooking(db, { now: () => new Date('2026-10-01T00:00:00Z') });
  return { booking, seo: createSeo({ booking }) };
}
const page = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('страница события: заголовок, canonical, Open Graph, разметка Event и текст без JS', () => {
  const { seo } = setup();
  const html = seo.render('event.html', page('event.html'), new URL(`${ORIGIN}/event?id=1`), ORIGIN);
  assert.match(html, /<title>Отчётный концерт × Открытый микрофон — 25 октября, билеты \| Бар МТ, Хабаровск<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bilety-mt\.ru\/event\?id=1">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/bilety-mt\.ru\/img\/events\/otchetny-koncert-25-10\.jpg">/);
  assert.match(html, /<main id="app"><section[^>]*><h1>Отчётный концерт × Открытый микрофон<\/h1>/);
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(desc.length <= 200 && desc.startsWith('25 октября в 16:00'), desc);
  const [ev] = ldOf(html);
  assert.equal(ev['@type'], 'Event');
  assert.equal(ev.startDate, '2026-10-25T16:00:00+10:00');
  assert.deepEqual([ev.offers.price, ev.offers.priceCurrency, ev.offers.availability], [1000, 'RUB', 'https://schema.org/InStock']);
  assert.equal(ev.location.address.addressLocality, 'Хабаровск');
});

test('главная: бар и афиша в разметке, ссылки на события в тексте; чужое событие не индексируется', () => {
  const { seo } = setup();
  const html = seo.render('index.html', page('index.html'), new URL(`${ORIGIN}/`), ORIGIN);
  const [bar, ev] = ldOf(html);
  assert.equal(bar['@type'], 'BarOrPub');
  assert.equal(bar.logo, `${ORIGIN}/img/icon-512.png`);
  assert.equal(bar.openingHoursSpecification.length, 2);
  assert.equal(ev['@type'], 'Event');
  assert.match(html, /<a href="\/event\?id=1">/);
  assert.match(seo.render('event.html', page('event.html'), new URL(`${ORIGIN}/event?id=999`), ORIGIN), /<meta name="robots" content="noindex">/);
  assert.equal(seo.render('admin.html', page('admin.html'), new URL(`${ORIGIN}/admin`), ORIGIN), page('admin.html'), 'служебные страницы не трогаем');
});

test('в разметку и заголовки не пролезает HTML из названия события', () => {
  const { booking, seo } = setup();
  const e = booking.createEvent({ title: '</script><script>alert(1)</script>"', startsAt: '2026-11-01T20:00', price: 500 });
  const html = seo.render('event.html', page('event.html'), new URL(`${ORIGIN}/event?id=${e.id}`), ORIGIN);
  assert.ok(!html.includes('<script>alert(1)'), 'нет исполняемого скрипта');
  assert.equal(ldOf(html)[0].name, '</script><script>alert(1)</script>"');
});

test('robots.txt закрывает служебные разделы, sitemap перечисляет события', () => {
  const { seo } = setup();
  const robots = seo.robots(ORIGIN);
  for (const p of ['/admin', '/staff', '/tickets', '/c/', '/api/']) assert.match(robots, new RegExp(`Disallow: ${p.replace('/', '\\/')}`));
  assert.match(robots, /Sitemap: https:\/\/bilety-mt\.ru\/sitemap\.xml/);
  const map = seo.sitemap(ORIGIN);
  assert.match(map, /<loc>https:\/\/bilety-mt\.ru\/event\?id=1<\/loc>/);
  assert.match(map, /<loc>https:\/\/bilety-mt\.ru\/menu<\/loc>/);
  assert.ok(!map.includes('/admin'));
});

test('у каждой страницы есть значок для поиска, служебные закрыты от индексации', () => {
  for (const f of ['index.html', 'event.html', 'menu.html', 'offer.html', 'contacts.html', 'tickets.html', 'ticket.html', 'admin.html']) {
    const html = page(f);
    assert.match(html, /<link rel="icon" href="\/favicon\.ico"/, f);
    assert.ok(!html.includes('googleapis'), `${f}: шрифты только свои`);
  }
  for (const f of ['tickets.html', 'ticket.html', 'admin.html', 'staff.html', 'c.html', '404.html']) assert.match(page(f), /name="robots" content="noindex"/, f);
});
