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
export function seedEvents(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (n > 0) return;
  const d = new Date(2026, 9, 25);
  db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('karaoke-25-october', 'Караоке-вечер', '', 'Караоке до утра в обоих залах.',
      at(d, 21, 0), at(d, 19, 30), JSON.stringify(['karaoke', 'main']), 1000, 500, 'Караоке');
}
