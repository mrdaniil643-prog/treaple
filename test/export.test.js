import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { openDb } from '../server/db.js';
import { createBooking } from '../server/booking.js';
import { buildXlsx } from '../server/xlsx.js';

process.env.TZ ||= 'Asia/Vladivostok';

// Читаем наш zip без библиотек: файлы лежат без сжатия (или deflate — на всякий случай)
function unzip(buf) {
  const out = {};
  for (let i = 0; i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50;) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    i += 30 + nameLen + extra + size;
  }
  return out;
}

test('выгрузка в Excel: по строке на оплаченный билет, ФИО, телефон, номер заказа и код билета', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO events (slug, title, starts_at, doors_at, halls, price, capacity) VALUES ('e', 'Концерт', '2026-10-25T06:00:00Z', '2026-10-25T05:00:00Z', '[]', 1000, 50)`).run();
  const booking = createBooking(db, { now: () => new Date('2026-10-01T00:00:00Z') });
  const held = booking.hold(1, 2);
  const paid = booking.pay(held.secret, { name: 'Анна Петрова', phone: '+7 912 345-67-89', email: 'a@b.ru', consent: true, guests: { [held.tickets[1].code]: '=HYPERLINK("http://evil")' } });
  booking.hold(1, 1); // неоплаченная бронь в выгрузку не попадает
  const rows = booking.exportTickets(1);
  assert.equal(rows.length, 3, 'заголовок и два билета');
  assert.deepEqual(rows[0].slice(2, 7), ['Номер заказа', 'Код билета', 'Гость (ФИО на билете)', 'Покупатель', 'Телефон']);
  assert.deepEqual(rows[1].slice(2, 9), [paid.code, paid.tickets[0].code, 'Анна Петрова', 'Анна Петрова', '+79123456789', 'a@b.ru', 1000]);
  assert.equal(rows[1][9], 'Действует');
  assert.equal(booking.exportTickets().length, 3, 'все мероприятия');

  const files = unzip(buildXlsx('Билеты', rows));
  assert.ok(files['xl/workbook.xml'].includes('name="Билеты"'));
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes(`<t xml:space="preserve">${paid.code}</t>`));
  assert.ok(sheet.includes('<v>1000</v>'), 'цена числом');
  assert.ok(!/<f>/.test(sheet) && sheet.includes('=HYPERLINK(&quot;http://evil&quot;)'), 'имя гостя — текст, не формула');
});
