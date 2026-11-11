import { describe, expect, it } from 'vitest';
import { parseInviteCode } from './invite';

describe('parseInviteCode', () => {
  it.each([
    ['k7q2xm', 'K7Q2XM'],
    ['  K7Q2XM ', 'K7Q2XM'],
    ['https://pufixluv1984-bit.github.io/gridline-v2/#/join/K7Q2XM', 'K7Q2XM'],
  ])('%s → %s', (raw, want) => expect(parseInviteCode(raw)).toBe(want));
  it.each(['', 'ABC', 'O0I1LL', 'привет'])('мусор «%s» → null', (raw) => expect(parseInviteCode(raw)).toBeNull());
});
