import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { currentLocale, I18nContext, loadLocale } from './index';
import { storeLocale, type Locale } from './locale';

/**
 * Держит выбранный язык. При смене языка всё дерево пересоздаётся (key), чтобы каждый экран перерисовался
 * с новым словарём; кэш данных (TanStack Query) при этом сохраняется, а onLoaded переводит в нём тексты из базы.
 */
export function I18nProvider({ children, onLoaded }: { children: ReactNode; onLoaded?: () => void }) {
  const [locale, setState] = useState<Locale>(currentLocale());
  const setLocale = useCallback(async (l: Locale) => {
    storeLocale(l);
    if (l === currentLocale()) return;
    await loadLocale(l);
    onLoaded?.();
    setState(l);
  }, [onLoaded]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <I18nContext.Provider value={value}>
      <div key={locale} style={{ display: 'contents' }}>
        {children}
      </div>
    </I18nContext.Provider>
  );
}
