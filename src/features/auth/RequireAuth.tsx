import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';

// Куда вернуть игрока после входа. Вход через Google/Discord уводит со страницы, поэтому
// state роутера теряется — путь запоминаем в sessionStorage (например, ссылку-приглашение /join/КОД).
const RETURN_KEY = 'gridline:after-login';

function rememberReturn(path: string) {
  try {
    if (path && path !== '/') sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* без хранилища просто вернём на главную */
  }
}

function takeReturn(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    if (v) sessionStorage.removeItem(RETURN_KEY);
    // Только внутренние пути приложения.
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
  } catch {
    return null;
  }
}

/**
 * Пускает на экраны с панелью только после входа. Это удобство интерфейса —
 * сами данные закрывает RLS в базе (правило 1).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return null;
  // Только `pnpm dev` без настроенного Supabase: показываем каркас, чтобы верстать экраны.
  // В сборку для сайта эта ветка не попадает (import.meta.env.DEV = false).
  if (auth.status === 'unconfigured' && import.meta.env.DEV) return <>{children}</>;
  if (auth.status !== 'signed-in') {
    rememberReturn(location.pathname);
    return <Navigate to="/auth/login" replace />;
  }
  return <>{children}</>;
}

/** Обратное: со страниц входа уводим уже вошедшего игрока туда, откуда его отправили на вход. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-in') return <Navigate to={takeReturn() ?? '/'} replace />;
  return <>{children}</>;
}
