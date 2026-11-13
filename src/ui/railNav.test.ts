import { describe, expect, it } from 'vitest';
import { pickActive } from './railNav';

describe('pickActive', () => {
  it('самый точный пункт по адресу', () => {
    expect(pickActive('/', null)).toBe('/');
    expect(pickActive('/fantasy/rules', null)).toBe('/fantasy/rules');
    expect(pickActive('/fantasy/squad', null)).toBe('/fantasy');
  });

  it('«Рейтинг» и «Лига друзей» — подсвечен тот, по которому нажали', () => {
    expect(pickActive('/league/abc', '/league#friends')).toBe('/league#friends');
    expect(pickActive('/league/abc', '/league')).toBe('/league');
  });

  it('без нажатия на экране лиги — «Лига друзей», а не оба сразу', () => {
    expect(pickActive('/league/abc', null)).toBe('/league#friends');
    expect(pickActive('/league/abc', '/predict')).toBe('/league#friends');
  });
});
