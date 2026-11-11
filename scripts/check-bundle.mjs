// Бюджет первой загрузки (правило 11): JS, который index.html грузит сразу, ≤ 250 КБ gzip.
// Запуск после `pnpm build`: node scripts/check-bundle.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 250;
const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const files = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1].replace(/^.*?assets\//, 'assets/'));
let total = 0;
for (const f of files) {
  const kb = gzipSync(readFileSync(join(dist, f))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} КБ  ${f}`);
}
console.log(`${total.toFixed(1).padStart(7)} КБ  итого (лимит ${LIMIT_KB})`);
if (total > LIMIT_KB) {
  console.error('Первая загрузка больше бюджета. Вынеси тяжёлое в React.lazy.');
  process.exit(1);
}
