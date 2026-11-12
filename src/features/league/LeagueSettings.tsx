import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BONUS_KEYS, updateLeagueBonuses, type BonusKey } from '@/lib/api/leagues';
import { screenKeys } from '@/lib/api/screens';
import { t, type Key } from '@/i18n';

const LABELS: Record<BonusKey, [Key, string | Key]> = {
  fastest_lap: ['predict.r.fl', '+6'],
  first_dnf: ['predict.r.dnf', '+10'],
  pole_wins: ['predict.r.poleWin', '+3'],
  safety_car: ['predict.r.sc', '+3'],
  dnf_many: ['predict.r.dnf2', '+3'],
  boost: ['predict.booster', 'league.onePer5'],
};
const second = (v: string) => (v.startsWith('+') ? v : t(v as Key));

/**
 * Настройки лиги для владельца (макет Settings, «Настройки лобби»): какие бонусы считаются в таблице.
 * Прогнозы общие для всех лиг игрока — настройки меняют только подсчёт таблицы этой лиги.
 */
export function LeagueSettings({ leagueId, config }: { leagueId: string; config: Record<string, boolean> }) {
  const qc = useQueryClient();
  const initial = Object.fromEntries(BONUS_KEYS.map((k) => [k, config?.[k] !== false])) as Record<BonusKey, boolean>;
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: (next: Record<BonusKey, boolean>) => updateLeagueBonuses(leagueId, next),
    onMutate: (next) => setValue(next),
    onError: () => setValue(initial),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: screenKeys.league(leagueId) });
      void qc.invalidateQueries({ queryKey: ['screen', 'home'] });
    },
  });

  return (
    <section className="card rise" style={{ ['--i' as string]: 4 }}>
      <h2 className="h">{t('league.settings')}</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 10px' }}>{t('league.settingsText')}</div>
      {BONUS_KEYS.map((k) => (
        <div key={k} className="kv">
          <span>
            {t(LABELS[k][0])}
            <span className="mute" style={{ fontSize: 13, marginLeft: 8 }}>{second(LABELS[k][1])}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value[k]}
            aria-label={t(LABELS[k][0])}
            disabled={save.isPending}
            onClick={() => save.mutate({ ...value, [k]: !value[k] })}
            className={`toggle ${value[k] ? 'on' : ''}`}
          />
        </div>
      ))}
      {save.error && <div className="alert bad" role="alert" style={{ marginTop: 10 }}>{save.error.message}</div>}
    </section>
  );
}
