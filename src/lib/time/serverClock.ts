/**
 * Серверные часы: раз в минуту сверяемся с RPC server_now(), между сверками тикаем локально
 * с поправкой на сдвиг. Один общий тикер на всё приложение (docs/ARCHITECTURE.md, «Таймеры»).
 */
export type ServerClock = {
  now(): number;
  subscribe(fn: (now: number) => void): () => void;
  sync(): Promise<void>;
  stop(): void;
};

type Options = {
  fetchServerNow: () => Promise<number>;
  localNow?: () => number;
  tickMs?: number;
  syncMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
};

export function createServerClock(opts: Options): ServerClock {
  const localNow = opts.localNow ?? (() => Date.now());
  const setI = opts.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearI = opts.clearInterval ?? ((id) => globalThis.clearInterval(id as number));
  const tickMs = opts.tickMs ?? 1000;
  const syncMs = opts.syncMs ?? 60_000;

  let offset = 0;
  const subs = new Set<(now: number) => void>();
  let tickId: unknown = null;
  let syncId: unknown = null;

  const now = () => localNow() + offset;
  const emit = () => {
    const t = now();
    subs.forEach((fn) => fn(t));
  };

  const sync = async () => {
    const sentAt = localNow();
    try {
      const server = await opts.fetchServerNow();
      const receivedAt = localNow();
      // Половина времени запроса — оценка задержки в одну сторону.
      offset = server - (sentAt + (receivedAt - sentAt) / 2);
      emit();
    } catch {
      // Сеть пропала — продолжаем тикать с прошлым сдвигом.
    }
  };

  const start = () => {
    if (tickId !== null) return;
    tickId = setI(emit, tickMs);
    syncId = setI(() => void sync(), syncMs);
    void sync();
  };

  const stop = () => {
    if (tickId !== null) clearI(tickId);
    if (syncId !== null) clearI(syncId);
    tickId = syncId = null;
  };

  return {
    now,
    sync,
    stop,
    subscribe(fn) {
      subs.add(fn);
      start();
      return () => {
        subs.delete(fn);
        if (subs.size === 0) stop();
      };
    },
  };
}
