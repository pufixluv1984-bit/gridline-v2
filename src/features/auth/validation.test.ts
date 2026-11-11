import { describe, expect, it } from 'vitest';
import { validateNickname } from './validation';

describe('validateNickname', () => {
  it.each(['T-SHY', 'VOVA', 'Тимур_01', 'a.b'])('принимает %s', (v) => expect(validateNickname(v)).toBeNull());
  it.each(['a', '', 'x'.repeat(21), '<script>', 'эмодзи🙂'])('отклоняет %s', (v) =>
    expect(validateNickname(v)).not.toBeNull(),
  );
});
