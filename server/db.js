import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  lineup TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,          -- ISO, время начала
  doors_at TEXT NOT NULL,           -- ISO, открытие дверей
  halls TEXT NOT NULL,              -- JSON-массив id залов в продаже
  price INTEGER NOT NULL,           -- цена места в зоне standard, ₽
  deposit INTEGER NOT NULL DEFAULT 0, -- часть цены, которая уходит в депозит на меню
  genre TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'on_sale' -- on_sale | closed | cancelled
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- номер заказа, который видит гость
  secret TEXT UNIQUE NOT NULL,      -- токен доступа к заказу без телефона
  event_id INTEGER NOT NULL REFERENCES events(id),
  status TEXT NOT NULL,             -- held | paid | expired | cancelled | refunded
  name TEXT, phone TEXT, email TEXT,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,                  -- до какого момента держится бронь (для held)
  paid_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_event ON orders(event_id, status);
CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- код в QR, по нему проходят на входе
  order_id INTEGER NOT NULL REFERENCES orders(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  table_id TEXT NOT NULL,
  seat_no INTEGER NOT NULL,
  price INTEGER NOT NULL,
  whole_table INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,             -- held | active | used | released | cancelled
  guest_name TEXT,
  checked_in_at TEXT
);
-- Одно место на событии может принадлежать только одному живому билету.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_seat_taken
  ON tickets(event_id, table_id, seat_no) WHERE status IN ('held', 'active', 'used');
CREATE INDEX IF NOT EXISTS tickets_order ON tickets(order_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Телефоны контролёров. Храним только хэш токена из cookie.
CREATE TABLE IF NOT EXISTS staff_devices (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

-- Одноразовые приглашения, по которым телефон становится контролёром.
CREATE TABLE IF NOT EXISTS staff_invites (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code_hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_log (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER, order_id INTEGER,
  action TEXT NOT NULL,
  at TEXT NOT NULL,
  note TEXT
);
`;

// Номер для входа (gate_id): его несёт QR. Он отделён от кода билета, иначе по фото
// чужого QR можно было бы получать свежие QR и войти раньше владельца.
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
  if (!cols.includes('gate_id')) db.exec('ALTER TABLE tickets ADD COLUMN gate_id TEXT');
  const missing = db.prepare('SELECT id FROM tickets WHERE gate_id IS NULL').all();
  const set = db.prepare('UPDATE tickets SET gate_id = ? WHERE id = ?');
  for (const { id } of missing) set.run(randomBytes(9).toString('base64url'), id);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS tickets_gate_id ON tickets(gate_id)');
  // онлайн-оплата: платёж ЮKassa у заказа и сколько по нему уже вернули
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!orderCols.includes('payment_id')) db.exec('ALTER TABLE orders ADD COLUMN payment_id TEXT');
  if (!orderCols.includes('payment_url')) db.exec('ALTER TABLE orders ADD COLUMN payment_url TEXT');
  if (!orderCols.includes('payment_status')) db.exec('ALTER TABLE orders ADD COLUMN payment_status TEXT');
  // когда покупатель дал согласие на обработку персональных данных (152-ФЗ)
  if (!orderCols.includes('consent_at')) db.exec('ALTER TABLE orders ADD COLUMN consent_at TEXT');
  if (!orderCols.includes('refunded_amount')) db.exec('ALTER TABLE orders ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS orders_payment ON orders(payment_id) WHERE payment_id IS NOT NULL');
  // цена, за которую билет оплатили: по ней считаются возвраты, даже если админ потом поменял цену
  // постер события
  const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (!eventCols.includes('image')) db.exec('ALTER TABLE events ADD COLUMN image TEXT');
  // событие по умолчанию 25 октября: если его ещё не меняли, подставляем данные с афиши
  db.prepare("UPDATE events SET title = ?, genre = ?, lineup = ?, description = ?, image = ? WHERE slug = 'karaoke-25-october' AND title = 'Караоке-вечер'")
    .run(DEFAULT_EVENT.title, DEFAULT_EVENT.genre, DEFAULT_EVENT.lineup, DEFAULT_EVENT.description, DEFAULT_EVENT.image);
  // начало перенесли с 21:00 на 16:00 и сократили описание; правки из админки не трогаем
  db.prepare("UPDATE events SET starts_at = '2026-10-25T06:00:00.000Z', doors_at = '2026-10-25T05:00:00.000Z' WHERE slug = 'karaoke-25-october' AND starts_at = '2026-10-25T11:00:00.000Z'").run();
  db.prepare("UPDATE events SET description = ? WHERE slug = 'karaoke-25-october' AND description = ?").run(DEFAULT_EVENT.description, OLD_DESCRIPTION);
  const ticketCols = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
  if (!ticketCols.includes('paid_price')) db.exec('ALTER TABLE tickets ADD COLUMN paid_price INTEGER');
}

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Транзакция поверх синхронного драйвера: весь блок выполняется атомарно,
// поэтому два гостя не могут занять одно место одновременно.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function at(date, hh, mm) {
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

// Афиша по умолчанию: один вечер 25 октября 2026. Сидится только в пустую базу,
// остальные события заводятся в админке.
// Событие по умолчанию — с афиши бара: отчётный концерт 25 октября
const OLD_DESCRIPTION = 'Отчётный концерт и открытый микрофон в караоке-баре МТ. На сцену выйдут те, кто готовил песни вместе с Rock Some!, и приглашённые артисты. В программе розыгрыш сертификатов от партнёров. Хотите выступить сами? Подготовка начинается 1 октября, участие стоит 1000\u00a0₽.';
export const DEFAULT_EVENT = {
  title: 'Отчётный концерт × Открытый микрофон',
  genre: 'Концерт',
  lineup: 'Rock Some! и приглашённые артисты',
  description: 'Выступят те, кто готовил песни с Rock Some!, и приглашённые артисты. Разыграем сертификаты от партнёров. Хотите выступить сами? Подготовка с 1 октября, участие 1000\u00a0₽.',
  image: '/img/events/otchetny-koncert-25-10.jpg',
};

export function seedEvents(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (n > 0) return;
  const d = new Date(2026, 9, 25);
  const e = DEFAULT_EVENT;
  db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('karaoke-25-october', e.title, e.lineup, e.description,
      at(d, 16, 0), at(d, 15, 0), JSON.stringify(['karaoke', 'main']), 1000, 500, e.genre, e.image);
}
