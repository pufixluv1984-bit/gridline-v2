// После выкладки новой версии у открытой вкладки остаются ссылки на старые файлы экранов (их имена с хешем
// меняются при каждой сборке), и переход на ещё не открытый экран падает: «Failed to fetch dynamically
// imported module». Лечится перезагрузкой: страница возьмёт новую версию. Перезагружаем один раз за минуту,
// чтобы не уйти в цикл, если файла правда нет (тогда покажется обычный экран ошибки).

const KEY = 'gridline:reloaded-for-update';
const WINDOW_MS = 60_000;

/** Ошибка загрузки файла экрана (Chrome, Firefox, Safari пишут по-разному). */
export function isStaleChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

/** Перезагрузить страницу, если за последнюю минуту этого ещё не делали. true — перезагрузка пошла. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* без sessionStorage всё равно пробуем один раз — дальше сработает экран ошибки */
  }
  window.location.reload();
  return true;
}

/** Vite сообщает о сбое загрузки файла экрана событием vite:preloadError — перезагружаемся до падения экрана. */
export function installNewVersionReload(): void {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
}
