import { useSyncExternalStore } from 'react';

/**
 * Состояние связи для экрана «Нет связи» (макет Error-Network): сеть пропала или база не отвечает.
 * Ставится из глобального обработчика ошибок TanStack Query и событий браузера offline/online.
 */
type Status = 'ok' | 'offline';
let status: Status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'ok';
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setOffline(v: boolean) {
  const next: Status = v ? 'offline' : 'ok';
  if (next !== status) {
    status = next;
    emit();
  }
}

export function useSystemStatus(): Status {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => status,
  );
}

/** Ошибка сети, а не ответ базы: fetch упал (нет интернета, сервер недоступен). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  return /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setOffline(true));
  window.addEventListener('online', () => setOffline(false));
}
