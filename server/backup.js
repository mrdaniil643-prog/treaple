// Резервные копии базы: снимок раз в сутки и при запуске, хранятся последние BACKUP_KEEP.
// VACUUM INTO пишет целостную копию, не останавливая продажи.
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 864e5;

export function createBackups(db, { dir, keep = 14, now = () => new Date() }) {
  mkdirSync(dir, { recursive: true });

  function list() {
    return readdirSync(dir).filter((f) => /^mt-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  }

  // Одна копия на день: повторный запуск в тот же день её не перезаписывает
  function run() {
    const file = join(dir, `mt-${now().toISOString().slice(0, 10)}.db`);
    if (!existsSync(file)) db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    const files = list();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f));
    return file;
  }

  function start() {
    const safe = () => {
      try { run(); } catch (e) { console.error('Резервная копия не записалась:', e.message); }
    };
    safe();
    setInterval(safe, DAY / 4).unref(); // проверяем 4 раза в сутки, копия пишется раз в день
  }

  return { run, list, start };
}
