// Достаёт контуры трасс из макета Tracks.dc.html (массив TRACKS) в отдельные SVG-файлы
// public/assets/tracks/<slug>.svg без изменения линий (docs/DESIGN.md, «Откуда брать ресурсы»).
// Макет — данные, код из него не выполняется: разбираем текст регулярным выражением.
// Запуск: node scripts/extract-tracks.mjs design/project/Tracks.dc.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2] ?? 'design/project/Tracks.dc.html', 'utf8');
const PATH = "'([MCLZmclz0-9 .-]*)'";
// Поля: id, name, country, d (контур), bA/bB (подложка под контуром, может быть пустой).
const re = new RegExp(
  `\\{ id: '([a-z0-9-]+)', name: '([^'<>"]+)', country: '([^'<>"]+)', d: ${PATH}(?:, bA: ${PATH})?(?:, bB: ${PATH})? \\}`,
  'g',
);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

mkdirSync('public/assets/tracks', { recursive: true });
// Переводы (name_uk, name_en) и ISO-код страны (cc) ведутся в tracks.json руками — сохраняем их.
const prev = new Map(JSON.parse(readFileSync('src/lib/tracks.json', 'utf8')).map((t) => [t.id, t]));
const list = [];
for (const [, id, name, country, d, bA, bB] of src.matchAll(re)) {
  if (!d) continue;
  // Как в макете: bB (7.5% белого), bA (4.5%), поверх — контур (data-track берёт компонент трассы).
  writeFileSync(
    `public/assets/tracks/${id}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 230"><title>${esc(name)}</title>` +
      (bB ? `<path data-bg="b" d="${bB}" fill="#fff" fill-opacity=".075"/>` : '') +
      (bA ? `<path data-bg="a" d="${bA}" fill="#fff" fill-opacity=".045"/>` : '') +
      `<path data-track="1" d="${d}" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
  );
  const p = prev.get(id) ?? {};
  if (!p.cc) console.warn(`${id}: нет перевода и кода страны (${country}) — добавь name_uk, name_en, cc в tracks.json`);
  list.push({ id, name, name_uk: p.name_uk ?? name, name_en: p.name_en ?? name, cc: p.cc ?? '' });
}
writeFileSync('src/lib/tracks.json', JSON.stringify(list, null, 1) + '\n');
console.log(`трасс: ${list.length}`);
