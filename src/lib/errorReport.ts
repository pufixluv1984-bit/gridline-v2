// Журнал ошибок сайта (миграция 0026): сбои экранов и необработанные ошибки в браузере игрока уходят в базу,
// чтобы их было видно на экране «Ошибки» у админа, без просьб «пришли текст из консоли».
// Одна и та же ошибка — один раз за сеанс, всего не больше 10; база ещё и ограничивает частоту.
import { env } from './env';
import { getSupabase } from './supabase';

type Kind = 'crash' | 'error' | 'rejection';

const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i];
const MAX_PER_SESSION = 10;
const seen = new Set<string>();

/** Путь экрана без кодов приглашений и длинных id: в журнал не должны попасть секреты. */
export function safePath(hash: string): string {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  return path.replace(/\/(GRID-)?[A-Za-z0-9-]{6,}(?=\/|$)/g, (m) => (/^\/[a-z_]+$/.test(m) ? m : '/:id')).slice(0, 200);
}

export function reportError(kind: Kind, e: unknown): void {
  try {
    if (!env.supabaseConfigured) return;
    const message = (e instanceof Error ? `${e.name}: ${e.message}` : String(e ?? '')).trim().slice(0, 500);
    if (!message || IGNORE.some((r) => r.test(message))) return;
    const key = `${kind}|${message}`;
    if (seen.has(key) || seen.size >= MAX_PER_SESSION) return;
    seen.add(key);
    const stack = e instanceof Error && e.stack ? e.stack.slice(0, 4000) : null;
    void getSupabase()
      .rpc('log_client_error' as never, {
        kind,
        message,
        stack,
        path: safePath(window.location.hash),
        release: String(import.meta.env.VITE_RELEASE ?? 'dev').slice(0, 40),
        agent: navigator.userAgent.slice(0, 300),
      } as never)
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* журнал ошибок не должен сам ломать сайт */
  }
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
}
