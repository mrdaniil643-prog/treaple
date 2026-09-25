import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, seedEvents } from '../server/db.js';
import { createBooking, BookingError, HOLD_MINUTES, QR_WINDOW_SECONDS } from '../server/booking.js';
import { createStaff } from '../server/staff.js';

function setup() {
  let clock = new Date('2026-09-25T12:00:00Z');
  const db = openDb(':memory:');
  seedEvents(db, clock);
  const booking = createBooking(db, { now: () => clock });
  const event = booking.listEvents()[0];
  return { db, booking, event, tick: (min) => (clock = new Date(clock.getTime() + min * 60e3)), now: () => clock };
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
  assert.equal(booking.checkIn(`https://mt.bar/ticket.html?t=${code}`, { eventId: event.id }).result, 'ok');
  assert.equal(booking.checkIn(code, { eventId: event.id }).result, 'already_used');
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

test('живой QR гасит билет один раз, а скриншот старше минуты не проходит', () => {
  const { booking, event, tick } = setup();
  tick(6 * 60); // вечер события
  const held = booking.hold(event.id, [{ tableId: 'K26', seats: 2 }]);
  const paid = booking.pay(held.secret, guest);
  const [a, b] = paid.tickets.map((t) => t.code);

  const live = booking.liveTickets([a, b, 'NOPE12345678']);
  assert.deepEqual(Object.keys(live.tickets).sort(), [a, b].sort());
  const token = live.tickets[a].qr;
  assert.equal(booking.checkIn(`https://mt.bar/c/${token}`, { by: 'staff:1', requireSigned: true }).result, 'ok');
  assert.equal(booking.checkIn(`https://mt.bar/c/${token}`, { by: 'staff:1', requireSigned: true }).result, 'already_used');
  assert.equal(booking.liveTickets([a]).tickets[a].status, 'used');
  assert.equal(booking.liveTickets([a]).tickets[a].qr, undefined, 'у погашенного билета QR больше нет');

  const old = booking.liveTickets([b]).tickets[b].qr;
  tick((QR_WINDOW_SECONDS * 2 + 1) / 60);
  assert.equal(booking.checkIn(old, { requireSigned: true }).result, 'expired_qr');
  const gateB = booking.liveTickets([b]).tickets[b].qr.split('.')[0];
  assert.equal(booking.checkIn(`${gateB}.${'A'.repeat(12)}`, {}).result, 'expired_qr', 'подделанная подпись');
  assert.equal(booking.checkIn(b, { requireSigned: true }).result, 'expired_qr', 'со сканера нужен живой QR');
  assert.equal(booking.checkIn(b, { by: 'staff:1' }).result, 'expired_qr', 'полный код билета контролёру не годится');
  const pin = booking.liveTickets([b]).tickets[b].pin;
  assert.match(pin, /^[A-Z2-9]{6}$/);
  const staffView = booking.checkIn(pin.toLowerCase(), { by: 'staff:1' });
  assert.equal(staffView.result, 'ok', 'короткий код для входа');
  assert.equal(staffView.ticket.order, undefined, 'контролёр не видит номер заказа');
  assert.equal(booking.checkIn('ZZZZZZ', { by: 'staff:1' }).result, 'expired_qr');
});

test('контролёр пропускает только на события этого вечера', () => {
  const { booking, tick } = setup();
  const later = booking.listEvents().at(-1);
  const held = booking.hold(later.id, [{ tableId: later.halls[0] === 'main' ? 'M3' : 'K29', seats: 1 }]);
  const paid = booking.pay(held.secret, guest);
  const t = paid.tickets[0].code;
  assert.equal(booking.checkIn(booking.liveTickets([t]).tickets[t].qr, { by: 'staff:1' }).result, 'wrong_day');
  tick((new Date(later.starts_at) - Date.parse('2026-09-25T12:00:00Z')) / 60e3 - 60);
  assert.equal(booking.checkIn(booking.liveTickets([t]).tickets[t].qr, { by: 'staff:1' }).result, 'ok');
});

test('приглашение контролёра одноразовое и истекает, телефон можно отключить', () => {
  const { db, tick, now } = setup();
  const staff = createStaff(db, { now });
  const inv = staff.invite('Саша');
  const { token } = staff.activate(inv.code);
  assert.throws(() => staff.activate(inv.code), (e) => e.status === 410);
  assert.equal(staff.authenticate(token).name, 'Саша');
  assert.equal(staff.authenticate('x'.repeat(43)), null);
  const late = staff.invite('Лена');
  tick(16);
  assert.throws(() => staff.activate(late.code), (e) => e.status === 410);
  staff.revoke(staff.authenticate(token).id);
  assert.equal(staff.authenticate(token), null);
});

test('на отменённое событие не пускают и QR не выдают', () => {
  const { booking, event, tick } = setup();
  tick(6 * 60);
  const paid = booking.pay(booking.hold(event.id, [{ tableId: 'K32', seats: 1 }]).secret, guest);
  const c = paid.tickets[0].code;
  const qr = booking.liveTickets([c]).tickets[c].qr;
  booking.setEventStatus(event.id, 'cancelled');
  assert.equal(booking.liveTickets([c]).tickets[c].qr, undefined);
  assert.equal(booking.checkIn(qr, { by: 'staff:1' }).result, 'event_cancelled');
});

test('бронь нельзя оплатить, если событие закрыли во время оформления', () => {
  const { booking, event } = setup();
  const held = booking.hold(event.id, [{ tableId: 'K31', seats: 2 }]);
  assert.ok(held.expiresIn > 500 && held.expiresIn <= 600);
  booking.setEventStatus(event.id, 'cancelled');
  assert.throws(() => booking.pay(held.secret, guest), (e) => e.status === 409);
  assert.equal(booking.getOrder({ secret: held.secret }).status, 'cancelled');
  assert.equal(booking.availability(event.id).tables.K31.free, 4, 'места вернулись');
});

test('админ не может вернуть заказ, по которому гости уже прошли', () => {
  const { booking, event } = setup();
  const paid = booking.pay(booking.hold(event.id, [{ tableId: 'K33', seats: 2 }]).secret, guest);
  booking.checkIn(paid.tickets[0].code, { eventId: event.id });
  assert.throws(() => booking.adminRefund(paid.code), (e) => e.status === 409);
});

test('время открытия дверей проверяется', () => {
  const { booking } = setup();
  const base = { title: 'Вечер', startsAt: '2026-10-10T21:00', price: 1000, halls: ['main'] };
  assert.throws(() => booking.createEvent({ ...base, doorsAt: 'завтра' }), (e) => e.status === 400);
  assert.throws(() => booking.createEvent({ ...base, doorsAt: '2026-10-10T22:00' }), (e) => e.status === 400);
  assert.equal(booking.createEvent(base).title, 'Вечер');
});

test('по фото QR нельзя получить новые QR: в QR нет кода билета', () => {
  const { booking, event, tick } = setup();
  tick(6 * 60);
  const paid = booking.pay(booking.hold(event.id, [{ tableId: 'K24', seats: 1 }]).secret, guest);
  const code = paid.tickets[0].code;
  const qr = booking.liveTickets([code]).tickets[code].qr;
  const gate = qr.split('.')[0];
  assert.ok(!qr.includes(code), 'QR не содержит код билета');
  assert.deepEqual(booking.liveTickets([gate]).tickets, {}, 'номер из QR не выдаёт живые QR');
  assert.throws(() => booking.getTicket(gate), (e) => e.status === 404, 'номер из QR не открывает билет');
  const r = booking.checkIn(qr, { by: 'staff:1', requireSigned: true });
  assert.equal(r.result, 'ok');
  assert.equal(r.ticket.code, undefined, 'контролёру не отдаём код билета');
});
