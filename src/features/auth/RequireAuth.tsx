import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInWithProvider, type OAuthProvider } from '@/lib/api/auth';
import { Frame } from '@/ui/Frame';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import { useAuth, useSessionExpired } from './authContext';

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
  const expired = useSessionExpired();
  const location = useLocation();

  if (auth.status === 'loading') return null;
  // Только `pnpm dev` без настроенного Supabase: показываем каркас, чтобы верстать экраны.
  // В сборку для сайта эта ветка не попадает (import.meta.env.DEV = false).
  if (auth.status === 'unconfigured' && import.meta.env.DEV) return <>{children}</>;
  if (auth.status !== 'signed-in') {
    rememberReturn(location.pathname);
    if (expired) return <SessionExpired />;
    return <Navigate to="/auth/login" replace />;
  }
  return <>{children}</>;
}

const IconClockBig = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/** Макет Overlays, «Сессия истекла». Вход только через Google/Discord — вместо пароля кнопки провайдеров. */
function SessionExpired() {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (p: OAuthProvider) => {
    setBusy(p);
    setError(null);
    try {
      await signInWithProvider(p);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  return (
    <Frame>
      <div style={{ minHeight: 640 }} />
      <Modal
        title="Сессия истекла"
        icon={<span className="bigico yel" style={{ width: 52, height: 52, borderRadius: 16 }}><IconClockBig /></span>}
        onClose={() => undefined}
        busy
        actions={
          <>
            <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} disabled={!!busy} onClick={() => go('discord')}>
              {busy === 'discord' ? 'Открываем…' : 'Войти через Discord'}
            </button>
            <button type="button" className={`${b.cta} ${b.sm}`} disabled={!!busy} onClick={() => go('google')}>
              {busy === 'google' ? 'Открываем…' : 'Войти через Google'}
            </button>
          </>
        }
      >
        <p className={m.text}>Для безопасности мы вышли из аккаунта. Прогнозы и составы сохранены — войди снова, чтобы продолжить с того же места.</p>
        {error && <div className="alert bad" role="alert">{error}</div>}
      </Modal>
    </Frame>
  );
}

/** Обратное: со страниц входа уводим уже вошедшего игрока туда, откуда его отправили на вход. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-in') return <Navigate to={takeReturn() ?? '/'} replace />;
  return <>{children}</>;
}
