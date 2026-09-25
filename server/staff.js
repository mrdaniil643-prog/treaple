import { randomBytes, createHash } from 'node:crypto';
import { BookingError, cleanText } from './booking.js';
import { tx } from './db.js';

export const STAFF_COOKIE = 'mt_staff';
const INVITE_MINUTES = 15;
const DEVICE_DAYS = 30;

const hash = (s) => createHash('sha256').update(String(s)).digest('hex');

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Роль контролёра: админ создаёт одноразовое приглашение, контролёр открывает его
// на своём телефоне и получает долгую cookie. Контролёр умеет только гасить билеты.
export function createStaff(db, { now = () => new Date() } = {}) {
  const iso = () => now().toISOString();

  function invite(name) {
    const clean = cleanText(name, 60);
    if (clean.length < 2) throw new BookingError(400, 'Укажите имя контролёра');
    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(now().getTime() + INVITE_MINUTES * 60e3).toISOString();
    db.prepare('INSERT INTO staff_invites (name, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(clean, hash(code), iso(), expiresAt);
    return { code, name: clean, expiresAt };
  }

  function activate(code) {
    const row = typeof code === 'string' && code.length >= 20
      ? db.prepare('SELECT * FROM staff_invites WHERE code_hash = ?').get(hash(code)) : null;
    if (!row || row.used_at || row.expires_at <= iso()) {
      throw new BookingError(410, 'Приглашение недействительно или уже использовано. Попросите администратора создать новое.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + DEVICE_DAYS * 86400e3).toISOString();
    tx(db, () => {
      const used = db.prepare('UPDATE staff_invites SET used_at = ? WHERE id = ? AND used_at IS NULL').run(iso(), row.id);
      if (!used.changes) throw new BookingError(410, 'Приглашение уже использовано');
      db.prepare('INSERT INTO staff_devices (name, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(row.name, hash(token), iso(), expiresAt);
    });
    return { token, name: row.name, maxAge: DEVICE_DAYS * 86400 };
  }

  function authenticate(token) {
    if (!token || token.length < 30) return null;
    const d = db.prepare('SELECT * FROM staff_devices WHERE token_hash = ?').get(hash(token));
    if (!d || d.revoked_at || d.expires_at <= iso()) return null;
    db.prepare('UPDATE staff_devices SET last_used_at = ? WHERE id = ?').run(iso(), d.id);
    return { id: d.id, name: d.name };
  }

  function list() {
    return db.prepare(`SELECT d.id, d.name, d.created_at AS createdAt, d.expires_at AS expiresAt, d.last_used_at AS lastUsedAt,
        (SELECT COUNT(*) FROM ticket_log l WHERE l.action = 'checked_in' AND l.note IN ('staff:' || d.id, 'staff:' || d.id || ':manual')) AS checkins
      FROM staff_devices d WHERE d.revoked_at IS NULL AND d.expires_at > ? ORDER BY d.created_at DESC`).all(iso());
  }

  function revoke(id) {
    const r = db.prepare('UPDATE staff_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(iso(), Number(id));
    if (!r.changes) throw new BookingError(404, 'Контролёр не найден');
    return { ok: true };
  }

  return { invite, activate, authenticate, list, revoke };
}
