import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, reloadForNewVersion } from './newVersion';

describe('новая версия сайта', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('узнаёт ошибку загрузки файла экрана в разных браузерах', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/ResultsPage-Bz.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });

  it('перезагружает один раз, без цикла', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    expect(reloadForNewVersion()).toBe(true);
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });
});
