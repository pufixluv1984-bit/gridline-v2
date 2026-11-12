import { describe, expect, it } from 'vitest';
import { careerBio, type DriverScreen } from './drivers';

const career = (x: Partial<NonNullable<DriverScreen['career']>>) => ({ bio: null, bio_url: null, ...x }) as NonNullable<DriverScreen['career']>;

describe('биография на языке сайта', () => {
  it('берёт статью на выбранном языке', () => {
    const c = career({ bio: 'ру', bio_url: 'https://ru.wikipedia.org/wiki/A', bio_uk: 'укр', bio_url_uk: 'https://uk.wikipedia.org/wiki/A', bio_en: 'en' });
    expect(careerBio(c, 'uk')).toEqual({ text: 'укр', url: 'https://uk.wikipedia.org/wiki/A', lang: 'uk' });
    expect(careerBio(c, 'ru')?.lang).toBe('ru');
    expect(careerBio(c, 'en')).toEqual({ text: 'en', url: null, lang: 'en' });
  });

  it('нет статьи на языке — берёт ближайшую', () => {
    expect(careerBio(career({ bio: 'ру', bio_en: 'en' }), 'uk')?.lang).toBe('en');
    expect(careerBio(career({ bio: 'ру' }), 'en')?.lang).toBe('ru');
    expect(careerBio(career({}), 'ru')).toBeNull();
    expect(careerBio(null, 'ru')).toBeNull();
  });
});
