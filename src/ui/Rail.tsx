import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IconBars, IconBook, IconCalendar, IconFlag, IconHelmet, IconHome, IconLayers, IconMenu, IconTarget, IconUsers } from './icons';
import s from './Rail.module.css';

type Item = { to: string; label: string; Icon: ComponentType<{ size?: number }> };

// Порядок и подписи — как в макете Main.dc.html (+ «Пилоты» из макета Drivers). «Рейтинг» и «Лига друзей» в макете ведут
// на один экран League; подсвечивается первый из них. «Правила» — экран правил фэнтези (макет Fantasy-Rules).
const ITEMS: Item[] = [
  { to: '/', label: 'Главная', Icon: IconHome },
  { to: '/predict', label: 'Прогноз', Icon: IconTarget },
  { to: '/league', label: 'Рейтинг', Icon: IconBars },
  { to: '/results', label: 'Результаты', Icon: IconFlag },
  { to: '/drivers', label: 'Пилоты', Icon: IconHelmet },
  { to: '/schedule', label: 'Календарь', Icon: IconCalendar },
  { to: '/fantasy', label: 'Фэнтези-лига', Icon: IconLayers },
  { to: '/league#friends', label: 'Лига друзей', Icon: IconUsers },
  { to: '/fantasy/rules', label: 'Правила', Icon: IconBook },
];

/**
 * Боковое меню: зафиксировано у левого края окна. В покое только иконки; при наведении мышью
 * и при фокусе с клавиатуры раскрывается поверх контента и показывает подписи. На сенсорных экранах
 * открывается кнопкой-бургером и закрывается тапом вне меню.
 */
export function Rail({ avatar }: { avatar: ReactNode }) {
  const { pathname } = useLocation();
  // Подсвечивается самый точный пункт: на /fantasy/rules — «Правила», а не «Фэнтези-лига».
  const activeTo = ITEMS.filter((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to.split('#')[0]!))).sort(
    (a, b) => b.to.split('#')[0]!.length - a.to.split('#')[0]!.length,
  )[0]?.to;
  const [open, setOpen] = useState(false);
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
      className={`${s.rail} ${open ? s.open : ''}`}
      aria-label="Навигация"
      onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
    >
      <span className={s.shade} aria-hidden="true" />
      <button
        type="button"
        className={`${s.item} ${s.burger}`}
        aria-label={open ? 'Свернуть меню' : 'Открыть меню'}
        title={open ? 'Свернуть меню' : 'Открыть меню'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.ico}>
          <IconMenu />
        </span>
        <span className={s.label}>Меню</span>
      </button>
      <NavLink
        to="/profile"
        aria-label="Профиль"
        title="Профиль"
        className={({ isActive }) => `${s.item} ${s.meItem} ${isActive ? s.meOn : ''}`}
      >
        <span className={s.ico}>
          <span className={s.me}>{avatar}</span>
        </span>
        <span className={s.label}>Профиль</span>
      </NavLink>
      {ITEMS.map(({ to, label, Icon }) => {
        const on = to === activeTo;
        return (
          <NavLink
            key={label}
            to={to.split('#')[0]!}
            aria-label={label}
            title={label}
            aria-current={on ? 'page' : false}
            className={`${s.item} ${on ? s.on : ''}`}
          >
            <span className={s.ico}>
              <Icon />
            </span>
            <span className={s.label}>{label}</span>
          </NavLink>
        );
      })}
    </aside>
  );
}
