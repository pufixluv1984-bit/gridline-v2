import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';

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
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Обратное: со страниц входа уводим уже вошедшего игрока на главную. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-in') return <Navigate to={from} replace />;
  return <>{children}</>;
}
