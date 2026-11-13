import { describe, expect, it } from 'vitest';
import { safePath } from './errorReport';

describe('журнал ошибок: адрес страницы без секретов', () => {
  it('убирает коды приглашений и id лиг, оставляет экраны и пилотов', () => {
    expect(safePath('#/predict')).toBe('/predict');
    expect(safePath('#/join/GRID-AB12CD')).toBe('/join/:id');
    expect(safePath('#/league/1ca1cc31-409a-496a-a79a-d12af03a79da')).toBe('/league/:id');
    expect(safePath('#/drivers/max_verstappen')).toBe('/drivers/max_verstappen');
    expect(safePath('#/results/123')).toBe('/results/123');
    expect(safePath('')).toBe('/');
    expect(safePath('#/fantasy/market?x=1')).toBe('/fantasy/market');
  });
});
