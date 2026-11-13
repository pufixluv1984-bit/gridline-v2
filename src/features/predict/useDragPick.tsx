import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

/** Что тащим: пилота из слота прогноза или из списка пилотов. */
export type DragSrc = { slot: number } | { driver: string };

const THRESHOLD = 6; // px: меньше — это обычный клик, а не перетаскивание

/**
 * Перетаскивание пилотов на экране прогноза — на событиях мыши, а не на HTML drag-and-drop:
 * в Firefox кнопки (а слоты — кнопки) нативно не перетаскиваются. Сайт только для десктопа.
 *
 * Слот-цель помечается атрибутом data-slot. Пока тащим, за курсором едет плашка (только transform).
 */
export function useDragPick({
  canDrop,
  onDrop,
  ghost,
}: {
  canDrop: (src: DragSrc, to: number) => boolean;
  onDrop: (src: DragSrc, to: number) => void;
  ghost: (src: DragSrc) => ReactNode;
}) {
  // Где плашка появилась; дальше она двигается напрямую через style.transform, без перерисовки.
  const [drag, setDrag] = useState<{ src: DragSrc; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const justDropped = useRef(false);
  const latest = useRef({ canDrop, onDrop });
  useEffect(() => {
    latest.current = { canDrop, onDrop };
  });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (src: DragSrc) => (e: ReactMouseEvent) => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let started = false;
      let target: number | null = null;

      const move = (ev: MouseEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return;
          started = true;
          document.body.style.userSelect = 'none';
          setDrag({ src, x: ev.clientX, y: ev.clientY });
        }
        if (box.current) box.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 14}px)`;
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
        const i = el ? Number(el.dataset.slot) : null;
        target = i !== null && latest.current.canDrop(src, i) ? i : null;
        setOver(target);
      };
      const end = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('keydown', key);
        document.body.style.userSelect = '';
        stop.current = null;
        setDrag(null);
        setOver(null);
      };
      const up = () => {
        end();
        if (!started) return;
        // Клик после перетаскивания (если отпустили на той же кнопке) не должен выбирать или очищать слот.
        justDropped.current = true;
        setTimeout(() => (justDropped.current = false), 0);
        if (target !== null) latest.current.onDrop(src, target);
      };
      const key = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') end();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('keydown', key);
      stop.current = end;
    },
    [],
  );

  const element = drag ? (
    <div
      ref={box}
      className="drag-ghost"
      aria-hidden="true"
      style={{ transform: `translate(${drag.x + 14}px, ${drag.y + 14}px)` }}
    >
      {ghost(drag.src)}
    </div>
  ) : null;

  return { start, drag: drag?.src ?? null, over, element, wasDrag: () => justDropped.current };
}
