// Рисует значки сайта и картинку для ссылок из знака (или названия) в public/js/brand.js:
// favicon.ico (16/32/48), img/favicon.svg, img/icon-{120,180,192,512}.png, img/icon-maskable-512.png, img/og.jpg.
// Запуск: npm run icons. Нужен Playwright, как для e2e (npm i -g playwright).
// Если у заведения есть свой логотип, лучше положить готовые файлы с теми же именами.
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { BRAND } from '../public/js/brand.js';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try { return require('playwright'); } catch {}
  return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
})();

const PUBLIC = new URL('../public/', import.meta.url);
const NIGHT = '#14291f', LOGO = '#ffffff', CREAM = '#d5e0d9';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const initial = [...BRAND.name.trim()][0]?.toUpperCase() || '•';
const font = (f) => `data:font/woff2;base64,${readFileSync(new URL(`fonts/${f}`, PUBLIC)).toString('base64')}`;
const FONTS = `<style>
@font-face { font-family: Manrope; font-weight: 200 800; src: url(${font('manrope-cyrillic-wght-normal.woff2')}) format('woff2'); unicode-range: U+0400-04FF; }
@font-face { font-family: Manrope; font-weight: 200 800; src: url(${font('manrope-latin-wght-normal.woff2')}) format('woff2'); }
html, body { margin: 0; }
</style>`;
// знак из brand.js (SVG-файл с currentColor) или первая буква названия
const logoSvg = BRAND.logo ? readFileSync(new URL(BRAND.logo.replace(/^\//, ''), PUBLIC), 'utf8').replace(/<!--.*?-->/gs, '') : '';
const mark = (w, color) => (logoSvg
  ? logoSvg.replace('<svg ', `<svg style="display:block;width:${w}px;height:auto;color:${color}" `).replace(/ width="[\d.]+" height="[\d.]+"/, '')
  : `<span style="font:800 ${Math.round(w * 0.82)}px/1 Manrope;color:${color}">${esc(initial)}</span>`);

// квадратный значок; у maskable поле шире, чтобы знак не попал под обрезку
const icon = (size, { round = false, pad = 0.14 } = {}) => `${FONTS}
<div style="width:${size}px;height:${size}px;background:${NIGHT};${round ? `border-radius:${size * 0.22}px;` : ''}display:grid;place-items:center">
  ${mark(Math.round(size * (1 - pad * 2)), LOGO)}
</div>`;

const og = `${FONTS}
<div style="position:relative;width:1200px;height:630px;background:${NIGHT};box-sizing:border-box;padding:80px 90px;display:flex;flex-direction:column;justify-content:space-between;font-family:Manrope;overflow:hidden">
  <div style="position:absolute;inset:0;background:url(data:image/jpeg;base64,${readFileSync(new URL('img/hero.jpg', PUBLIC)).toString('base64')}) center/cover;opacity:.3"></div>
  <div style="position:relative">${mark(420, LOGO)}</div>
  <div style="position:relative">
    <div style="font:500 30px/1.2 Manrope;color:${LOGO};text-transform:uppercase;letter-spacing:.2em">${esc(BRAND.tagline)} ${esc(BRAND.cityIn)}</div>
    <div style="font:500 30px/1.4 Manrope;color:${CREAM};margin-top:16px">Афиша, билеты на концерты и бронь столов</div>
  </div>
</div>`;

async function shot(page, html, w, h, type = 'png') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.evaluate(() => globalThis.document.fonts.ready); // выполняется в браузере
  return page.screenshot({ type, quality: type === 'jpeg' ? 88 : undefined, omitBackground: type === 'png' });
}

// .ico из PNG-картинок: заголовок, каталог, затем сами PNG
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const out = (f, data) => { writeFileSync(new URL(f, PUBLIC), data); console.log(f); };
for (const size of [120, 180, 192, 512]) out(`img/icon-${size}.png`, await shot(page, icon(size), size, size));
out('img/icon-maskable-512.png', await shot(page, icon(512, { pad: 0.28 }), 512, 512));
const small = [];
for (const size of [16, 32, 48]) small.push({ size, data: await shot(page, icon(size, { round: true, pad: 0.04 }), size, size) });
out('favicon.ico', ico(small));
out('img/og.jpg', await shot(page, og, 1200, 630, 'jpeg'));
await browser.close();

// SVG-значок для браузеров: тот же знак на зелёной плашке
out('img/favicon.svg', logoSvg
  ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -160 583 583"><rect x="-20" y="-160" width="583" height="583" rx="120" fill="${NIGHT}"/>${logoSvg.match(/<g id="logo"[\s\S]*?<\/g>/)[0].replace('currentColor', LOGO)}</svg>\n`
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${NIGHT}"/><text x="32" y="45" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="38" fill="${LOGO}">${esc(initial)}</text></svg>\n`);
