import { describe, expect, it } from 'vitest';
import { passwordScore, validateNickname, validatePassword } from './validation';

describe('validateNickname', () => {
  it.each(['T-SHY', 'VOVA', 'Тимур_01', 'a.b'])('принимает %s', (v) => expect(validateNickname(v)).toBeNull());
  it.each(['a', '', 'x'.repeat(21), '<script>', 'эмодзи🙂'])('отклоняет %s', (v) =>
    expect(validateNickname(v)).not.toBeNull(),
  );
});

describe('validatePassword', () => {
  it('нужны 8 символов, буквы и цифры', () => {
    expect(validatePassword('short1')).not.toBeNull();
    expect(validatePassword('onlyletters')).not.toBeNull();
    expect(validatePassword('12345678')).not.toBeNull();
    expect(validatePassword('hunter2hunter2')).toBeNull();
  });
});

describe('passwordScore', () => {
  it('растёт с длиной и разнообразием', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('abc')).toBe(1);
    expect(passwordScore('abcdefgh')).toBe(1);
    expect(passwordScore('abcdefg1')).toBe(2);
    expect(passwordScore('abcdefg1!')).toBe(3);
    expect(passwordScore('abcdefg1!xyz')).toBe(4);
  });
});
