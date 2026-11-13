import { describe, expect, it } from 'vitest';
import { blockState, canMove, emptyExtras, emptyPicks, extrasFrom, filledIn, fromPrediction, isComplete, move, pick, sameExtras, toPrediction, usedInBlock } from './picks';

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
    expect(toPrediction(p)).toEqual({
      qualy: ['a', 'b', 'c'], race: 'abcdefghij'.split(''), sprint: [null, null, null], fastestLap: null, firstDnf: null,
    });
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

describe('спринт и дедлайны по блокам (фаза 5)', () => {
  it('спринт — свой блок топ-3, повторы внутри запрещены', () => {
    let p = pick(emptyPicks(), 15, 'norris').picks;
    p = pick(p, 16, 'norris').picks;
    expect([p[15], p[16]]).toEqual([null, 'norris']);
    expect(blockState(p, 'sprint')).toBe('partial');
    expect(usedInBlock(p, 17, 'norris')).toBe(true);
    expect(usedInBlock(p, 0, 'norris')).toBe(false);
  });

  it('прогноз без квалификации читается: пустые слоты', () => {
    const p = fromPrediction({ qualy: null, race: 'abcdefghij'.split(''), sprint: ['x', 'y', 'z'], fastest_lap: null });
    expect(blockState(p, 'qualy')).toBe('empty');
    expect(blockState(p, 'race')).toBe('full');
    expect(blockState(p, 'sprint')).toBe('full');
  });

  it('следующий слот — только среди разрешённых (закрытые блоки пропускаются)', () => {
    const r = pick(emptyPicks(), 3, 'a', (i) => i >= 3 && i <= 14);
    expect(r.next).toBe(4);
    const r2 = pick(emptyPicks(), 14, 'none', (i) => i >= 3 && i <= 14);
    expect(r2.next).toBe(3);
  });

  it('перетаскивание: на занятое место — обмен, на пустое — переезд', () => {
    let p = pick(emptyPicks(), 3, 'max').picks; // P1
    p = pick(p, 4, 'kimi').picks; // P2
    expect(move(p, 3, 4).slice(3, 6)).toEqual(['kimi', 'max', null]);
    expect(move(p, 4, 5).slice(3, 6)).toEqual(['max', null, 'kimi']);
  });

  it('перетаскивание только внутри блока и не для бонусов', () => {
    let p = pick(emptyPicks(), 0, 'lec').picks; // поул
    p = pick(p, 13, 'nor').picks; // быстрый круг
    expect(canMove(p, 0, 3)).toBe(false); // квалификация → гонка
    expect(move(p, 0, 3)).toBe(p);
    expect(canMove(p, 13, 14)).toBe(false); // бонусы независимы
    expect(canMove(p, 1, 2)).toBe(false); // пустой слот не тащится
    expect(canMove(p, 0, 2)).toBe(true);
  });
});
