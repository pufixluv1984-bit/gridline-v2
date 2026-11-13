// После выкладки новой версии у открытой вкладки остаются ссылки на старые файлы экранов (их имена с хешем
// меняются при каждой сборке), и переход на ещё не открытый экран падает: «Failed to fetch dynamically
// imported module». Лечится перезагрузкой: страница возьмёт новую версию. Перезагружаем один раз за минуту,
// чтобы не уйти в цикл, если файла правда нет (тогда покажется обычный экран ошибки).

import { lazy, type ComponentType } from 'react';

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

/**
 * React.lazy с повторами: если файл экрана не загрузился (моргнула сеть), пробуем ещё два раза;
 * если файла нет совсем (сайт обновился) — перезагружаем страницу на новую версию.
 * Обычный React.lazy запоминает неудачу навсегда, и экран не открывается до перезагрузки вкладки.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- как у самого React.lazy
export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await load();
      } catch (e) {
        if (attempt >= 2) {
          if (isStaleChunkError(e)) reloadForNewVersion();
          throw e;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  });
}
