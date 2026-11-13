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
//
// Пустых полей по бокам не бывает: раскладка не шире MAX_LAYOUT (меню 240 + колонка 2100).
// Если окно ещё шире (ультраширокий монитор, сильное отдаление), масштаб растёт дальше,
// и страница просто становится крупнее, заполняя ширину.

export const UI_BASE_WIDTH = 1440;
export const WIDE_LAYOUT = 2000;
export const MAX_LAYOUT = 240 + 2100;

export function uiScaleFor(width: number): number {
  const base = width <= 2560 ? Math.min(1.4, Math.max(1, width / UI_BASE_WIDTH)) : Math.min(1.7, 1.4 + ((width - 2560) / (3840 - 2560)) * 0.3);
  return Math.max(base, width / MAX_LAYOUT);
}

export function isWideLayout(width: number): boolean {
  return width / uiScaleFor(width) >= WIDE_LAYOUT;
}

export function installUiScale(): void {
  const root = document.documentElement;
  let current = '';
  const apply = () => {
    // Полная ширина окна (с полосой прокрутки), как у медиазапросов: масштаб не прыгает, когда полоса
    // появляется или исчезает при переходе между экранами, и колонка (≤ окна) не оставляет щели справа.
    const width = window.innerWidth || root.clientWidth;
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

/**
 * Текущий масштаб body (zoom). Координаты мыши и getBoundingClientRect — в пикселях окна, а left/top/transform
 * элементов внутри body умножаются на zoom: для плавающих элементов (меню списка, перетаскивание) делим на него.
 */
export function uiZoom(): number {
  if (typeof document === 'undefined') return 1;
  const z = parseFloat(getComputedStyle(document.body).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}
