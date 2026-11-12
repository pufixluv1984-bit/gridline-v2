import type { ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IconBars, IconBook, IconCalendar, IconFlag, IconHelmet, IconHome, IconLayers, IconTarget, IconUsers } from './icons';
import s from './Rail.module.css';

type Item = { to: string; label: string; Icon: ComponentType<{ size?: number }> };

// Порядок и подписи — как в макете Main.dc.html (+ «Пилоты» из макета Drivers). «Рейтинг» и «Лига друзей» в макете ведут
// на один экран League; подсвечивается первый из них.
const ITEMS: Item[] = [
  { to: '/', label: 'Главная', Icon: IconHome },
  { to: '/predict', label: 'Прогноз', Icon: IconTarget },
  { to: '/league', label: 'Рейтинг', Icon: IconBars },
  { to: '/results', label: 'Результаты', Icon: IconFlag },
  { to: '/drivers', label: 'Пилоты', Icon: IconHelmet },
  { to: '/schedule', label: 'Календарь', Icon: IconCalendar },
  { to: '/fantasy', label: 'Фэнтези-лига', Icon: IconLayers },
  { to: '/league#friends', label: 'Лига друзей', Icon: IconUsers },
  { to: '/rules', label: 'Правила', Icon: IconBook },
];

export function Rail({ initials }: { initials: string }) {
  const { pathname } = useLocation();
  const activeTo = ITEMS.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to.split('#')[0]!)))?.to;

  return (
    <aside className={s.rail} aria-label="Навигация">
      <NavLink
        to="/profile"
        aria-label="Профиль"
        title="Профиль"
        className={({ isActive }) => `${s.me} ${isActive ? s.meOn : ''}`}
      >
        {initials}
      </NavLink>
      {ITEMS.map(({ to, label, Icon }) => {
        const on = to === activeTo;
        return (
          <NavLink
            key={label}
            to={to.split('#')[0]!}
            aria-label={label}
            title={label}
            aria-current={on ? 'page' : undefined}
            className={`${s.nav} ${on ? s.on : ''}`}
          >
            <Icon />
          </NavLink>
        );
      })}
    </aside>
  );
}
