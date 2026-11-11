import { describe, expect, it } from 'vitest';
import { siteUrlFor } from './env';

describe('siteUrlFor — адрес возврата после входа совпадает с Redirect URLs в Supabase', () => {
  it('локально: без слэша', () => expect(siteUrlFor('/', 'http://localhost:5173')).toBe('http://localhost:5173'));
  it('Pages: со слэшем', () =>
    expect(siteUrlFor('/gridline-v2/', 'https://pufixluv1984-bit.github.io')).toBe('https://pufixluv1984-bit.github.io/gridline-v2/'));
});
