import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { uiZoom } from '@/lib/uiScale';

/** Что тащим: пилота из слота прогноза или из списка пилотов. */
export type DragSrc = { slot: number } | { driver: string };

const THRESHOLD = 6; // px: меньше — это обычный клик, а не перетаскивание

/**
 * Перетаскивание пилотов на экране прогноза — на событиях мыши, а не на HTML drag-and-drop:
 * в Firefox кнопки (а слоты — кнопки) нативно не перетаскиваются. Сайт только для десктопа.
 *
 * За курсором едет копия самого блока (того же размера, в той же точке, где его взяли), на старом месте —
 * пустая рамка, слот-цель (атрибут data-slot) подсвечивается. Копия двигается только через transform.
 *
 * Перетаскивание всегда заканчивается: встроенное перетаскивание браузера (фото пилота внутри блока) запрещено —
 * пока оно шло, сайт не получал отпускание кнопки, и копия «прилипала» к курсору. Если отпускание всё же
 * потерялось (кнопку отпустили за окном, окно потеряло фокус), конец распознаётся по первому движению без
 * зажатой кнопки или по уходу из окна.
 */
export function useDragPick({ canDrop, onDrop }: { canDrop: (src: DragSrc, to: number) => boolean; onDrop: (src: DragSrc, to: number) => void }) {
  const [drag, setDrag] = useState<DragSrc | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const justDropped = useRef(false);
  const latest = useRef({ canDrop, onDrop });
  useEffect(() => {
    latest.current = { canDrop, onDrop };
  });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (src: DragSrc) => (e: ReactMouseEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      stop.current?.(); // прошлое перетаскивание, если почему-то не закончилось
      // Без встроенного перетаскивания картинок и выделения текста при зажатой кнопке (клик это не отменяет).
      e.preventDefault();
      const node = e.currentTarget;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let started = false;
      let target: number | null = null;
      let ghost: HTMLElement | null = null;
      let grab = { x: 0, y: 0 };
      let z = 1;

      const place = (x: number, y: number) => {
        if (ghost) ghost.style.transform = `translate(${(x - grab.x) / z}px, ${(y - grab.y) / z}px) scale(1.03)`;
      };
      const lift = () => {
        // Копия блока: те же классы и содержимое, без «активного» оформления и без id (не дублировать их в DOM).
        const r = node.getBoundingClientRect();
        z = uiZoom();
        grab = { x: x0 - r.left, y: y0 - r.top };
        ghost = node.cloneNode(true) as HTMLElement;
        ghost.classList.remove('act', 'drop', 'dragging', 'empty');
        ghost.classList.add('drag-lift');
        ghost.removeAttribute('id');
        ghost.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
        ghost.setAttribute('aria-hidden', 'true');
        // Номер места (P5) едет вместе с блоком и путает, когда блок уже над другим местом — прячем.
        ghost.querySelectorAll<HTMLElement>('.num').forEach((x) => (x.style.visibility = 'hidden'));
        ghost.style.width = `${r.width / z}px`;
        ghost.style.height = `${r.height / z}px`;
        document.body.appendChild(ghost);
      };

      const move = (ev: MouseEvent) => {
        // Кнопка уже отпущена, а отпускание мы не получили: заканчиваем там, где курсор сейчас.
        if ((ev.buttons & 1) === 0) {
          up();
          return;
        }
        if (!started) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return;
          started = true;
          document.body.classList.add('dragging-pick');
          lift();
          setDrag(src);
        }
        place(ev.clientX, ev.clientY);
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-slot]');
        const i = el ? Number(el.dataset.slot) : null;
        target = i !== null && latest.current.canDrop(src, i) ? i : null;
        setOver(target);
      };
      const end = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('keydown', key);
        document.removeEventListener('dragstart', native, true);
        window.removeEventListener('blur', end);
        document.body.classList.remove('dragging-pick');
        ghost?.remove();
        ghost = null;
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
      const native = (ev: DragEvent) => ev.preventDefault();
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('keydown', key);
      document.addEventListener('dragstart', native, true);
      window.addEventListener('blur', end);
      stop.current = end;
    },
    [],
  );

  return { start, drag, over, wasDrag: () => justDropped.current };
}
