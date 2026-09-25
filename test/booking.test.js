import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seedEvents } from '../server/db.js';
import { createBooking, BookingError, HOLD_MINUTES } from '../server/booking.js';

function setup() {
  let clock = new Date('2026-09-25T12:00:00Z');
  const db = openDb(':memory:');
  seedEvents(db, clock);
  const booking = createBooking(db, { now: () => clock });
  const event = booking.listEvents()[0];
  return { booking, event, tick: (min) => (clock = new Date(clock.getTime() + min * 60e3)) };
}
const guest = { name: 'Анна', phone: '+7 (912) 345-67-89' };

test('гость берёт несколько мест за одним столом', () => {
  const { booking, event } = setup();
  const order = booking.hold(event.id, [{ tableId: 'K24', seats: 3 }]);
  assert.equal(order.status, 'held');
  assert.equal(order.tickets.length, 3);
  assert.deepEqual(order.tickets.map((t) => t.seat), [1, 2, 3]);
  const av = booking.availability(event.id).tables.K24;
  assert.equal(av.free, 1);
  assert.equal(av.status, 'partial');
  assert.equal(av.wholeAvailable, false);
});

test('на одно место нельзя продать два билета', () => {
  const { booking, event } = setup();
  booking.hold(event.id, [{ tableId: 'K24', seats: 3 }]);
  assert.throws(() => booking.hold(event.id, [{ tableId: 'K24', seats: 2 }]), (e) => e instanceof BookingError && e.status === 409);
  const second = booking.hold(event.id, [{ tableId: 'K24', seats: 1 }]);
  assert.equal(second.tickets[0].seat, 4);
  assert.equal(booking.availability(event.id).tables.K24.status, 'full');
});

test('стол целиком и VIP-комната', () => {
  const { booking, event } = setup();
  const o = booking.hold(event.id, [{ tableId: 'K27', whole: true }, { tableId: 'K34', seats: 1 }]);
  assert.equal(o.tickets.length, 6 + 6, 'VIP-стол продаётся только целиком');
  assert.throws(() => booking.hold(event.id, [{ tableId: 'K27', seats: 1 }]), BookingError);
});

test('неоплаченная бронь снимается через 10 минут', () => {
  const { booking, event, tick } = setup();
  const o = booking.hold(event.id, [{ tableId: 'K21', seats: 2 }]);
  tick(HOLD_MINUTES + 1);
  assert.equal(booking.availability(event.id).tables.K21.free, 4);
  assert.throws(() => booking.pay(o.secret, guest), (e) => e.status === 410);
});

test('оплата, поиск заказа по телефону, проход по билету', () => {
  const { booking, event } = setup();
  const held = booking.hold(event.id, [{ tableId: 'M15', seats: 2 }]);
  const paid = booking.pay(held.secret, { ...guest, guests: { [held.tickets[1].code]: 'Борис' } });
  assert.equal(paid.status, 'paid');
  assert.deepEqual(paid.tickets.map((t) => t.guestName), ['Анна', 'Борис']);
  assert.equal(booking.getOrder({ code: paid.code.toLowerCase(), phone: '89123456789' }).code, paid.code);
  assert.throws(() => booking.getOrder({ code: paid.code, phone: '9000000000' }), BookingError);

  const code = paid.tickets[0].code;
  assert.equal(booking.checkIn(`https://mt.bar/ticket.html?t=${code}`, event.id).result, 'ok');
  assert.equal(booking.checkIn(code, event.id).result, 'already_used');
  assert.equal(booking.getOrder({ secret: paid.secret }).canCancel, false, 'после прохода вернуть нельзя');
});

test('возврат освобождает места', () => {
  const { booking } = setup();
  const later = booking.listEvents().at(-1);
  const held = booking.hold(later.id, [{ tableId: later.halls[0] === 'main' ? 'M1' : 'K28', seats: 4 }]);
  booking.pay(held.secret, guest);
  const refunded = booking.cancelByGuest(held.secret);
  assert.equal(refunded.status, 'refunded');
  assert.ok(refunded.tickets.every((t) => t.status === 'cancelled'));
  assert.equal(booking.getTicket(held.tickets[0].code).status, 'cancelled');
  assert.equal(booking.checkIn(held.tickets[0].code).result, 'invalid');
});

test('ссылка на билет не раскрывает заказ, контакты и чужие билеты', () => {
  const { booking, event } = setup();
  const held = booking.hold(event.id, [{ tableId: 'K22', seats: 3 }]);
  const paid = booking.pay(held.secret, { ...guest, email: 'anna@example.com' });
  const pub = booking.getTicket(paid.tickets[1].code);
  const json = JSON.stringify(pub);
  for (const leak of [paid.code, paid.secret, paid.tickets[0].code, paid.tickets[2].code, '9123456789', 'anna@example.com']) {
    assert.ok(!json.includes(leak), `в публичном билете не должно быть ${leak}`);
  }
  assert.equal(pub.seat, 2);
});

test('без подключённой оплаты нельзя ни забронировать, ни оплатить', () => {
  const db = openDb(':memory:');
  seedEvents(db, new Date('2026-09-25T12:00:00Z'));
  const booking = createBooking(db, { now: () => new Date('2026-09-25T12:00:00Z'), demoPayments: false });
  assert.throws(() => booking.hold(booking.listEvents()[0].id, [{ tableId: 'K21', seats: 1 }]), (e) => e.status === 503);
  assert.throws(() => booking.pay('x'.repeat(24), guest), (e) => e.status === 503);
});

test('мусор во входных данных не ломает сервер', () => {
  const { booking, event } = setup();
  assert.throws(() => booking.hold(event.id, [{ tableId: { toString: 1 }, seats: 1 }]), (e) => e.status === 400);
  assert.throws(() => booking.hold(event.id, [{ tableId: '__proto__', seats: 1 }]), (e) => e.status === 400);
  assert.throws(() => booking.hold(event.id, Array(50).fill({ tableId: 'K21', seats: 1 })), (e) => e.status === 400);
  const held = booking.hold(event.id, [{ tableId: 'K25', seats: 2 }]);
  const paid = booking.pay(held.secret, { name: 'Анна\u0000‮', phone: '9123456789', guests: null });
  assert.equal(paid.tickets[0].guestName, 'Анна');
  assert.throws(() => booking.getOrder({ code: paid.code, phone: '' }), (e) => e.status === 404);
});
