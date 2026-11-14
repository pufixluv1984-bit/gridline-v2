import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { installTabSync } from './tabSync';

const tick = () => new Promise((r) => setTimeout(r, 30));

describe('tabSync', () => {
  it('изменение в одной вкладке обновляет экраны лиг в другой, черновики не трогает', async () => {
    const a = new QueryClient();
    const b = new QueryClient();
    const notifyA = installTabSync(a);
    installTabSync(b);
    b.setQueryData(['screen', 'league', 'L1'], { code: 'OLD' });
    b.setQueryData(['screen', 'home', 'default'], { x: 1 });
    b.setQueryData(['screen', 'predict', 'current', 'default'], { draft: true });

    notifyA();
    await tick();

    expect(b.getQueryState(['screen', 'league', 'L1'])?.isInvalidated).toBe(true);
    expect(b.getQueryState(['screen', 'home', 'default'])?.isInvalidated).toBe(true);
    expect(b.getQueryState(['screen', 'predict', 'current', 'default'])?.isInvalidated).toBe(false);
  });

  it('экраны лиг обновляются при возврате на вкладку', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
    installTabSync(qc);
    expect(qc.getQueryDefaults(['screen', 'league', 'L1']).refetchOnWindowFocus).toBe('always');
    expect(qc.getQueryDefaults(['screen', 'predict']).refetchOnWindowFocus).toBeUndefined();
  });
});
