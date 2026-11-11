// Логика выбора пилотов на экране прогноза (без React — чтобы покрыть тестами).
// 14 слотов: 0–2 квалификация (поул, P2, P3), 3–12 топ-10 гонки, 13 — быстрый круг.

export type Block = 'qualy' | 'race' | 'bonus';
export type Slot = { index: number; block: Block; pos: number; label: string; points: string };

export const SLOTS: Slot[] = [
  { index: 0, block: 'qualy', pos: 1, label: 'Поул', points: '+6' },
  { index: 1, block: 'qualy', pos: 2, label: 'P2', points: '+4' },
  { index: 2, block: 'qualy', pos: 3, label: 'P3', points: '+4' },
  ...Array.from({ length: 10 }, (_, i) => ({ index: 3 + i, block: 'race' as const, pos: i + 1, label: `P${i + 1}`, points: '' })),
  { index: 13, block: 'bonus', pos: 0, label: 'Быстрый круг', points: '+6' },
];

export type Picks = (string | null)[]; // длина 14, driverId или null

export const emptyPicks = (): Picks => Array(SLOTS.length).fill(null);

export function fromPrediction(p: { qualy: string[]; race: string[]; fastest_lap: string | null } | null): Picks {
  if (!p) return emptyPicks();
  return [...p.qualy, ...p.race, p.fastest_lap];
}

export function toPrediction(picks: Picks) {
  return { qualy: picks.slice(0, 3) as string[], race: picks.slice(3, 13) as string[], fastestLap: picks[13] ?? null };
}

const blockOf = (i: number) => SLOTS[i]!.block;
const indicesOf = (block: Block) => SLOTS.filter((s) => s.block === block).map((s) => s.index);

/** Обязательное заполнено: квалификация 3 и топ-10 (быстрый круг можно пропустить). */
export const isComplete = (picks: Picks) => picks.slice(0, 13).every(Boolean);
export const filledIn = (picks: Picks, block: Block) => indicesOf(block).filter((i) => picks[i]).length;

/** Пилот уже стоит в этом блоке (в другом слоте)? */
export function usedInBlock(picks: Picks, active: number, driverId: string): boolean {
  return indicesOf(blockOf(active)).some((i) => i !== active && picks[i] === driverId);
}

/**
 * Ставит пилота в активный слот. Если он уже стоял в этом блоке на другом месте — переставляет
 * (прежний слот освобождается). Возвращает новые выборы и следующий пустой слот по кругу.
 */
export function pick(picks: Picks, active: number, driverId: string): { picks: Picks; next: number } {
  const out = picks.slice();
  for (const i of indicesOf(blockOf(active))) if (i !== active && out[i] === driverId) out[i] = null;
  out[active] = driverId;
  let next = active;
  for (let k = 1; k <= SLOTS.length; k++) {
    const j = (active + k) % SLOTS.length;
    if (!out[j]) {
      next = j;
      break;
    }
  }
  return { picks: out, next };
}

export function clear(picks: Picks, index: number): Picks {
  const out = picks.slice();
  out[index] = null;
  return out;
}

export const samePicks = (a: Picks, b: Picks) => a.length === b.length && a.every((x, i) => x === b[i]);
