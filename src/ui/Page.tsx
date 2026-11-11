import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import s from './Page.module.css';

/** Заголовок экрана: «Главная · Сезон 2026». */
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <h1 className={s.top}>
      <span>{title}</span>
      {sub && (
        <>
          <span className={s.dot} aria-hidden="true" />
          <span className={s.sub}>{sub}</span>
        </>
      )}
    </h1>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
}

export function ToolbarDivider() {
  return <span className={s.vr} aria-hidden="true" />;
}

export function PillLink({ to, children, end }: { to: string; children: ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `${s.pill} ${isActive ? s.pillOn : ''}`}>
      {children}
    </NavLink>
  );
}

export function PrimaryLink({ to, icon, children }: { to: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <NavLink to={to} className={s.btn}>
      {icon}
      {children}
    </NavLink>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <main className={s.content}>{children}</main>;
}

export function Card({ children, i = 0, className = '' }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <section className={`${s.card} rise ${className}`} style={{ ['--i' as string]: i }}>
      {children}
    </section>
  );
}
