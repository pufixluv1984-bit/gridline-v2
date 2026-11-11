import type { ReactNode } from 'react';
import s from './Frame.module.css';

/** Корпус страницы: фон, свечение, рамка. Внутри — боковая панель (необязательно) и внутренняя область. */
export function Frame({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
  return (
    <div className={s.root}>
      <div className={s.ambient} aria-hidden="true" />
      <div className={s.frame}>
        {rail}
        <div className={s.inner}>{children}</div>
      </div>
    </div>
  );
}
