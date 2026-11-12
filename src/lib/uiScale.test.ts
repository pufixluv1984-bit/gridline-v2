import { describe, expect, it } from 'vitest';
import { uiScaleFor } from './uiScale';

describe('uiScaleFor', () => {
  it('до 1440 — макет как есть', () => {
    expect(uiScaleFor(1100)).toBe(1);
    expect(uiScaleFor(1440)).toBe(1);
  });
  it('между 1440 и 2016 — раскладка остаётся шириной 1440', () => {
    expect(uiScaleFor(1920)).toBeCloseTo(1920 / 1440);
  });
  it('2K и шире — ×1.4, как в макетах 2K', () => {
    expect(uiScaleFor(2560)).toBe(1.4);
    expect(uiScaleFor(8000)).toBe(1.4);
  });
});
