import { afterEach, describe, expect, it } from 'vitest';
import { setDictForTests, t } from './index';
import { browserLocale } from './locale';
import en from './en';
import ru from './ru';
import uk from './uk';

afterEach(() => setDictForTests('ru', ru));

describe('язык по браузеру', () => {
  it('украинский, русский, остальные — английский', () => {
    expect(browserLocale(['uk-UA', 'en-US'])).toBe('uk');
    expect(browserLocale(['ru-RU'])).toBe('ru');
    expect(browserLocale(['be-BY'])).toBe('ru');
    expect(browserLocale(['de-DE', 'en-GB'])).toBe('en');
    expect(browserLocale(['fr-FR'])).toBe('en');
    expect(browserLocale([])).toBe('en');
  });
});

describe('t()', () => {
  it('подставляет параметры', () => {
    expect(t('footer.season', { year: 2027 })).toBe('сезон 2027');
    setDictForTests('en', en);
    expect(t('auth.signInWith', { provider: 'Discord' })).toBe('Sign in with Discord');
  });
  it('склоняет по правилам языка', () => {
    expect(t('time.minutesAgo', { n: 1 })).toBe('1 минуту назад');
    expect(t('time.minutesAgo', { n: 3 })).toBe('3 минуты назад');
    expect(t('time.minutesAgo', { n: 11 })).toBe('11 минут назад');
    setDictForTests('uk', uk);
    expect(t('time.minutesAgo', { n: 22 })).toBe('22 хвилини тому');
    expect(t('time.minutesAgo', { n: 25 })).toBe('25 хвилин тому');
    setDictForTests('en', en);
    expect(t('time.minutesAgo', { n: 1 })).toBe('1 minute ago');
    expect(t('time.minutesAgo', { n: 5 })).toBe('5 minutes ago');
  });
});

describe('словари', () => {
  it('во всех трёх языках одинаковые ключи и нет пустых строк', () => {
    const keys = Object.keys(ru).sort();
    for (const d of [uk, en]) {
      expect(Object.keys(d).sort()).toEqual(keys);
      for (const v of Object.values(d)) {
        const parts = typeof v === 'string' ? [v] : Object.values(v);
        for (const p of parts) expect(p.trim()).not.toBe('');
      }
    }
  });
  it('подстановки {…} совпадают с русским оригиналом', () => {
    const vars = (v: unknown) =>
      [...new Set((typeof v === 'string' ? v : Object.values(v as object).join(' ')).match(/\{\w+\}/g) ?? [])].sort();
    for (const k of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(vars(uk[k]), `uk ${k}`).toEqual(vars(ru[k]));
      expect(vars(en[k]), `en ${k}`).toEqual(vars(ru[k]));
    }
  });
});
