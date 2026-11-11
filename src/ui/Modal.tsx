import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Modal.module.css';

type Props = {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  /** Пока идёт запрос, окно не закрывается по Esc и клику мимо. */
  busy?: boolean;
};

/** Окно подтверждения (макет Overlays). Esc и клик по фону закрывают, фокус уходит внутрь окна. */
export function Modal({ title, icon, children, actions, onClose, busy = false }: Props) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [busy, onClose]);

  return createPortal(
    <div
      className={s.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={box} className={s.mdl} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {icon && <span className={s.ico}>{icon}</span>}
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className={s.bt}>{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
