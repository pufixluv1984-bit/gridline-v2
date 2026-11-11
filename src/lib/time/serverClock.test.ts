import { describe, expect, it, vi } from 'vitest';
import { createServerClock } from './serverClock';

describe('createServerClock', () => {
  it('сдвигает время на разницу с сервером с поправкой на задержку', async () => {
    let local = 1_000;
    const clock = createServerClock({
      localNow: () => local,
      fetchServerNow: async () => {
        local += 200; // запрос шёл 200 мс
        return 10_000;
      },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    await clock.sync();
    // Сервер ответил 10 000 в середине запроса (local = 1100) → сдвиг 8900.
    expect(clock.now()).toBe(local + 8_900);
  });

  it('при ошибке сети оставляет прошлый сдвиг', async () => {
    let fail = false;
    const clock = createServerClock({
      localNow: () => 0,
      fetchServerNow: async () => {
        if (fail) throw new Error('offline');
        return 5_000;
      },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    await clock.sync();
    fail = true;
    await clock.sync();
    expect(clock.now()).toBe(5_000);
  });

  it('один тикер на всех подписчиков и остановка после последней отписки', () => {
    const set = vi.fn(() => Symbol('id'));
    const clear = vi.fn();
    const clock = createServerClock({
      fetchServerNow: async () => 0,
      setInterval: set,
      clearInterval: clear,
    });
    const a = clock.subscribe(() => {});
    const b = clock.subscribe(() => {});
    expect(set).toHaveBeenCalledTimes(2); // тикер + сверка, один раз
    a();
    expect(clear).not.toHaveBeenCalled();
    b();
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
