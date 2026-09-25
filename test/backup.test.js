import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createBackups } from '../server/backup.js';

test('резервная копия пишется раз в день, старые удаляются', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mt-backup-'));
  try {
    const db = openDb(join(dir, 'mt.db'));
    db.prepare("INSERT INTO events (slug, title, lineup, description, starts_at, doors_at, halls, price, deposit, genre) VALUES ('x', 'Вечер', '', '', '2026-10-25T18:00:00Z', '2026-10-25T17:00:00Z', '[\"main\"]', 1000, 0, '')").run();
    let day = new Date('2026-10-01T10:00:00Z');
    const backups = createBackups(db, { dir: join(dir, 'backups'), keep: 3, now: () => day });
    const first = backups.run();
    assert.equal(backups.run(), first, 'второй запуск в тот же день не создаёт новую копию');
    const copy = new DatabaseSync(first, { readOnly: true });
    assert.equal(copy.prepare('SELECT title FROM events').get().title, 'Вечер', 'в копии есть данные');
    copy.close();
    for (let i = 0; i < 5; i++) { day = new Date(day.getTime() + 864e5); backups.run(); }
    assert.deepEqual(backups.list(), ['mt-2026-10-04.db', 'mt-2026-10-05.db', 'mt-2026-10-06.db']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
