import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IconMenu } from './icons';
import { ITEMS, pickActive } from './railNav';
import s from './Rail.module.css';
import { t } from '@/i18n';

const PICKED_KEY = 'gridline:nav';
const readPicked = (): string | null => {
  try {
    return sessionStorage.getItem(PICKED_KEY);
  } catch {
    return null;
  }
};

/**
 * Боковое меню: зафиксировано у левого края окна. В покое только иконки; при наведении мышью
 * и при фокусе с клавиатуры раскрывается поверх контента и показывает подписи. На сенсорных экранах
 * открывается кнопкой-бургером и закрывается тапом вне меню.
 */
export function Rail({ avatar }: { avatar: ReactNode }) {
  const { pathname } = useLocation();
  // Пункт, по которому нажали последним: различает «Рейтинг» и «Лигу друзей» с одним адресом.
  // Хранится до закрытия вкладки, чтобы подсветка не менялась после обновления страницы.
  const [picked, setPickedState] = useState<string | null>(readPicked);
  const setPicked = (to: string) => {
    setPickedState(to);
    try {
      sessionStorage.setItem(PICKED_KEY, to);
    } catch {
      /* хранилище недоступно — помним до перезагрузки */
    }
  };
  const activeTo = pickActive(pathname, picked);
  const [open, setOpen] = useState(false);
  // После нажатия на пункт меню сворачивается, хотя мышь ещё над ним; снова раскроется, когда мышь уйдёт и вернётся.
  const [hush, setHush] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Клик по пункту (переход на другой экран) закрывает открытое по тапу меню.
  return (
    <aside
      ref={ref}
      className={`${s.rail} ${open ? s.open : ''} ${hush ? s.hush : ''}`}
      aria-label={t('nav.aria')}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) return;
        setOpen(false);
        setHush(true);
      }}
      onMouseLeave={() => setHush(false)}
      onKeyDown={(e) => e.key === 'Tab' && setHush(false)}
    >
      <span className={s.shade} aria-hidden="true" />
      <button
        type="button"
        className={`${s.item} ${s.burger}`}
        aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
        title={open ? t('nav.closeMenu') : t('nav.openMenu')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.ico}>
          <IconMenu />
        </span>
        <span className={s.label}>{t('nav.menu')}</span>
      </button>
      <NavLink
        to="/profile"
        aria-label={t('nav.profile')}
        title={t('nav.profile')}
        className={({ isActive }) => `${s.item} ${s.meItem} ${isActive ? s.meOn : ''}`}
      >
        <span className={s.ico}>
          <span className={s.me}>{avatar}</span>
        </span>
        <span className={s.label}>{t('nav.profile')}</span>
      </NavLink>
      {ITEMS.map(({ to, label, Icon }) => {
        const on = to === activeTo;
        return (
          <NavLink
            key={label}
            to={to.split('#')[0]!}
            aria-label={t(label)}
            title={t(label)}
            aria-current={on ? 'page' : false}
            className={`${s.item} ${on ? s.on : ''}`}
            onClick={() => setPicked(to)}
          >
            <span className={s.ico}>
              <Icon />
            </span>
            <span className={s.label}>{t(label)}</span>
          </NavLink>
        );
      })}
    </aside>
  );
}
