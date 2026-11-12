import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SESSION_NAMES, formatDateTime } from '@/lib/time/format';
import { IconCheck, IconClock, IconWarn } from './icons';
import s from './Toast.module.css';

type Tone = 'g' | 'y' | 'r';
const ICON: Record<Tone, ReactNode> = { g: <IconCheck size={16} />, y: <IconClock size={16} />, r: <IconWarn size={16} /> };

/** Плашка-уведомление из макета Overlays («Уведомления-тосты»). */
export function ToastCard({ tone, title, text }: { tone: Tone; title: string; text?: ReactNode }) {
  return (
    <div className={s.toast} role={tone === 'r' ? 'alert' : 'status'}>
      <span className={`${s.ti} ${s[tone]}`} aria-hidden="true">{ICON[tone]}</span>
      <div>
        <b>{title}</b>
        {text && <span className={s.m}>{text}</span>}
      </div>
    </div>
  );
}

/** Всплывающий тост справа сверху, исчезает через 4 секунды (макет Overlays). */
export function Toast({ tone, title, text, onDone }: { tone: Tone; title: string; text?: ReactNode; onDone: () => void }) {
  // Экран может перерисовываться каждую секунду (таймер) — таймер тоста от этого не перезапускается.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => done.current(), 4000);
    return () => clearTimeout(t);
  }, []);
  return createPortal(
    <div className={s.float}>
      <ToastCard tone={tone} title={title} text={text} />
    </div>,
    document.body,
  );
}

export type Notice = { session: string; old_at: string; new_at: string };

/** Предупреждение о переносе сессии (PRODUCT.md §4): дедлайн прогноза сдвигается вместе с квалификацией. */
export function Notices({ notices }: { notices: Notice[] | undefined }) {
  if (!notices?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notices.map((n) => (
        <ToastCard
          key={n.session}
          tone="y"
          title={`${SESSION_NAMES[n.session] ?? n.session}: перенос`}
          text={
            <>
              Было {formatDateTime(n.old_at)}, стало {formatDateTime(n.new_at)} — по твоему времени.
              {n.session === 'qualy' ? ' Приём прогнозов закроется по новому времени.' : ''}
            </>
          }
        />
      ))}
    </div>
  );
}
