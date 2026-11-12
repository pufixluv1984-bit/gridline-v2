import type { ReactNode } from 'react';
import s from './Frame.module.css';

/**
 * Корпус страницы, одно место на весь сайт.
 * По умолчанию — обычный лейаут: меню (необязательно) зафиксировано у левого края окна,
 * справа контент на всю оставшуюся ширину, без рамки и отступов.
 * boxed — прежний корпус «окошком» из макетов (только экраны входа).
 */
export function Frame({ rail, children, boxed = false }: { rail?: ReactNode; children: ReactNode; boxed?: boolean }) {
  if (boxed) {
    return (
      <div className={`${s.root} ${s.boxedRoot}`}>
        <div className={s.ambient} aria-hidden="true" />
        <div className={s.frame}>
          {rail}
          <div className={s.inner}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${s.root} ${rail ? s.withRail : ''}`}>
      {rail}
      <div className={s.main}>{children}</div>
    </div>
  );
}
