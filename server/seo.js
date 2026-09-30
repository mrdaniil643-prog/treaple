// SEO: robots.txt, sitemap.xml и то, что сервер дописывает в HTML-страницы:
// canonical, Open Graph, разметка schema.org и текст страницы до загрузки скриптов
// (поисковик видит заголовок, дату, цену и меню, даже если не выполняет JS).
import { KITCHEN } from '../public/js/menu-data.js';

export const VENUE = {
  name: 'МТ',
  fullName: 'Музыкальный бар и караоке «МТ»',
  city: 'Хабаровск',
  street: 'ул. Муравьёва-Амурского, 3б',
  region: 'Хабаровский край',
  phone: '+7 4212 94-44-22',
  email: 'mtbarkhv@yandex.ru',
  // вс–чт 19:00–04:00, пт–сб 19:00–06:00
  hours: [
    { days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '19:00', closes: '04:00' },
    { days: ['Friday', 'Saturday'], opens: '19:00', closes: '06:00' },
  ],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON внутри <script>: «</script>» и похожее не должны закрыть тег
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
const tz = () => process.env.TZ;
const dateRu = (iso) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: tz() }).format(new Date(iso));
const timeRu = (iso) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz() }).format(new Date(iso));
const rub = (n) => `${new Intl.NumberFormat('ru-RU').format(n)}\u00a0₽`;
// ISO с поясом заведения: 2026-10-25T16:00:00+10:00 — так дату понимают и Яндекс, и Google
function localIso(iso) {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const off = Math.round((asUtc - d.getTime()) / 60e3);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}

// Страницы, которые не должны попадать в поиск: личные билеты, админка, контролёр
const PRIVATE = new Set(['admin.html', 'staff.html', 'c.html', 'ticket.html', 'tickets.html', '404.html']);
const PUBLIC_PAGES = ['/', '/menu', '/contacts', '/offer', '/refund', '/privacy', '/consent'];

export function createSeo({ booking }) {
  const address = () => ({
    '@type': 'PostalAddress', streetAddress: VENUE.street, addressLocality: VENUE.city, addressRegion: VENUE.region, addressCountry: 'RU',
  });
  const place = () => ({ '@type': 'Place', name: `Бар ${VENUE.name}`, address: address() });
  const bar = (origin) => ({
    '@context': 'https://schema.org',
    '@type': 'BarOrPub',
    '@id': `${origin}/#bar`,
    name: VENUE.name,
    alternateName: VENUE.fullName,
    url: `${origin}/`,
    logo: `${origin}/img/icon-512.png`,
    image: `${origin}/img/og.jpg`,
    telephone: VENUE.phone,
    email: VENUE.email,
    address: address(),
    hasMenu: `${origin}/menu`,
    openingHoursSpecification: VENUE.hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
  });

  function eventLd(e, origin) {
    const left = booking.availability(e.id).free;
    const out = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.title,
      startDate: localIso(e.starts_at),
      doorTime: localIso(e.doors_at),
      eventStatus: e.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: place(),
      description: e.description || e.lineup || `${e.title} в баре ${VENUE.name}`,
      url: `${origin}/event?id=${e.id}`,
      image: [`${origin}${e.image || '/img/og.jpg'}`],
      organizer: { '@type': 'Organization', name: `Бар ${VENUE.name}`, url: `${origin}/` },
      offers: {
        '@type': 'Offer', name: 'Входной билет', price: e.price, priceCurrency: 'RUB', url: `${origin}/event?id=${e.id}`,
        availability: e.status === 'on_sale' && left > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      },
    };
    if (e.lineup) out.performer = { '@type': 'PerformingGroup', name: e.lineup };
    return out;
  }

  const upcoming = () => booking.listEvents().filter((e) => e.status !== 'cancelled');

  // Что знаем о странице: заголовок, описание, картинка, разметка и текст до загрузки скриптов
  function describe(file, url, origin) {
    if (file === 'index.html') {
      const events = upcoming();
      return {
        title: `${VENUE.fullName} в Хабаровске: афиша, билеты, бронь столов`,
        desc: `Музыкальный бар и караоке «МТ» в Хабаровске, ${VENUE.street}. Афиша концертов, билеты онлайн, бронь столов, меню кухни. Работаем каждый день с 19:00, вход 21+.`,
        canonical: '/',
        ld: [bar(origin), ...events.map((e) => eventLd(e, origin))],
        body: `<section class="wrap page-head"><h1>Музыкальный бар и караоке «МТ» в Хабаровске</h1>
<p>${esc(VENUE.street)}. Вс–чт 19:00–04:00, пт–сб 19:00–06:00. Билеты на концерты онлайн, бронь столов заявкой.</p>
${events.length ? `<h2>Афиша</h2><ul>${events.map((e) => `<li><a href="/event?id=${e.id}">${esc(e.title)}</a>, ${dateRu(e.starts_at)} в ${timeRu(e.starts_at)}, билет ${rub(e.price)}</li>`).join('')}</ul>` : ''}
<p><a href="/menu">Меню кухни</a></p></section>`,
      };
    }
    if (file === 'event.html') {
      let e = null;
      try { e = booking.getEvent(Number(url.searchParams.get('id'))); } catch { /* нет такого события */ }
      if (!e) return { noindex: true };
      const when = `${dateRu(e.starts_at)} в ${timeRu(e.starts_at)}`;
      const about = e.description || e.lineup || '';
      return {
        title: `${e.title} — ${dateRu(e.starts_at)}, билеты | Бар ${VENUE.name}, Хабаровск`,
        desc: clip(`${when}, бар «МТ», Хабаровск. Входной билет ${rub(e.price)}, бронь столов. ${about}`, 200),
        canonical: `/event?id=${e.id}`,
        image: e.image,
        type: 'event',
        ld: [eventLd(e, origin)],
        body: `<section class="wrap page-head"><h1>${esc(e.title)}</h1>
<p>${when}, двери открываются в ${timeRu(e.doors_at)}. ${esc(VENUE.street)}, Хабаровск.</p>
${about ? `<p>${esc(about)}</p>` : ''}<p>Входной билет ${rub(e.price)}.</p></section>`,
      };
    }
    if (file === 'menu.html') {
      return {
        title: `Меню кухни бара ${VENUE.name} в Хабаровске: цены`,
        desc: 'Меню кухни музыкального бара «МТ»: устрицы и живые гребешки, камчатский краб, тартары, роллы, горячее и десерты. Цены в рублях.',
        canonical: '/menu',
        body: `<section class="wrap page-head"><h1>Меню кухни</h1>${KITCHEN.map((s) => `<h2>${esc(s.title)}</h2><ul>${s.items.map((d) => `<li>${esc(d.n)}${d.w ? `, ${esc(d.w)}` : ''} — ${rub(d.p)}</li>`).join('')}</ul>`).join('')}</section>`,
      };
    }
    const path = `/${file.replace(/\.html$/, '')}`;
    return PUBLIC_PAGES.includes(path) ? { canonical: path } : {};
  }

  // Дописывает в HTML теги для поисковиков и соцсетей
  function render(file, html, url, origin) {
    if (PRIVATE.has(file)) return html;
    const info = describe(file, url, origin);
    if (info.noindex) return html.replace('</head>', '<meta name="robots" content="noindex">\n</head>');
    if (info.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(info.title)}</title>`);
    if (info.desc) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(info.desc)}">`);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    const desc = html.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? '';
    const link = info.canonical ? `${origin}${info.canonical}` : null;
    const image = `${origin}${info.image || '/img/og.jpg'}`;
    const head = [
      link && `<link rel="canonical" href="${esc(link)}">`,
      '<meta property="og:site_name" content="Бар МТ">',
      '<meta property="og:locale" content="ru_RU">',
      `<meta property="og:type" content="${info.type === 'event' ? 'article' : 'website'}">`,
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${desc}">`,
      link && `<meta property="og:url" content="${esc(link)}">`,
      `<meta property="og:image" content="${esc(image)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      process.env.YANDEX_VERIFICATION && `<meta name="yandex-verification" content="${esc(process.env.YANDEX_VERIFICATION)}">`,
      process.env.GOOGLE_VERIFICATION && `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_VERIFICATION)}">`,
      ...(info.ld || []).map(ld),
    ].filter(Boolean).join('\n');
    html = html.replace('</head>', `${head}\n</head>`);
    // текст до загрузки скриптов: скрипт страницы потом заменит его своей вёрсткой
    if (info.body) html = html.replace('<main id="app"></main>', `<main id="app">${info.body}</main>`);
    return html;
  }

  const robots = (origin) => `User-agent: *
Disallow: /admin
Disallow: /staff
Disallow: /tickets
Disallow: /ticket
Disallow: /c/
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;

  function sitemap(origin) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      ...PUBLIC_PAGES.map((p) => ({ loc: `${origin}${p}`, prio: p === '/' ? '1.0' : p === '/menu' ? '0.8' : '0.3', freq: p === '/' ? 'daily' : 'monthly' })),
      ...upcoming().map((e) => ({ loc: `${origin}/event?id=${e.id}`, prio: '0.9', freq: 'daily' })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.prio}</priority></url>`).join('\n')}
</urlset>
`;
  }

  return { render, robots, sitemap };
}
