import { describe, expect, it } from 'vitest';
import { clampOffset, cleanLetters, cropRect, problemText, sniffImage } from './avatar';

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe('sniffImage', () => {
  it('узнаёт JPEG, PNG и WebP по содержимому', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
  });
  it('не принимает SVG, GIF и пустой файл', () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(bytes('<?xml version="1.0"?><svg'))).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

const near = (got: Record<string, number>, want: Record<string, number>) => {
  for (const [k, v] of Object.entries(want)) expect(got[k]).toBeCloseTo(v, 6);
};

describe('кадрирование', () => {
  it('без сдвига и масштаба берёт центральный квадрат', () => {
    near(cropRect(1000, 500, { box: 168, zoom: 1, x: 0, y: 0 }), { sx: 250, sy: 0, side: 500 });
  });
  it('сдвиг не выводит рамку за край фото', () => {
    // 1000×500 при zoom 1: фото на экране 336×168, по горизонтали запас 84 px, по вертикали 0.
    near(clampOffset(1000, 500, { box: 168, zoom: 1, x: 500, y: -40 }), { x: 84, y: 0 });
    near(cropRect(1000, 500, { box: 168, zoom: 1, x: 500, y: 0 }), { sx: 0, sy: 0, side: 500 });
  });
  it('масштаб ×2 берёт квадрат вдвое меньше', () => {
    near(cropRect(800, 800, { box: 168, zoom: 2, x: 0, y: 0 }), { sx: 200, sy: 200, side: 400 });
  });
});

describe('буквы и ошибки', () => {
  it('оставляет до двух букв или цифр', () => {
    expect(cleanLetters('t-shy')).toBe('TS');
    expect(cleanLetters('<b>')).toBe('B');
    expect(cleanLetters('вл')).toBe('ВЛ');
  });
  it('пишет размер файла в мегабайтах', () => {
    expect(problemText({ kind: 'too_big', size: 5.4 * 1024 * 1024 }).text).toContain('5,4 МБ');
  });
});
