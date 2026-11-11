import { useSyncExternalStore } from 'react';
import { env } from '../env';
import { fetchServerNow } from '../api/time';
import { createServerClock } from './serverClock';

// Пока Supabase не настроен, часы идут по устройству (только для разработки каркаса).
const clock = createServerClock({
  fetchServerNow: env.supabaseConfigured ? fetchServerNow : async () => Date.now(),
});

let last = clock.now();
const subscribe = (cb: () => void) =>
  clock.subscribe((t) => {
    last = t;
    cb();
  });

/** Текущее серверное время в мс (обновляется раз в секунду). */
export function useServerNow(): number {
  return useSyncExternalStore(subscribe, () => last);
}

export const serverNow = () => clock.now();
