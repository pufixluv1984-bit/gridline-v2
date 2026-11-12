// Масштаб интерфейса для больших экранов (docs/DESIGN.md: макеты 1440 и 2K, 2K = тот же макет ×1.4).
//
// Ширина окна → масштаб (body { zoom: var(--ui) } в global.css):
//   ≤ 1440        1            макет как есть
//   1440 … 2016   окно / 1440  раскладка остаётся шириной 1440, всё крупнее
//   2016 … 2560   1.4          как макеты 2K
//   2560 … 3840   1.4 → 1.7    4K и ультраширокие: чуть крупнее, чтобы не было пустых полей
//   ≥ 3840        1.7
//
// Режим «широко» (html[data-wide]): когда раскладка (окно / масштаб) не меньше WIDE_LAYOUT,
// меню закреплено раскрытым, колонка контента шире, сетки получают больше колонок.

export const UI_BASE_WIDTH = 1440;
export const WIDE_LAYOUT = 2000;

export function uiScaleFor(width: number): number {
  if (width <= 2560) return Math.min(1.4, Math.max(1, width / UI_BASE_WIDTH));
  return Math.min(1.7, 1.4 + ((width - 2560) / (3840 - 2560)) * 0.3);
}

export function isWideLayout(width: number): boolean {
  return width / uiScaleFor(width) >= WIDE_LAYOUT;
}

export function installUiScale(): void {
  const root = document.documentElement;
  let current = '';
  const apply = () => {
    // clientWidth — без полосы прокрутки и не зависит от zoom у body.
    const width = root.clientWidth || window.innerWidth;
    const scale = uiScaleFor(width).toFixed(4);
    const wide = isWideLayout(width);
    const next = `${scale}|${wide}`;
    if (next === current) return; // высота страницы меняется часто — лишний раз стили не пересчитываем
    current = next;
    root.style.setProperty('--ui', scale);
    root.toggleAttribute('data-wide', wide);
  };
  apply();
  window.addEventListener('resize', apply, { passive: true });
  // Подстраховка: смена ширины без события resize (эмуляция устройства, панели браузера).
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(root);
}
