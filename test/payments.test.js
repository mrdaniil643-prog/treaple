import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBooking } from '../server/booking.js';
import { buildReceipt } from '../server/yookassa.js';

function setup() {
  let clock = new Date('2026-09-25T12:00:00Z');
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre)
    VALUES ('e', 'Караоке-вечер', '', '', '2026-10-25T18:00:00Z', '2026-10-25T16:30:00Z', '["karaoke","main"]', 1000, 500, '')`).run();
  const booking = createBooking(db, { now: () => clock, payments: 'yookassa' });
  return { db, booking, tick: (min) => (clock = new Date(clock.getTime() + min * 60e3)) };
}
const guest = { name: 'Анна', phone: '+7 (912) 345-67-89', email: 'anna@example.ru', consent: true };
const paymentOf = (id, value, status = 'succeeded') => ({ id, status, amount: { value: value.toFixed(2), currency: 'RUB' } });

test('ЮKassa: демо-оплата закрыта, платёж подтверждается только проверенной суммой', () => {
  const { booking } = setup();
  const held = booking.hold(1, [{ tableId: 'K24', seats: 2 }]);
  assert.throws(() => booking.pay(held.secret, guest), (e) => e.status === 503);
  const start = booking.startPayment(held.secret, { ...guest, guests: { [held.tickets[1].code]: 'Борис' } });
  assert.equal(start.lines.length, 2);
  assert.equal(start.contacts.phone, '9123456789');
  booking.attachPayment(held.secret, 'pay-1', 'https://yoomoney.ru/checkout/pay-1');
  assert.equal(booking.getOrder({ secret: held.secret }).paymentPending, true);
  // повторное нажатие «Оплатить» — та же платёжная страница, без второго платежа
  assert.equal(booking.startPayment(held.secret, guest).url, 'https://yoomoney.ru/checkout/pay-1');

  assert.deepEqual(booking.applyPayment(paymentOf('pay-1', 1)), { ignored: 'amount' }, 'чужая сумма не подтверждает заказ');
  assert.deepEqual(booking.applyPayment(paymentOf('pay-x', 2000)), { ignored: 'unknown' });
  assert.deepEqual(booking.applyPayment(paymentOf('pay-1', 2000, 'pending')), { ignored: 'pending' });
  assert.deepEqual(booking.applyPayment(paymentOf('pay-1', 2000)), { paid: true });
  const o = booking.getOrder({ secret: held.secret });
  assert.equal(o.status, 'paid');
  assert.equal(o.paidOnline, true);
  assert.deepEqual(o.tickets.map((t) => t.guestName), ['Анна', 'Борис']);
  assert.deepEqual(booking.applyPayment(paymentOf('pay-1', 2000)), { already: true }, 'повторное уведомление ничего не меняет');
});

test('ЮKassa: отменённый платёж снимает бронь', () => {
  const { booking } = setup();
  const held = booking.hold(1, [{ tableId: 'K25', seats: 1 }]);
  booking.startPayment(held.secret, guest);
  booking.attachPayment(held.secret, 'pay-2', 'u');
  booking.applyPayment(paymentOf('pay-2', 1000, 'canceled'));
  assert.equal(booking.getOrder({ secret: held.secret }).status, 'cancelled');
  assert.equal(booking.availability(1).tables.K25.sold + booking.availability(1).tables.K25.held, 0);
});

test('ЮKassa: оплата пришла после конца брони — места возвращаются или деньги уходят назад', () => {
  const { booking, tick } = setup();
  const a = booking.hold(1, [{ tableId: 'K26', seats: 1 }]);
  booking.startPayment(a.secret, guest);
  booking.attachPayment(a.secret, 'pay-3', 'u');
  const b = booking.hold(1, [{ tableId: 'K27', seats: 1 }]);
  booking.startPayment(b.secret, guest);
  booking.attachPayment(b.secret, 'pay-4', 'u');
  tick(25); // бронь истекла
  booking.sweep();
  // место за столом 27 за это время занял другой гость
  booking.startPayment(booking.hold(1, [{ tableId: 'K27', seats: 6 }]).secret, guest);
  assert.deepEqual(booking.applyPayment(paymentOf('pay-3', 1000)), { paid: true }, 'место свободно — заказ оплачен');
  assert.equal(booking.getOrder({ secret: a.secret }).status, 'paid');
  const r = booking.applyPayment(paymentOf('pay-4', 1000));
  assert.ok(r.refund, 'место заняли — нужен возврат');
  assert.equal(r.refund.amount, 1000);
  assert.deepEqual(booking.pendingPayments(), ['pay-4'], 'пока возврат не прошёл, платёж проверяется снова');
  assert.ok(booking.applyPayment(paymentOf('pay-4', 1000)).refund, 'повторная проверка снова просит вернуть деньги');
  booking.markLateRefunded(r.refund.order);
  assert.equal(booking.getOrder({ secret: b.secret }).status, 'refunded');
  assert.deepEqual(booking.pendingPayments(), []);
});

test('ЮKassa: возвраты считаются по цене оплаты', () => {
  const { booking } = setup();
  const held = booking.hold(1, [{ tableId: 'K21', seats: 2 }]);
  booking.startPayment(held.secret, guest);
  booking.attachPayment(held.secret, 'pay-5', 'u');
  booking.applyPayment(paymentOf('pay-5', 2600));
  const [a] = booking.getOrder({ secret: held.secret }).tickets;
  booking.adminEditTicket(a.code, { price: 5000 }); // цену поменяли уже после оплаты
  const one = booking.ticketRefundPlan(a.code, { status: 'cancelled' });
  assert.equal(one.amount, 1300, 'возвращаем то, что заплатили, а не новую цену');
  assert.equal(booking.ticketRefundPlan(a.code, { guestName: 'Вера' }), null, 'не аннулирование — без возврата');
  const all = booking.guestRefundPlan(held.secret);
  assert.equal(all.amount, 2600);
  assert.equal(all.paymentId, 'pay-5');
});

test('чек: билет и депозит отдельными строками, сумма сходится', () => {
  const lines = [
    { table: '24', seat: 1, price: 1000, deposit: 500, event: { title: 'Караоке-вечер', startsAt: '2026-10-25T18:00:00Z' } },
    { table: '24', seat: 2, price: 1000, deposit: 500, event: { title: 'К'.repeat(200), startsAt: '2026-10-25T18:00:00Z' } },
  ];
  const r = buildReceipt(lines, { name: 'Анна', phone: '9123456789', email: 'a@b.ru' }, { vatCode: 1, taxSystem: 2, depositAsAdvance: true });
  assert.deepEqual(r.customer, { email: 'a@b.ru', full_name: 'Анна' });
  assert.equal(r.tax_system_code, 2);
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.items.slice(0, 2).map((i) => [i.amount.value, i.payment_mode, i.payment_subject]), [['500.00', 'full_payment', 'service'], ['500.00', 'advance', 'payment']]);
  assert.equal(r.items.reduce((s, i) => s + Number(i.amount.value), 0), 2000);
  assert.ok(r.items.every((i) => i.description.length <= 128));
  const noDeposit = buildReceipt(lines.slice(0, 1), { phone: '9123456789' }, { vatCode: 4, depositAsAdvance: false });
  assert.deepEqual(noDeposit.customer, { phone: '79123456789' });
  assert.equal(noDeposit.items.length, 1);
  assert.equal(noDeposit.items[0].amount.value, '1000.00');
  assert.equal(noDeposit.items[0].vat_code, 4);
});
