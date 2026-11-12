import { describe, expect, it } from 'vitest';
import { isWideLayout, uiScaleFor } from './uiScale';

describe('uiScaleFor', () => {
  it('до 1440 — макет как есть', () => {
    expect(uiScaleFor(1100)).toBe(1);
    expect(uiScaleFor(1440)).toBe(1);
  });
  it('между 1440 и 2016 — раскладка остаётся шириной 1440', () => {
    expect(uiScaleFor(1920)).toBeCloseTo(1920 / 1440);
  });
  it('2K — ×1.4, как в макетах 2K', () => {
    expect(uiScaleFor(2560)).toBe(1.4);
  });
  it('выше 2K плавно растёт до ×1.7 на 4K и дальше не растёт', () => {
    expect(uiScaleFor(3200)).toBeCloseTo(1.55);
    expect(uiScaleFor(3840)).toBeCloseTo(1.7);
    expect(uiScaleFor(8000)).toBe(1.7);
  });
});

describe('isWideLayout', () => {
  it('2K и уже — обычный режим', () => {
    expect(isWideLayout(1440)).toBe(false);
    expect(isWideLayout(2560)).toBe(false);
  });
  it('4K и сильное отдаление — меню закреплено', () => {
    expect(isWideLayout(3840)).toBe(true);
    expect(isWideLayout(8000)).toBe(true);
  });
});
