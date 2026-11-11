import { describe, expect, it } from 'vitest';
import { weatherIcon, weatherText, weekday } from './weather';

describe('погода', () => {
  it('коды WMO', () => {
    expect(weatherText(0)).toBe('Ясно');
    expect(weatherText(3)).toBe('Пасмурно');
    expect(weatherText(63)).toBe('Дождь');
    expect(weatherText(95)).toBe('Гроза');
    expect(weatherIcon(null)).toBe('·');
  });
  it('день недели', () => {
    expect(weekday('2026-11-20')).toBe('Пт');
    expect(weekday('2026-11-22T00:00:00Z')).toBe('Вс');
  });
});
