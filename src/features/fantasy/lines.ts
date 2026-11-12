import { pts } from '@/lib/api/fantasy';
import { t } from '@/i18n';

const LINES = ['qualy', 'race', 'gain', 'fl', 'dnf', 'dsq', 'sprint', 'sprint_gain', 'sprint_dnf', 'drivers', 'q_bonus'] as const;
const lineName = (k: string) => ((LINES as readonly string[]).includes(k) ? t(`fan.line.${k as (typeof LINES)[number]}`) : k);
/** Разбор очков актива по строкам: «квалификация +3 · гонка +12 · позиции +4». */
export const lineText = (lines: Record<string, number>) =>
  Object.entries(lines)
    .filter(([, v]) => Number(v) !== 0)
    .map(([k, v]) => `${lineName(k)} ${Number(v) > 0 ? '+' : ''}${pts(v)}`)
    .join(' · ');

