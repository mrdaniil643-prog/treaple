// Content-Security-Policy в vercel.json разрешает встроенные скрипт и стиль по хешу.
// Если поправить их в HTML и не обновить хеш, браузер молча их заблокирует.
// Тест считает хеши заново и сравнивает с заголовком.
// Запуск: node --test tests/csp.test.mjs
// Обновить хеши после правки: node tests/csp.test.mjs --write
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
// Браузер хеширует встроенный код после того, как HTML-парсер заменил \r\n на \n.
// Без этой замены хеш с Windows-чекаута не совпадёт с хешем браузера.
const sha = (s) =>
  `'sha256-${createHash('sha256').update(s.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`;

const PAGES = ['index.html', '404.html'];

// Встроенные блоки с любыми атрибутами; <script src> внешний и под 'self'
function inline(tag) {
  const out = [];
  for (const page of PAGES) {
    const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
    for (const m of read(page).matchAll(re)) {
      if (tag === 'script' && /\ssrc=/i.test(m[1] || '')) continue;
      out.push(sha(m[2]));
    }
  }
  return [...new Set(out)];
}

export function buildCsp() {
  return [
    "default-src 'self'",
    `script-src 'self' ${inline('script').join(' ')}`.trim(),
    `style-src 'self' ${inline('style').join(' ')}`.trim(),
    "img-src 'self' data:",
    "font-src 'self'",
    // 'self', а не 'none': проверка robots.txt в Lighthouse идёт запросом изнутри страницы.
    // На статике без API запросы к своему же сайту ничего наружу не уносят.
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join('; ');
}

function cspFromConfig(config) {
  const all = config.headers.find((h) => h.source === '/(.*)');
  return all && all.headers.find((h) => h.key === 'Content-Security-Policy');
}

if (process.argv.includes('--write')) {
  const config = JSON.parse(read('vercel.json'));
  const all = config.headers.find((h) => h.source === '/(.*)');
  const existing = cspFromConfig(config);
  if (existing) existing.value = buildCsp();
  else all.headers.push({ key: 'Content-Security-Policy', value: buildCsp() });
  writeFileSync(new URL('vercel.json', root), JSON.stringify(config, null, 2) + '\n');
  console.log('vercel.json: CSP обновлена');
} else {
  test('хеши встроенных скриптов и стилей совпадают с CSP в vercel.json', () => {
    const header = cspFromConfig(JSON.parse(read('vercel.json')));
    assert.ok(header, 'в vercel.json нет Content-Security-Policy');
    assert.equal(header.value, buildCsp(),
      'встроенный скрипт или стиль изменился: запустите node tests/csp.test.mjs --write');
  });
}
