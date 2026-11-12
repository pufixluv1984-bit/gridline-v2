import { describe, expect, it } from 'vitest';
import { ago, countdownParts, formatDateTime, formatRange, formatTime, lapTime, plural } from './format';

describe('countdownParts', () => {
  it('раскладывает остаток', () => {
    expect(countdownParts(((2 * 24 + 3) * 60 + 4) * 60_000 + 5_000)).toEqual({ d: '02', h: '03', m: '04', s: '05', done: false });
  });
  it('после дедлайна — нули', () => {
    expect(countdownParts(-1000)).toEqual({ d: '00', h: '00', m: '00', s: '00', done: true });
  });
});

describe('форматы в поясе игрока', () => {
  const qualy = '2026-11-21T04:00:00Z';
  it('Москва: 07:00', () => expect(formatTime(qualy, 'Europe/Moscow')).toBe('07:00'));
  it('Лас-Вегас: 20:00 пятницы', () => {
    expect(formatTime(qualy, 'America/Los_Angeles')).toBe('20:00');
    expect(formatDateTime(qualy, 'America/Los_Angeles')).toMatch(/^пт, 20 ноября, 20:00$/);
  });
  it('диапазон дат этапа', () => {
    expect(formatRange('2026-11-20T02:30:00Z', '2026-11-22T04:00:00Z', 'Europe/Moscow')).toBe('20–22 нояб.');
    expect(formatRange('2026-11-27T13:30:00Z', '2026-12-01T16:00:00Z', 'Europe/Moscow')).toBe('27 нояб. – 1 дек.');
  });
});

describe('склонения', () => {
  it.each([
    [1, 'минуту'],
    [2, 'минуты'],
    [5, 'минут'],
    [11, 'минут'],
    [21, 'минуту'],
    [24, 'минуты'],
  ])('%i %s', (n, w) => expect(plural(n, 'минуту', 'минуты', 'минут')).toBe(w));
  it('ago', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(ago('2026-11-11T11:56:00Z', now)).toBe('4 минуты назад');
    expect(ago('2026-11-11T11:59:50Z', now)).toBe('только что');
    expect(ago('2026-11-11T09:00:00Z', now)).toBe('3 часа назад');
  });
});

describe('lapTime', () => {
  it('минуты и секунды', () => expect(lapTime(71717)).toBe('1:11.717'));
  it('с ведущим нулём секунд', () => expect(lapTime(65004)).toBe('1:05.004'));
  it('меньше минуты', () => expect(lapTime(59001)).toBe('59.001'));
});
