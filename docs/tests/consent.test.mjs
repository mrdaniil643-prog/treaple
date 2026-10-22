// Редакция согласия живёт в нескольких местах: константа сервера, значения флажков
// в формах и даты в consent.html и privacy.html. Сервер принимает только точное
// совпадение, поэтому расхождение молча теряет все заявки. Тест сверяет их.
// Запуск: node --test tests/consent.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSENT_REVISION } from '../api/lead.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
  'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const [y, m, d] = CONSENT_REVISION.split('-').map(Number);
const human = `Редакция от ${d} ${MONTHS[m - 1]} ${y} года`;

test('флажки согласия в формах передают текущую редакцию', () => {
  const values = [...read('index.html').matchAll(/name="consent"[^>]*value="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(values.length, 2, 'ожидалось два флажка согласия');
  for (const v of values) assert.equal(v, CONSENT_REVISION);
});

test('дата редакции в документах совпадает с константой сервера', () => {
  for (const page of ['consent.html', 'privacy.html']) {
    const text = read(page).replace(/ /g, ' ');
    assert.ok(text.includes(human), `${page}: нет строки «${human}»`);
  }
});
