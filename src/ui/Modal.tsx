import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Modal.module.css';
import { t } from '@/i18n';

type Props = {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  /** Пока идёт запрос, окно не закрывается по Esc и клику мимо. */
  busy?: boolean;
  /** Окно шире (480px, «.mdl.w» из макета) и с крестиком в заголовке. */
  wide?: boolean;
  closeButton?: boolean;
};

/** Окно подтверждения (макет Overlays). Esc и клик по фону закрывают, фокус уходит внутрь окна. */
export function Modal({ title, icon, children, actions, onClose, busy = false, wide = false, closeButton = false }: Props) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Фокус — на первое поле, иначе на первую кнопку действий (не на крестик).
    const first = box.current?.querySelector<HTMLElement>('input') ?? box.current?.querySelector<HTMLElement>(`.${s.bt} button`);
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
      <div ref={box} className={`${s.mdl} ${wide ? s.w : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined}>
        {icon && <span className={s.ico}>{icon}</span>}
        {closeButton ? (
          <div className={s.hd}>
            <h3 id={titleId}>{title}</h3>
            <button type="button" className={s.x} aria-label={t('common.close')} title={t('common.close')} onClick={onClose} disabled={busy}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ) : (
          <h3 id={titleId}>{title}</h3>
        )}
        {children}
        <div className={s.bt}>{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
