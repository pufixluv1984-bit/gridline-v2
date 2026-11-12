import { currentLocale, intlLocale } from './index';

/** Короткие и привычные формы, которые Intl пишет длинно или иначе. */
const SHORT: Partial<Record<string, Record<string, string>>> = {
  US: { ru: 'США', uk: 'США', en: 'USA' },
  AE: { ru: 'ОАЭ', uk: 'ОАЕ', en: 'UAE' },
  GB: { uk: 'Велика Британія', en: 'Great Britain' },
};

/** Название страны по ISO-коду на языке сайта: «IT» → «Италия» / «Італія» / «Italy». */
export function regionName(code: string): string {
  const short = SHORT[code]?.[currentLocale()];
  if (short) return short;
  try {
    return new Intl.DisplayNames([intlLocale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
