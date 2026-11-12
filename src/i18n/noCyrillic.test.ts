import { describe, expect, it } from 'vitest';

// Весь текст интерфейса живёт в словарях src/i18n. Этот тест не даст оставить в коде
// русскую или украинскую строку мимо словаря: такая строка не переведётся на другие языки.
const files = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/i18n/**', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CYRILLIC = /[Ѐ-ӿ]/;
/** Разрешённые места: наборы букв в регулярках, «г.»/«р.» в датах, префикс Гран-при, короткие названия стран. */
const ALLOWED = [/А-Яа-я/, /\(г\|р\)/, /Гран-при\|Гран-прі/, /'США'/];

function codeOnly(line: string): string {
  const s = line.trim();
  if (s.startsWith('//') || s.startsWith('/*') || s.startsWith('*')) return '';
  return line.replace(/\{?\/\*.*?\*\/\}?/g, '').replace(/(^|[^:'"`])\/\/.*$/, '$1');
}

describe('тексты интерфейса только в словарях', () => {
  it('нет кириллицы в коде вне src/i18n', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(files)) {
      src.split(/\r?\n/).forEach((line, i) => {
        const code = codeOnly(line);
        if (CYRILLIC.test(code) && !ALLOWED.some((r) => r.test(code))) bad.push(`${path}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
