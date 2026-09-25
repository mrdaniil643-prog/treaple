// Проверка синтаксиса всех JS-модулей сайта (отдельного линтера в проекте нет).
// Запуск: npm run lint [файлы...]
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dirs = ['server', 'public/js', 'test', 'scripts', 'tools/claude-demo/src/js'];
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return f === 'node_modules' || f === 'build' ? [] : walk(p);
  return /\.m?js$/.test(f) ? [p] : [];
});
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : dirs.flatMap(walk);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗ ${f}\n${e.stderr}`);
  }
}
console.log(failed ? `Ошибки в ${failed} из ${files.length} файлов` : `Синтаксис в порядке: ${files.length} файлов`);
process.exit(failed ? 1 : 0);
