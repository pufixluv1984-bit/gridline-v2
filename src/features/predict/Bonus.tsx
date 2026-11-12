import type { BoostBlock as Block } from './picks';
import { t, type Key } from '@/i18n';

/** Ставка «да / нет» (бонусы фазы 2). Повторный клик по выбранному варианту снимает ответ. */
export function YesNo({
  label,
  points,
  value,
  onChange,
  disabled,
}: {
  label: string;
  points: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="slot" style={{ padding: '10px 14px', gap: 12, justifyContent: 'space-between', cursor: 'default' }} role="group" aria-label={label}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>
        {label} <b className="num" style={{ color: 'var(--pos)', marginLeft: 6 }}>{points}</b>
      </span>
      <span className="seg">
        <button type="button" className={value === true ? 'on' : ''} aria-pressed={value === true} disabled={disabled} onClick={() => onChange(value === true ? null : true)}>
          {t('predict.yes')}
        </button>
        <button type="button" className={value === false ? 'on' : ''} aria-pressed={value === false} disabled={disabled} onClick={() => onChange(value === false ? null : false)}>
          {t('predict.no')}
        </button>
      </span>
    </div>
  );
}

const OPTIONS: { v: Block | null; t: Key }[] = [
  { v: null, t: 'predict.boost.none' },
  { v: 'qualy', t: 'predict.boost.qualy' },
  { v: 'race', t: 'predict.boost.race' },
  { v: 'bonus', t: 'predict.boost.bonus' },
];

/** Бустер ×2 на один блок. Если бустер уже стоит на другом этапе окна — выбрать нельзя (проверяет и база). */
export function BoostPicker({
  value,
  onChange,
  disabled,
  usedElsewhere,
  closed = () => false,
}: {
  value: Block | null;
  onChange: (v: Block | null) => void;
  disabled?: boolean;
  usedElsewhere: { round: number; name: string } | null;
  /** Блок уже закрыт (дедлайны по блокам): на него бустер не ставится, с него не снимается. */
  closed?: (b: Block) => boolean;
}) {
  const locked = !!usedElsewhere && value === null;
  const stuck = value !== null && closed(value);
  return (
    <div>
      <div className="seg2" role="radiogroup" aria-label={t('predict.booster')}>
        {OPTIONS.map((o) => (
          <button
            key={o.t}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            className={value === o.v ? 'on' : ''}
            disabled={disabled || stuck || (locked && o.v !== null) || (o.v !== null && closed(o.v))}
            onClick={() => onChange(o.v)}
          >
            {t(o.t)}
            {o.v && value === o.v ? ' ×2' : ''}
          </button>
        ))}
      </div>
      <div className="help">
        {stuck
          ? t('predict.boost.stuck')
          : usedElsewhere
          ? t('predict.boost.used', { round: usedElsewhere.round, name: usedElsewhere.name })
          : t('predict.boost.help')}
      </div>
    </div>
  );
}
