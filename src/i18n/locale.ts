// Языки сайта: украинский, русский, английский. Выбор хранится в профиле (profiles.locale) и в браузере.

export type Locale = 'uk' | 'ru' | 'en';

export const LOCALES: { id: Locale; label: string; short: string; intl: string }[] = [
  { id: 'uk', label: 'Українська', short: 'УКР', intl: 'uk-UA' },
  { id: 'ru', label: 'Русский', short: 'РУ', intl: 'ru-RU' },
  { id: 'en', label: 'English', short: 'ENG', intl: 'en-GB' },
];

export const isLocale = (v: unknown): v is Locale => v === 'uk' || v === 'ru' || v === 'en';

const STORAGE_KEY = 'gridline:locale';

export function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLocale(l: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* без хранилища язык просто определится заново */
  }
}

/** Язык браузера: украинский → uk, русский (и белорусский, казахский) → ru, остальные → en. */
export function browserLocale(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Locale {
  for (const raw of languages) {
    const l = raw.toLowerCase();
    if (l.startsWith('uk')) return 'uk';
    if (l.startsWith('ru') || l.startsWith('be') || l.startsWith('kk')) return 'ru';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

export const detectLocale = (): Locale => storedLocale() ?? browserLocale();

// Язык, выбранный на экране входа (ещё без профиля): после входа он записывается в профиль, а не перетирается им.
const ANON_KEY = 'gridline:locale-anon';
export function markAnonPick(): void {
  try {
    sessionStorage.setItem(ANON_KEY, '1');
  } catch {
    /* не страшно */
  }
}
export function takeAnonPick(): boolean {
  try {
    const v = sessionStorage.getItem(ANON_KEY) === '1';
    sessionStorage.removeItem(ANON_KEY);
    return v;
  } catch {
    return false;
  }
}
