import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it.each([
    ['T-SHY', 'TS'],
    ['pufixluv', 'PU'],
    ['Игрок 4444', 'И4'],
    ['vova', 'VO'],
  ])('%s → %s', (nick, want) => expect(initialsOf(nick)).toBe(want));
  it('пустой ник — заглушка', () => expect(initialsOf('')).toBe('··'));
});
