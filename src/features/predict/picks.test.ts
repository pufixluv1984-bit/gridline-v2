import { describe, expect, it } from 'vitest';
import { emptyExtras, emptyPicks, extrasFrom, filledIn, fromPrediction, isComplete, pick, sameExtras, toPrediction, usedInBlock } from './picks';

describe('picks', () => {
  it('ставит пилота и переходит к следующему пустому слоту', () => {
    const r = pick(emptyPicks(), 0, 'norris');
    expect(r.picks[0]).toBe('norris');
    expect(r.next).toBe(1);
  });

  it('в одном блоке пилот не стоит дважды: переставляется', () => {
    let p = pick(emptyPicks(), 3, 'norris').picks; // P1 гонки
    p = pick(p, 5, 'norris').picks; // P3 гонки
    expect(p[3]).toBeNull();
    expect(p[5]).toBe('norris');
  });

  it('в разных блоках один пилот допустим (поул и победа)', () => {
    let p = pick(emptyPicks(), 0, 'norris').picks;
    p = pick(p, 3, 'norris').picks;
    p = pick(p, 13, 'norris').picks;
    expect([p[0], p[3], p[13]]).toEqual(['norris', 'norris', 'norris']);
    expect(usedInBlock(p, 4, 'norris')).toBe(true);
    expect(usedInBlock(p, 1, 'norris')).toBe(true);
    expect(usedInBlock(p, 13, 'norris')).toBe(false);
  });

  it('пропускает заполненные слоты при переходе', () => {
    const p = pick(emptyPicks(), 1, 'a').picks;
    const r = pick(p, 0, 'b');
    expect(r.next).toBe(2);
  });

  it('готовность: квалификация 3 + топ-10, быстрый круг не обязателен', () => {
    const p = fromPrediction({ qualy: ['a', 'b', 'c'], race: 'abcdefghij'.split(''), fastest_lap: null });
    expect(isComplete(p)).toBe(true);
    expect(filledIn(p, 'race')).toBe(10);
    expect(toPrediction(p)).toEqual({ qualy: ['a', 'b', 'c'], race: 'abcdefghij'.split(''), fastestLap: null, firstDnf: null });
    expect(isComplete(emptyPicks())).toBe(false);
  });
});

describe('бонусы фазы 2', () => {
  it('первый сход — отдельный слот, «Никто» допустим', () => {
    const p = pick(emptyPicks(), 14, 'none').picks;
    expect(toPrediction(p).firstDnf).toBe('none');
  });
  it('в бонусах один пилот может стоять дважды (быстрый круг и первый сход)', () => {
    let p = pick(emptyPicks(), 13, 'norris').picks;
    p = pick(p, 14, 'norris').picks;
    expect([p[13], p[14]]).toEqual(['norris', 'norris']);
    expect(usedInBlock(p, 14, 'norris')).toBe(false);
  });
  it('сохранённый прогноз восстанавливается вместе с ответами и бустером', () => {
    const saved = {
      qualy: ['a', 'b', 'c'],
      race: 'abcdefghij'.split(''),
      fastest_lap: 'x',
      first_dnf: 'none',
      pole_wins: true,
      safety_car: false,
      dnf_many: null,
      boost_block: 'race' as const,
    };
    expect(fromPrediction(saved)[14]).toBe('none');
    expect(extrasFrom(saved)).toEqual({ poleWins: true, safetyCar: false, dnfMany: null, boost: 'race' });
    expect(sameExtras(extrasFrom(saved), emptyExtras())).toBe(false);
  });
});
