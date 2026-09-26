import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SELLER, LEGAL_LINKS } from '../public/js/seller.js';

const page = (name) => readFileSync(new URL(`../public/${name}.html`, import.meta.url), 'utf8');

test('документы на месте, ссылки из подвала ведут на них', () => {
  for (const [href] of LEGAL_LINKS) assert.ok(existsSync(new URL(`../public${href}.html`, import.meta.url)), href);
  assert.ok(existsSync(new URL('../public/consent.html', import.meta.url)));
});

test('реквизиты в документах совпадают с seller.js', () => {
  for (const name of ['offer', 'refund', 'privacy', 'consent', 'contacts']) {
    const html = page(name);
    assert.ok(html.includes(SELLER.inn), `${name}: ИНН`);
    assert.ok(html.includes(SELLER.ogrnip), `${name}: ОГРНИП`);
    assert.ok(html.includes(SELLER.email), `${name}: почта`);
  }
  for (const name of ['offer', 'refund', 'privacy', 'contacts']) assert.ok(page(name).includes(SELLER.phone), `${name}: телефон`);
});
