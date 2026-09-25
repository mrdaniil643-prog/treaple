import { DatabaseSync } from 'node:sqlite';
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

CREATE TABLE IF NOT EXISTS ticket_log (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER, order_id INTEGER,
  action TEXT NOT NULL,
  at TEXT NOT NULL,
  note TEXT
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
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

export function seedEvents(db, now = new Date()) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM events').get();
  if (n > 0) return;
  const day = (offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };
  // Ближайшие пятница и суббота
  const toFri = (5 - now.getDay() + 7) % 7;
  const plan = [
    {
      slug: 'karaoke-friday', off: toFri, title: 'Караоке-пятница',
      lineup: 'Ведущий Артём Лис, диджей Mira',
      description: 'Большая пятничная ночь у микрофона: очередь на сцену, песни по заявкам с QR-кода на столе и батл столов в полночь. Победители получают сет шотов.',
      genre: 'Караоке', start: [21, 0], doors: [19, 30], halls: ['karaoke', 'main'], price: 1000, deposit: 500,
    },
    {
      slug: 'rock-cover-saturday', off: toFri + 1, title: 'Рок-каверы вживую',
      lineup: 'Группа «Громкая связь»',
      description: 'Три сета главных рок-хитов от девяностых до сегодня. Между сетами открываем микрофон для гостей — можно спеть с живой группой.',
      genre: 'Живой звук', start: [21, 30], doors: [20, 0], halls: ['karaoke', 'main'], price: 1500, deposit: 700,
    },
    {
      slug: 'duets-night', off: toFri + 6, title: 'Ночь дуэтов',
      lineup: 'Ведущие Катя Рэй и Дима Соль',
      description: 'Поём только вдвоём. Приходите парой или найдите партнёра за соседним столом — ведущие помогут. Лучший дуэт вечера выбирает зал.',
      genre: 'Караоке', start: [21, 0], doors: [19, 30], halls: ['karaoke'], price: 900, deposit: 500,
    },
    {
      slug: 'nineties-party', off: toFri + 7, title: 'Дискотека 90-х',
      lineup: 'DJ Вова Кассета',
      description: 'Всё, что играло на кассетах и по радио: от «Руки вверх» до Spice Girls. Дресс-код приветствуется, за лучший образ — бутылка игристого.',
      genre: 'Вечеринка', start: [22, 0], doors: [20, 30], halls: ['karaoke', 'main'], price: 1200, deposit: 600,
    },
    {
      slug: 'jazz-standards', off: toFri + 12, title: 'Джазовые стандарты',
      lineup: 'Трио Анны Верес',
      description: 'Спокойный вечер в основном зале: контрабас, рояль и голос. Хороший повод попробовать авторские коктейли и морское плато.',
      genre: 'Живой звук', start: [20, 0], doors: [19, 0], halls: ['main'], price: 1300, deposit: 800,
    },
  ];
  const ins = db.prepare(`INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const e of plan) {
    const d = day(e.off);
    ins.run(e.slug, e.title, e.lineup, e.description, at(d, ...e.start), at(d, ...e.doors), JSON.stringify(e.halls), e.price, e.deposit, e.genre);
  }
}
