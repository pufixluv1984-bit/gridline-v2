// Переводы. Словари — src/i18n/{ru,uk,en}.ts; ru — источник ключей (Key), uk и en обязаны содержать все ключи (это
// проверяет TypeScript). Словарь каждого языка — отдельный чанк, грузится до первого рендера и при смене языка.
//
// t('ключ', { n: 3, name: 'Кими' }) — подстановка {name}; если значение — формы множественного числа,
// форма выбирается по n через Intl.PluralRules языка.
import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { loadDbText } from './db';
import { LOCALES, type Locale } from './locale';
import type { Key } from './ru';

export type { Key } from './ru';
export type Plural = { one: string; few?: string; many?: string; other: string };
export type Entry = string | Plural;
export type Dict = Record<Key, Entry>;

const loaders: Record<Locale, () => Promise<{ default: Dict }>> = {
  ru: () => import('./ru'),
  uk: () => import('./uk'),
  en: () => import('./en'),
};

let current: Locale = 'ru';
let dict: Partial<Dict> = {};
let rules = new Intl.PluralRules('ru-RU');

export const currentLocale = (): Locale => current;
export const intlLocale = (): string => LOCALES.find((l) => l.id === current)!.intl;

function apply(l: Locale, d: Dict) {
  current = l;
  dict = d;
  rules = new Intl.PluralRules(LOCALES.find((x) => x.id === l)!.intl);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export async function loadLocale(l: Locale): Promise<void> {
  // Тексты из базы — вместе со словарём; если их чанк не загрузился, названия просто останутся как в базе.
  const [m] = await Promise.all([loaders[l](), loadDbText(l).catch(() => undefined)]);
  apply(l, m.default);
}

/** Для тестов: словарь без динамического импорта. */
export function setDictForTests(l: Locale, d: Dict): void {
  apply(l, d);
}

export type Params = Record<string, string | number | null | undefined>;

export function t(key: Key, params?: Params): string {
  const e = dict[key];
  let s: string;
  if (e == null) s = key;
  else if (typeof e === 'string') s = e;
  else {
    const cat = rules.select(Number(params?.n ?? 0)) as keyof Plural;
    s = e[cat] ?? e.other;
  }
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k] ?? '') : m)) : s;
}

/**
 * Как t(), но подстановки — элементы React: tn('footer.madeBy', { name: <b>pufixluv</b> }).
 * Возвращает массив для вставки в JSX; порядок слов задаёт словарь каждого языка.
 */
export function tn(key: Key, nodes: Record<string, ReactNode>, params?: Params): ReactNode[] {
  return t(key, params)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part);
      return m && m[1]! in nodes ? <Fragment key={i}>{nodes[m[1]!]}</Fragment> : part;
    });
}

/** Число в формате языка: «1 234,5» / «1,234.5». */
export const num = (n: number, opts?: Intl.NumberFormatOptions): string => n.toLocaleString(intlLocale(), opts);

export type I18nCtx = { locale: Locale; setLocale: (l: Locale) => Promise<void> };
export const I18nContext = createContext<I18nCtx>({ locale: 'ru', setLocale: async () => undefined });
export const useI18n = () => useContext(I18nContext);
