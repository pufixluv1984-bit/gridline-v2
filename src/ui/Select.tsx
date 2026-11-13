import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { driverPhoto, teamLogo, type TeamCode } from '@/lib/assets';
import { uiZoom } from '@/lib/uiScale';
import s from './Select.module.css';

export type SelectOption<V extends string | number> = {
  value: V;
  label: string;
  /** Вторая строка серым: команда пилота, даты этапа, цена. */
  sub?: string;
  icon?: ReactNode;
};

type Props<V extends string | number> = {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  /** field — как поле формы (52px); compact — 40px в шапках карточек; pill — маленькая «таблетка». */
  size?: 'field' | 'compact' | 'pill';
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Кнопка на всю ширину (в формах) или по содержимому (в шапках). */
  full?: boolean;
};

/**
 * Выпадающий список в стиле сайта вместо системного <select>: тёмное меню, фото/логотипы, галочка у выбранного.
 * Меню рисуется в <body> поверх всего (окна с прокруткой его не обрезают) и открывается вверх, если внизу тесно.
 * Клавиатура как у системного списка: стрелки, Home/End, Enter/пробел, Esc, переход по первой букве.
 */
export function Select<V extends string | number>({ value, options, onChange, size = 'field', id, disabled, full, ...aria }: Props<V>) {
  const listId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const cur = options.find((o) => o.value === value) ?? null;

  const measure = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    // Меню живёт в <body> с масштабом (zoom на больших экранах): пиксели окна переводим в его пиксели.
    const z = uiZoom();
    const vh = window.innerHeight / z;
    const rect = { left: r.left / z, top: r.top / z, bottom: r.bottom / z, width: r.width / z };
    const below = vh - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 240 && above > below;
    setPlace({ left: rect.left, top: up ? rect.top - 6 : rect.bottom + 6, width: rect.width, up, max: Math.min(340, Math.max(160, up ? above : below)) });
  }, []);

  const show = () => {
    if (disabled) return;
    measure();
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);
  const choose = (o: SelectOption<V>) => {
    close();
    if (o.value !== value) onChange(o.value);
  };

  // Пока открыто: клик мимо закрывает, прокрутка и изменение окна двигают меню за кнопкой.
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', down);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, close, measure]);

  // Подсвеченный пункт всегда в зоне видимости.
  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, hi]);

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // не закрывать окно, в котором стоит список
      }
      close(e.key === 'Escape');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((x) => Math.min(last, x + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((x) => Math.max(0, x - 1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setHi(e.key === 'Home' ? 0 : last);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = options[hi];
      if (o) choose(o);
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const n = options.length;
      for (let step = 1; step <= n; step++) {
        const j = (hi + step) % n;
        if (options[j]!.label.toLowerCase().startsWith(k)) {
          setHi(j);
          break;
        }
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${hi}` : undefined}
        aria-label={aria['aria-label']}
        disabled={disabled}
        className={`${s.btn} ${s[size]} ${full ? s.full : ''} ${open ? s.open : ''}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        {cur?.icon && <span className={s.ico}>{cur.icon}</span>}
        <span className={s.val}>{cur?.label ?? ''}</span>
        <svg className={s.chev} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={menu}
            id={listId}
            role="listbox"
            aria-label={aria['aria-label']}
            className={`${s.menu} ${place.up ? s.up : ''}`}
            style={{
              left: Math.min(place.left, window.innerWidth / uiZoom() - Math.max(place.width, 220) - 8),
              top: place.top,
              minWidth: place.width,
              maxHeight: place.max,
            }}
          >
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <div
                  key={String(o.value)}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  className={`${s.opt} ${i === hi ? s.hi : ''} ${on ? s.on : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {o.icon && <span className={s.ico}>{o.icon}</span>}
                  <span className={s.txt}>
                    <span>{o.label}</span>
                    {o.sub && <small>{o.sub}</small>}
                  </span>
                  {on && (
                    <svg className={s.check} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="m3 7.5 2.5 2.5L11 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Значок пилота для пункта списка: фото из набора или код на цвете команды. */
export function DriverIcon({ code, color }: { code: string; color?: string | null }) {
  const photo = driverPhoto(code);
  return photo ? (
    <img className={s.face} src={photo} alt="" width={28} height={28} loading="lazy" />
  ) : (
    <span className={s.mono} style={{ background: color ?? '#3a3a42' }}>{code.slice(0, 3)}</span>
  );
}

/** Значок команды: белый логотип на тёмной плашке. */
export function TeamIcon({ code }: { code: string }) {
  const logo = teamLogo(code as TeamCode);
  return logo ? <img className={s.logo} src={logo} alt="" width={20} height={20} loading="lazy" /> : null;
}
