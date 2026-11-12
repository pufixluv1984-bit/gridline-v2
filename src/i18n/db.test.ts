import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbText, loadDbText, translateDeep, translatingFetch } from './db';
import { COUNTRIES, DRIVERS, ERRORS, GRANDS_PRIX, PRICE_REASONS, TEAMS } from './dbText';
import { gpLines, gpShort } from '@/lib/time/format';

const migrations = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sync = Object.values(
  import.meta.glob('/supabase/functions/sync-f1/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
)[0]!;
const sql = Object.values(migrations).join('\n');

const known = (rows: readonly (readonly string[])[]) => new Set(rows.map((r) => r[0]));

describe('словарь текстов базы покрывает всё, что база пишет по-русски', () => {
  it('этапы и страны из sync-f1', () => {
    const gps = known(GRANDS_PRIX);
    const countries = known(COUNTRIES);
    const rows = [...sync.matchAll(/name: '([^']+)', slug: '[^']+', country: '([^']+)'/g)];
    expect(rows.length).toBeGreaterThan(20);
    for (const [, name, country] of rows) {
      expect(gps, name).toContain(name);
      expect(countries, country).toContain(country);
    }
  });

  it('команды и пилоты из миграций', () => {
    const teams = [...sql.matchAll(/\('[a-z_]+', '[A-Z]{2,3}', '([^']+)', '#[0-9A-Fa-f]{6}'\)/g)].map((m) => m[1]!);
    const drivers = [...sql.matchAll(/\('[a-z_]+', '[A-Z]{3}', '[^']+', '[^']+', '([^']+)'\)/g)].map((m) => m[1]!);
    expect(teams.length).toBeGreaterThan(9);
    expect(drivers.length).toBeGreaterThan(19);
    teams.forEach((n) => expect(known(TEAMS), n).toContain(n));
    drivers.forEach((n) => expect(known(DRIVERS), n).toContain(n));
  });

  it('сообщения об ошибках', async () => {
    await loadDbText('en');
    const msgs = [...sql.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]!).filter((m) => !m.startsWith('avatars:'));
    expect(msgs.length).toBeGreaterThan(30);
    for (const m of new Set(msgs)) {
      const sample = m.replaceAll('%', 'NOR');
      expect(dbText(sample), m).not.toBe(sample);
    }
  });

  it('причины изменения цены', async () => {
    await loadDbText('en');
    const reasons = [...sql.matchAll(/'([а-яё][^'%]*)'/g)].map((m) => m[1]!);
    expect(reasons.length).toBeGreaterThan(10);
    reasons.forEach((r) => expect(known(PRICE_REASONS), r).toContain(r));
    expect(dbText('справедливая $12.3M · тренд вверх')).toBe('fair $12.3M · trending up');
    expect(dbText('новичок: 90% цены напарника')).toBe('rookie: 90% of the teammate’s price');
  });

  it('у каждой строки три непустых языка', () => {
    for (const row of [...GRANDS_PRIX, ...COUNTRIES, ...TEAMS, ...DRIVERS, ...PRICE_REASONS, ...ERRORS]) {
      expect(row.slice(0, 3).every((s) => s.trim().length > 0), row[0]).toBe(true);
    }
  });
});

describe('перевод ответов базы', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('переводит на любой язык и обратно', async () => {
    await loadDbText('uk');
    expect(dbText('Гран-при Катара')).toBe('Гран-прі Катару');
    expect(dbText('Qatar Grand Prix')).toBe('Гран-прі Катару');
    await loadDbText('ru');
    expect(dbText('Гран-прі Катару')).toBe('Гран-при Катара');
    expect(dbText('Max Verstappen')).toBe('Макс Ферстаппен');
    expect(dbText('Пилота NOR нет в заявке сезона')).toBe('Пилота NOR нет в заявке сезона');
    await loadDbText('en');
    expect(dbText('Пилота NOR нет в заявке сезона')).toBe('Driver NOR isn’t on this season’s entry list');
    expect(dbText('кто-то')).toBe('кто-то');
  });

  it('обходит вложенные данные, не трогает ники и не пересоздаёт неизменённое', async () => {
    await loadDbText('en');
    const same = { a: [1, 'x', { b: null }] };
    expect(translateDeep(same)).toBe(same);
    const data = { event: { name: 'Гран-при Монако', country: 'Монако' }, rows: [{ nickname: 'Мерседес', team_name: 'Мерседес' }], n: 3 };
    const out = translateDeep(data);
    expect(out).toEqual({ event: { name: 'Monaco Grand Prix', country: 'Monaco' }, rows: [{ nickname: 'Мерседес', team_name: 'Mercedes' }], n: 3 });
    expect(data.event.name).toBe('Гран-при Монако');
  });

  it('короткие имена и заголовок этапа', async () => {
    await loadDbText('en');
    expect(gpShort('Australian Grand Prix')).toBe('Australia');
    expect(gpShort('Гран-при Катара')).toBe('Катара');
    expect(gpLines('Las Vegas Grand Prix')).toEqual(['Las Vegas', 'Grand Prix']);
    expect(gpLines('Гран-при Лас-Вегаса')).toEqual(['Гран-при', 'Лас-Вегаса']);
  });

  it('fetch: переводит ответы PostgREST, остальное пропускает', async () => {
    await loadDbText('en');
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fake = vi.fn(async (url: string) => {
      if (url.includes('/auth/')) return json({ name: 'Мерседес' });
      if (url.includes('empty')) return new Response(null, { status: 204, headers: { 'content-type': 'application/json' } });
      if (url.includes('err')) return json({ message: 'Ты не в этой лиге', code: 'P0001', hint: null }, 400);
      return json([{ name: 'Феррари' }]);
    });
    vi.stubGlobal('fetch', fake);
    await expect((await translatingFetch('https://x.supabase.co/rest/v1/rpc/a')).json()).resolves.toEqual([{ name: 'Ferrari' }]);
    const err = await translatingFetch('https://x.supabase.co/rest/v1/rpc/err');
    expect(err.status).toBe(400);
    await expect(err.json()).resolves.toMatchObject({ message: 'You’re not in this league', code: 'P0001' });
    expect((await translatingFetch('https://x.supabase.co/rest/v1/empty')).status).toBe(204);
    await expect((await translatingFetch('https://x.supabase.co/auth/v1/user')).json()).resolves.toEqual({ name: 'Мерседес' });
  });
});
