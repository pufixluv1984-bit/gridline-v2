import { pts } from '@/lib/api/fantasy';

const LINE_NAMES: Record<string, string> = {
  qualy: 'квалификация', race: 'гонка', gain: 'позиции', fl: 'быстрый круг', dnf: 'сход', dsq: 'дисквалификация',
  sprint: 'спринт', sprint_gain: 'позиции в спринте', sprint_dnf: 'сход в спринте', drivers: 'пилоты', q_bonus: 'бонус квалификации',
};
/** Разбор очков актива по строкам: «квалификация +3 · гонка +12 · позиции +4». */
export const lineText = (lines: Record<string, number>) =>
  Object.entries(lines)
    .filter(([, v]) => Number(v) !== 0)
    .map(([k, v]) => `${LINE_NAMES[k] ?? k} ${Number(v) > 0 ? '+' : ''}${pts(v)}`)
    .join(' · ');

