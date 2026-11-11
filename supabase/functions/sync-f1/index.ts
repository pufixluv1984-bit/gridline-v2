// Edge Function sync-f1: забирает из Jolpica расписание, заявку и результаты и пишет их в базу
// через атомарные SQL-функции (миграция 0005). Вызывается pg_cron каждые 10 минут.
// Ключ service_role есть только в окружении Supabase (SUPABASE_SERVICE_ROLE_KEY), в браузер не попадает.
//
// Что делает за запуск:
//   • расписание сезона и заявку (кто за кого едет) — раз в 6 часов;
//   • результаты квалификации и гонки — после сессии каждые 10 минут, пока их нет;
//     потом раз в час до 50 часов после старта гонки (штрафы), затем фиксирует (is_final).

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HOUR = 3_600_000;

// Русские названия и slug трасс (slug — имя SVG трассы из макета Tracks).
const GP: Record<string, { name: string; slug: string; country: string }> = {
  albert_park: { name: 'Гран-при Австралии', slug: 'melbourne', country: 'Австралия' },
  shanghai: { name: 'Гран-при Китая', slug: 'shanghai', country: 'Китай' },
  suzuka: { name: 'Гран-при Японии', slug: 'suzuka', country: 'Япония' },
  bahrain: { name: 'Гран-при Бахрейна', slug: 'sakhir', country: 'Бахрейн' },
  jeddah: { name: 'Гран-при Саудовской Аравии', slug: 'jeddah', country: 'Саудовская Аравия' },
  miami: { name: 'Гран-при Майами', slug: 'miami', country: 'США' },
  villeneuve: { name: 'Гран-при Канады', slug: 'montreal', country: 'Канада' },
  monaco: { name: 'Гран-при Монако', slug: 'monte-carlo', country: 'Монако' },
  catalunya: { name: 'Гран-при Барселоны', slug: 'barcelona', country: 'Испания' },
  red_bull_ring: { name: 'Гран-при Австрии', slug: 'spielberg', country: 'Австрия' },
  silverstone: { name: 'Гран-при Великобритании', slug: 'silverstone', country: 'Великобритания' },
  spa: { name: 'Гран-при Бельгии', slug: 'spa-francorchamps', country: 'Бельгия' },
  hungaroring: { name: 'Гран-при Венгрии', slug: 'budapest', country: 'Венгрия' },
  zandvoort: { name: 'Гран-при Нидерландов', slug: 'zandvoort', country: 'Нидерланды' },
  monza: { name: 'Гран-при Италии', slug: 'monza', country: 'Италия' },
  madring: { name: 'Гран-при Испании', slug: 'madrid', country: 'Испания' },
  baku: { name: 'Гран-при Азербайджана', slug: 'baku', country: 'Азербайджан' },
  sepang: { name: 'Гран-при Бахрейна в Малайзии', slug: 'sepang', country: 'Малайзия' },
  marina_bay: { name: 'Гран-при Сингапура', slug: 'singapore', country: 'Сингапур' },
  americas: { name: 'Гран-при США', slug: 'austin', country: 'США' },
  rodriguez: { name: 'Гран-при Мехико', slug: 'mexico-city', country: 'Мексика' },
  interlagos: { name: 'Гран-при Сан-Паулу', slug: 'sao-paulo', country: 'Бразилия' },
  vegas: { name: 'Гран-при Лас-Вегаса', slug: 'las-vegas', country: 'США' },
  losail: { name: 'Гран-при Катара', slug: 'lusail', country: 'Катар' },
  yas_marina: { name: 'Гран-при Абу-Даби', slug: 'yas-marina', country: 'ОАЭ' },
};

const SESSIONS: Record<string, string> = {
  FirstPractice: 'fp1',
  SecondPractice: 'fp2',
  ThirdPractice: 'fp3',
  SprintQualifying: 'sprint_qualy',
  SprintShootout: 'sprint_qualy',
  Sprint: 'sprint',
  Qualifying: 'qualy',
};

type Json = Record<string, unknown>;

async function jolpica(path: string): Promise<Json | null> {
  const res = await fetch(`${JOLPICA}${path}`, { headers: { 'User-Agent': 'Gridline-sync/1.0 (non-commercial fan project)' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Jolpica ${path}: ${res.status}`);
  return (await res.json()) as Json;
}

async function rpc<T>(fn: string, args: Json = {}): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function lastOk(key: string): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/sync_state?key=eq.${encodeURIComponent(key)}&select=last_ok`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const rows = (await res.json()) as { last_ok: string | null }[];
  return rows[0]?.last_ok ? Date.parse(rows[0].last_ok) : 0;
}

const iso = (date?: string, time?: string) => (date ? new Date(`${date}T${time ?? '00:00:00Z'}`).toISOString() : null);

// ── Расписание ──────────────────────────────────────────────────────────
async function syncSchedule(year: number) {
  const data = await jolpica(`/${year}.json`);
  const races = ((data?.MRData as Json)?.RaceTable as Json)?.Races as Json[] | undefined;
  if (!races?.length) return 0;
  const payload = races.map((r) => {
    const circuit = r.Circuit as Json;
    const id = circuit.circuitId as string;
    const gp = GP[id];
    const sessions = Object.entries(SESSIONS)
      .filter(([k]) => r[k])
      .map(([k, kind]) => ({ kind, starts_at: iso((r[k] as Json).date as string, (r[k] as Json).time as string) }));
    sessions.push({ kind: 'race', starts_at: iso(r.date as string, r.time as string) });
    return {
      round: Number(r.round),
      slug: gp?.slug ?? id.replace(/_/g, '-'),
      name: gp?.name ?? (r.raceName as string),
      circuit: (circuit.circuitName as string) ?? id,
      country: gp?.country ?? ((circuit.Location as Json)?.country as string),
      is_sprint: Boolean(r.Sprint),
      sessions: sessions.filter((s) => s.starts_at),
    };
  });
  return rpc<number>('sync_schedule', { season_year: year, races: payload });
}

// ── Заявка: состав последнего прошедшего этапа ──────────────────────────
function resultRow(x: Json) {
  const d = x.Driver as Json;
  const c = x.Constructor as Json;
  return {
    driver_id: d.driverId,
    code: (d.code as string) ?? (d.familyName as string).slice(0, 3).toUpperCase(),
    given_name: d.givenName,
    family_name: d.familyName,
    team_id: c.constructorId,
    team_name: c.name,
    number: x.number ?? d.permanentNumber ?? '',
  };
}

async function syncEntries(year: number) {
  const data = await jolpica(`/${year}/last/results.json`);
  const race = (((data?.MRData as Json)?.RaceTable as Json)?.Races as Json[] | undefined)?.[0];
  const rows = ((race?.Results as Json[]) ?? []).map(resultRow);
  if (!rows.length) return 0;
  return rpc<number>('sync_entries', { season_year: year, rows });
}

// ── Результаты ──────────────────────────────────────────────────────────
type Pending = { season_year: number; round: number; kind: 'qualy' | 'race'; starts_at: string; has_results: boolean; is_final: boolean };

async function syncResults(report: Json) {
  const pending = await rpc<Pending[]>('sync_pending');
  for (const p of pending) {
    if (p.is_final) continue;
    const key = `res-${p.season_year}-${p.round}-${p.kind}`;
    // Пока результата нет — каждый запуск; потом перепроверка раз в час.
    if (p.has_results && Date.now() - (await lastOk(key)) < HOUR) continue;

    const path = p.kind === 'qualy' ? 'qualifying' : 'results';
    const data = await jolpica(`/${p.season_year}/${p.round}/${path}.json`);
    const race = (((data?.MRData as Json)?.RaceTable as Json)?.Races as Json[] | undefined)?.[0];
    const list = (race?.[p.kind === 'qualy' ? 'QualifyingResults' : 'Results'] as Json[]) ?? [];
    if (!list.length) {
      report[key] = 'нет данных';
      continue;
    }
    const rows = list.map((x) => ({
      ...resultRow(x),
      position: x.position,
      position_text: x.positionText ?? x.position,
      grid: x.grid ?? '',
      laps: x.laps ?? '',
      status: x.status ?? null,
      fastest_lap_rank: ((x.FastestLap as Json)?.rank as string) ?? '',
    }));
    // Гонка фиксируется через 50 часов после старта (48 ч на штрафы + сама гонка).
    const final = p.kind === 'race' && Date.now() - Date.parse(p.starts_at) > 50 * HOUR;
    const lines = await rpc<number>('sync_results', {
      season_year: p.season_year,
      round: p.round,
      session: p.kind,
      rows,
      final,
    });
    await rpc('sync_mark', { k: key, ok: true, details: { rows: rows.length, final, score_lines: lines } });
    report[key] = { rows: rows.length, final, score_lines: lines };
  }
}

Deno.serve(async () => {
  const report: Json = {};
  try {
    if (!(await rpc<boolean>('sync_begin'))) {
      return Response.json({ skipped: 'слишком часто' });
    }
    const year = new Date().getUTCFullYear();

    if (Date.now() - (await lastOk('schedule')) > 6 * HOUR) {
      report.schedule = await syncSchedule(year);
      await rpc('sync_mark', { k: 'schedule', ok: true, details: { races: report.schedule } });
    }
    if (Date.now() - (await lastOk('entries')) > 6 * HOUR) {
      report.entries = await syncEntries(year);
      await rpc('sync_mark', { k: 'entries', ok: true, details: { drivers: report.entries } });
    }
    await syncResults(report);
    await rpc('sync_mark', { k: 'run', ok: true, details: report });
    return Response.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await rpc('sync_mark', { k: 'run', ok: false, details: { error: message } }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
});
