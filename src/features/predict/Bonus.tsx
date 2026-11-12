import type { Block } from './picks';

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
          Да
        </button>
        <button type="button" className={value === false ? 'on' : ''} aria-pressed={value === false} disabled={disabled} onClick={() => onChange(value === false ? null : false)}>
          Нет
        </button>
      </span>
    </div>
  );
}

const OPTIONS: { v: Block | null; t: string }[] = [
  { v: null, t: 'Без бустера' },
  { v: 'qualy', t: 'Квалификация' },
  { v: 'race', t: 'Гонка' },
  { v: 'bonus', t: 'Бонусы' },
];

/** Бустер ×2 на один блок. Если бустер уже стоит на другом этапе окна — выбрать нельзя (проверяет и база). */
export function BoostPicker({
  value,
  onChange,
  disabled,
  usedElsewhere,
}: {
  value: Block | null;
  onChange: (v: Block | null) => void;
  disabled?: boolean;
  usedElsewhere: { round: number; name: string } | null;
}) {
  const locked = !!usedElsewhere && value === null;
  return (
    <div>
      <div className="seg2" role="radiogroup" aria-label="Бустер ×2">
        {OPTIONS.map((o) => (
          <button
            key={o.t}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            className={value === o.v ? 'on' : ''}
            disabled={disabled || (locked && o.v !== null)}
            onClick={() => onChange(o.v)}
          >
            {o.t}
            {o.v && value === o.v ? ' ×2' : ''}
          </button>
        ))}
      </div>
      <div className="help">
        {usedElsewhere
          ? `Бустер этого окна уже стоит на этапе ${usedElsewhere.round} (${usedElsewhere.name}). Сними его там, чтобы поставить здесь.`
          : 'Очки выбранного блока удвоятся. Следующий бустер — через 5 этапов.'}
      </div>
    </div>
  );
}
