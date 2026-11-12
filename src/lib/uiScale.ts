// Масштаб интерфейса для больших экранов (docs/DESIGN.md: макеты 1440 и 2K, 2K = тот же макет ×1.4).
// Вместо ступенек «zoom 1.2 от 1800px, 1.4 от 2300px» — плавно: ширина окна / 1440, от 1 до 1.4.
// До 1440px масштаб 1 (макет как есть); на 1920 — 1.33 (раскладка как на 1440); от ~2016 — 1.4,
// дальше растёт ширина раскладки, а колонка контента ограничена (Frame.module.css, --content-max).
// Значение кладётся в CSS-переменную --ui на <html>; body { zoom: var(--ui) } в global.css.

export const UI_BASE_WIDTH = 1440;
export const UI_MAX_SCALE = 1.4;

export function uiScaleFor(width: number): number {
  return Math.min(UI_MAX_SCALE, Math.max(1, width / UI_BASE_WIDTH));
}

export function installUiScale(): void {
  const root = document.documentElement;
  let current = '';
  const apply = () => {
    // clientWidth — без полосы прокрутки и не зависит от zoom у body.
    const next = uiScaleFor(root.clientWidth || window.innerWidth).toFixed(4);
    if (next === current) return; // высота страницы меняется часто — лишний раз стили не пересчитываем
    current = next;
    root.style.setProperty('--ui', next);
  };
  apply();
  window.addEventListener('resize', apply, { passive: true });
  // Подстраховка: смена ширины без события resize (эмуляция устройства, панели браузера).
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(root);
}
