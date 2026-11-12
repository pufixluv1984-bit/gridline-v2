// Перевод текстов из базы (таблицы — src/i18n/dbText.ts, грузятся отдельным чанком).
// Работает в обе стороны: строку на любом из трёх языков переводит на текущий. Поэтому при смене языка
// уже загруженные данные (кэш TanStack Query) переводятся на месте, без повторных запросов.
import type { Locale } from './locale';

type Pattern = { re: RegExp[]; out: string };
type Table = { exact: Map<string, string>; patterns: Pattern[]; short: Map<string, string> };

const IDX: Record<Locale, 0 | 1 | 2> = { ru: 0, uk: 1, en: 2 };
let table: Table | null = null;

/** Поля, где лежит то, что ввёл игрок: их не трогаем, даже если ник совпал с названием команды. */
const USER_KEYS = new Set(['nickname', 'avatar_text', 'full_name', 'invite_code', 'email']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = (tpl: string) => new RegExp(`^${tpl.split(/\{\d\}/).map(esc).join('(.+?)')}$`);

/** Грузит таблицы для языка. Для русского до первой смены языка не нужно ничего: база и так по-русски. */
export async function loadDbText(l: Locale): Promise<void> {
  if (l === 'ru' && !table) return;
  const m = await import('./dbText');
  const i = IDX[l];
  const exact = new Map<string, string>();
  const add = (row: readonly string[]) => row.slice(0, 3).forEach((s) => exact.set(s, row[i]!));
  [m.COUNTRIES, m.TEAMS, m.DRIVERS, m.PRICE_REASONS, m.ERRORS].forEach((rows) => rows.forEach(add));
  m.GRANDS_PRIX.forEach(add);
  const patterns = m.PATTERNS.map((row) => ({ re: row.map(compile), out: row[i] }));
  const short = new Map<string, string>(l === 'en' ? m.GRANDS_PRIX.map((g) => [g[2], g[3]]) : []);
  table = { exact, patterns, short };
}

/** Одна строка из базы → текущий язык. Незнакомая строка возвращается как есть. */
export function dbText(s: string): string {
  if (!table) return s;
  const hit = table.exact.get(s);
  if (hit !== undefined) return hit;
  for (const p of table.patterns) {
    for (const re of p.re) {
      const m = re.exec(s);
      if (m) return p.out.replace(/\{(\d)\}/g, (_, n: string) => dbText(m[Number(n)] ?? ''));
    }
  }
  return s;
}

/** Короткое имя этапа на английском: «Australian Grand Prix» → «Australia». */
export const dbShortGp = (name: string): string | undefined => table?.short.get(name);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** Переводит все строки в ответе (объекты и массивы любой глубины). Ничего не изменилось — тот же объект. */
export function translateDeep<T>(v: T): T {
  if (!table) return v;
  if (typeof v === 'string') return dbText(v) as T;
  if (Array.isArray(v)) {
    let out: unknown[] | null = null;
    v.forEach((x, k) => {
      const y = translateDeep(x);
      if (y !== x) (out ??= [...v])[k] = y;
    });
    return (out ?? v) as T;
  }
  if (isPlain(v)) {
    let out: Record<string, unknown> | null = null;
    for (const [k, x] of Object.entries(v)) {
      if (USER_KEYS.has(k)) continue;
      const y = translateDeep(x);
      if (y !== x) (out ??= { ...v })[k] = y;
    }
    return (out ?? v) as T;
  }
  return v;
}

/**
 * fetch для клиента Supabase: ответы PostgREST (данные и ошибки) приходят уже на языке игрока.
 * Остальные запросы (вход, Storage, функции) проходят без изменений.
 */
export async function translatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!table || !url.includes('/rest/v1/') || !(res.headers.get('content-type') ?? '').includes('json')) return res;
  const text = await res.text();
  let body = text;
  try {
    const parsed: unknown = JSON.parse(text);
    const out = translateDeep(parsed);
    if (out !== parsed) body = JSON.stringify(out);
  } catch {
    /* не JSON — отдаём как пришло */
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(text === '' ? null : body, { status: res.status, statusText: res.statusText, headers });
}
