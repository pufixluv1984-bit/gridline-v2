// Edge Function sync-f1: забирает из Jolpica расписание, заявку и результаты и пишет их в базу
// через атомарные SQL-функции (миграция 0005). Вызывается pg_cron каждые 10 минут.
// Ключ service_role есть только в окружении Supabase (SUPABASE_SERVICE_ROLE_KEY), в браузер не попадает.
//
// Что делает за запуск:
//   • расписание сезона и заявку (кто за кого едет) — раз в 6 часов;
//   • результаты квалификации, спринта и гонки — после сессии каждые 10 минут, пока их нет;
//   • фэнтези: блокировка составов со стартом первой сессии уик-энда (автокопия, DRS);
//     потом раз в час до 50 часов после старта гонки (штрафы), затем фиксирует (is_final);
//   • таблицу чемпионата (пилоты и команды) — раз в 3 часа;
//   • погоду на дни текущего этапа (Open-Meteo, CC BY 4.0) — раз в 3 часа;
//   • safety car в гонке (OpenF1 race_control) — после клетчатого флага;
//   • результаты практик (OpenF1 session_result) — только для просмотра, очков не дают;
//   • карьеры пилотов (Jolpica) и биографии (русская Википедия) — по два пилота за запуск, раз в неделю;
//   • переход на новый сезон: когда текущий закончен и в Jolpica есть календарь следующего.

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HOUR = 3_600_000;

// Русские названия и slug трасс (slug — имя SVG трассы из макета Tracks).
const GP: Record<string, { name: string; slug: string; country: string }> = {
  albert_park: { name: 'Гран-при Австралии', slug: 'melbourne', country: 'Австралия' },
  shanghai: { name: 'Гран-при Китая', slug: 'shanghai', country: 'Китай' },
  suzuka: { name: 'Гран-при Японии', slug: 'suzuka', country: 'Япония' },
  bahrain: { name: 'Гран-при Бахрейна', slug: 'bahrain', country: 'Бахрейн' },
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
      lat: Number((circuit.Location as Json)?.lat) || null,
      lon: Number((circuit.Location as Json)?.long) || null,
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

// ── Чемпионат мира ──────────────────────────────────────────────────────
async function syncChampionship(year: number) {
  const d = await jolpica(`/${year}/driverStandings.json?limit=60`);
  const dl = ((((d?.MRData as Json)?.StandingsTable as Json)?.StandingsLists as Json[] | undefined)?.[0]?.DriverStandings as Json[]) ?? [];
  const drivers = dl.map((x) => {
    const dr = x.Driver as Json;
    return {
      position: x.position ?? x.positionText,
      driver_id: dr.driverId,
      code: (dr.code as string) ?? (dr.familyName as string).slice(0, 3).toUpperCase(),
      given_name: dr.givenName,
      family_name: dr.familyName,
      points: x.points,
      wins: x.wins,
    };
  }).filter((x) => x.position);
  const c = await jolpica(`/${year}/constructorStandings.json?limit=30`);
  const cl = ((((c?.MRData as Json)?.StandingsTable as Json)?.StandingsLists as Json[] | undefined)?.[0]?.ConstructorStandings as Json[]) ?? [];
  const teams = cl.map((x) => ({
    position: x.position ?? x.positionText,
    team_id: (x.Constructor as Json).constructorId,
    points: x.points,
    wins: x.wins,
  })).filter((x) => x.position);
  const nd = drivers.length ? await rpc<number>('sync_championship', { season_year: year, kind: 'drivers', rows: drivers }) : 0;
  const nt = teams.length ? await rpc<number>('sync_championship', { season_year: year, kind: 'teams', rows: teams }) : 0;
  return { drivers: nd, teams: nt };
}

// ── Погода (Open-Meteo, без ключа; лицензия CC BY 4.0 — подпись на сайте) ──
type WeatherTarget = { event_id: number; lat: number; lon: number; first_day: string; last_day: string };

async function syncWeather() {
  const [t] = await rpc<WeatherTarget[]>('sync_weather_target');
  if (!t) return 0;
  // Прогноз доступен на 16 дней вперёд; раньше — пропускаем.
  if (Date.parse(t.first_day) - Date.now() > 15 * 24 * HOUR) return 0;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${t.lat}&longitude=${t.lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max,weather_code` +
    `&timezone=UTC&start_date=${String(t.first_day).slice(0, 10)}&end_date=${String(t.last_day).slice(0, 10)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Gridline-sync/1.0 (non-commercial fan project)' } });
  if (!res.ok) throw new Error(`Open-Meteo: ${res.status}`);
  const d = (await res.json()) as { daily?: Record<string, (number | string | null)[]> };
  const days = (d.daily?.time ?? []).map((day, i) => ({
    day,
    t_max: d.daily?.temperature_2m_max?.[i] ?? null,
    t_min: d.daily?.temperature_2m_min?.[i] ?? null,
    wind_max: d.daily?.wind_speed_10m_max?.[i] ?? null,
    precip_prob: d.daily?.precipitation_probability_max?.[i] ?? null,
    code: d.daily?.weather_code?.[i] ?? null,
  }));
  return rpc<number>('sync_weather', { ev: t.event_id, days });
}

// ── Результаты ──────────────────────────────────────────────────────────
type Pending = { season_year: number; round: number; kind: 'qualy' | 'race' | 'sprint'; starts_at: string; has_results: boolean; is_final: boolean };

async function syncResults(report: Json) {
  const pending = await rpc<Pending[]>('sync_pending');
  for (const p of pending) {
    if (p.is_final) continue;
    const key = `res-${p.season_year}-${p.round}-${p.kind}`;
    // Пока результата нет — каждый запуск; потом перепроверка раз в час.
    if (p.has_results && Date.now() - (await lastOk(key)) < HOUR) continue;

    const path = p.kind === 'qualy' ? 'qualifying' : p.kind === 'sprint' ? 'sprint' : 'results';
    const listKey = p.kind === 'qualy' ? 'QualifyingResults' : p.kind === 'sprint' ? 'SprintResults' : 'Results';
    const data = await jolpica(`/${p.season_year}/${p.round}/${path}.json`);
    const race = (((data?.MRData as Json)?.RaceTable as Json)?.Races as Json[] | undefined)?.[0];
    const list = (race?.[listKey] as Json[]) ?? [];
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
      // Докуда дошёл в квалификации (бонус конструктора в фэнтези): есть время Q3 → 3, Q2 → 2.
      q_reached: p.kind === 'qualy' ? (x.Q3 ? 3 : x.Q2 ? 2 : 1) : '',
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

// ── OpenF1: safety car (сообщения дирекции гонки) и практики (только просмотр) ──
const OPENF1 = 'https://api.openf1.org/v1';
const OPENF1_NAMES: Record<string, string> = { fp1: 'Practice 1', fp2: 'Practice 2', fp3: 'Practice 3', race: 'Race' };

async function openf1(path: string): Promise<Json[]> {
  const res = await fetch(`${OPENF1}${path}`, { headers: { 'User-Agent': 'Gridline-sync/1.0 (non-commercial fan project)' } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OpenF1 ${path}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as Json[]) : [];
}

/** session_key OpenF1 для нашей сессии: то же название и старт в пределах 3 часов. */
async function openf1Session(year: number, kind: string, startsAt: string): Promise<number | null> {
  const name = OPENF1_NAMES[kind];
  if (!name) return null;
  const list = await openf1(`/sessions?year=${year}&session_name=${encodeURIComponent(name)}`);
  const at = Date.parse(startsAt);
  const hit = list.find((s) => Math.abs(Date.parse(String(s.date_start)) - at) < 3 * HOUR);
  return hit ? Number(hit.session_key) : null;
}

type ScPending = { season_year: number; round: number; race_at: string };

/** Был ли настоящий safety car в гонке (не VSC и не красный флаг — решение владельца 13.11.2026). */
async function syncSafetyCar(report: Json) {
  const pending = await rpc<ScPending[]>('sync_sc_pending');
  for (const p of pending) {
    const key = await openf1Session(p.season_year, 'race', p.race_at);
    if (!key) continue;
    const msgs = await openf1(`/race_control?session_key=${key}`);
    // Ждём клетчатый флаг: пока гонка не закончилась, ответ «нет» был бы преждевременным.
    if (!msgs.some((m) => String(m.flag) === 'CHEQUERED')) continue;
    const sc = msgs.some((m) => String(m.category) === 'SafetyCar' && /^SAFETY CAR DEPLOYED/.test(String(m.message)));
    const lines = await rpc<number>('sync_safety_car', { season_year: p.season_year, round: p.round, value: sc });
    report[`sc-${p.season_year}-${p.round}`] = { safety_car: sc, score_lines: lines };
  }
}

type PracticePending = { season_year: number; round: number; kind: string; starts_at: string };
type EntryNumber = { number: number; driver_id: string; team_id: string };

async function syncPractice(report: Json) {
  const pending = await rpc<PracticePending[]>('sync_practice_pending');
  if (!pending.length) return;
  const byYear = new Map<number, Map<number, EntryNumber>>();
  for (const p of pending) {
    if (!byYear.has(p.season_year)) {
      const list = await rpc<EntryNumber[]>('sync_entries_numbers', { season_year: p.season_year });
      byYear.set(p.season_year, new Map(list.map((e) => [Number(e.number), e])));
    }
    const numbers = byYear.get(p.season_year)!;
    const key = await openf1Session(p.season_year, p.kind, p.starts_at);
    if (!key) continue;
    const rows = (await openf1(`/session_result?session_key=${key}`))
      .filter((r) => r.position != null && numbers.has(Number(r.driver_number)))
      .map((r) => {
        const e = numbers.get(Number(r.driver_number))!;
        const best = typeof r.duration === 'number' ? r.duration : null;
        const gap = typeof r.gap_to_leader === 'number' ? r.gap_to_leader : null;
        return {
          driver_id: e.driver_id,
          team_id: e.team_id,
          position: r.position,
          laps: r.number_of_laps ?? '',
          best_ms: best != null ? Math.round(best * 1000) : '',
          gap_ms: gap != null ? Math.round(gap * 1000) : '',
        };
      });
    if (!rows.length) continue;
    const n = await rpc<number>('sync_practice', { season_year: p.season_year, round: p.round, session: p.kind, rows });
    report[`${p.kind}-${p.season_year}-${p.round}`] = n;
  }
}

// ── Карьеры пилотов (фаза 3): Jolpica + биография из русской Википедии ─────
// За запуск — до двух пилотов; законченные сезоны берутся из базы, так что повторно это ≈9 запросов на пилота (с паузой).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WIKI_UA = { 'User-Agent': 'Gridline-sync/1.0 (non-commercial fan project)' };

async function jolpicaSlow(path: string): Promise<Json | null> {
  await sleep(350);
  return jolpica(path);
}
const mr = (x: Json | null) => (x?.MRData ?? {}) as Json;
const totalOf = async (path: string) => Number(mr(await jolpicaSlow(`${path}.json?limit=1`)).total ?? 0);
const raceName = (race: Json | undefined) => {
  if (!race) return null;
  const circuit = ((race.Circuit as Json | undefined)?.circuitId as string | undefined) ?? '';
  return GP[circuit]?.name ?? (race.raceName as string);
};

async function wikiBio(enUrl: string): Promise<{ bio: string | null; bio_url: string | null }> {
  const title = decodeURIComponent(enUrl.split('/wiki/')[1] ?? '');
  if (!title) return { bio: null, bio_url: null };
  const ll = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=ru&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`,
    { headers: WIKI_UA },
  );
  if (!ll.ok) return { bio: null, bio_url: null };
  const ru = ((await ll.json()) as { query?: { pages?: { langlinks?: { title: string }[] }[] } }).query?.pages?.[0]?.langlinks?.[0]?.title;
  if (!ru) return { bio: null, bio_url: null };
  // Вступление статьи простым текстом (несколько абзацев), без знаков ударения.
  const ex = await fetch(
    `https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(ru)}`,
    { headers: WIKI_UA },
  );
  if (!ex.ok) return { bio: null, bio_url: null };
  const page = ((await ex.json()) as { query?: { pages?: { title: string; extract?: string }[] } }).query?.pages?.[0];
  const text = (page?.extract ?? '').replace(/́/g, '').replace(/\n{2,}/g, '\n').trim();
  if (!text) return { bio: null, bio_url: null };
  const bio = text.length > 4000 ? `${text.slice(0, 3990).replace(/\s\S*$/, '')}…` : text;
  return { bio, bio_url: `https://ru.wikipedia.org/wiki/${encodeURIComponent((page?.title ?? ru).replaceAll(' ', '_'))}` };
}

type CareerSeason = { year: number; position: number | null; points: number; wins: number; final: boolean; teams: { id: string; name: string }[] };

async function syncCareers(year: number): Promise<Json> {
  const pending = await rpc<{ driver_id: string; need_bio: boolean; seasons: CareerSeason[] | null }[]>('sync_careers_pending', { n: 2 });
  if (!pending.length) return { drivers: 0 };
  // Сколько этапов в текущем сезоне — чтобы не засчитать титул до последнего этапа.
  const seasonRaces = Number(mr(await jolpicaSlow(`/${year}.json?limit=1`)).total ?? 0);
  let budget = 10; // запросов таблиц по сезонам за запуск; остальное — в следующий
  const done: string[] = [];
  const partial: string[] = [];
  for (const p of pending) {
    const id = p.driver_id;
    try {
      const d = ((mr(await jolpicaSlow(`/drivers/${id}.json`)).DriverTable as Json | undefined)?.Drivers as Json[] | undefined)?.[0];
      if (!d) continue;
      // Таблица чемпионата в Jolpica — только по сезону. Законченные сезоны уже лежат в базе, их не перезапрашиваем.
      const years = (((mr(await jolpicaSlow(`/drivers/${id}/seasons.json?limit=100`)).SeasonTable as Json | undefined)?.Seasons ??
        []) as Json[]).map((x) => Number(x.season));
      const known = new Map((p.seasons ?? []).filter((x) => x.final).map((x) => [x.year, x]));
      const seasons: CareerSeason[] = [];
      let incomplete = false;
      for (const y of years) {
        const k = known.get(y);
        if (k) {
          seasons.push(k);
          continue;
        }
        if (budget <= 0) {
          incomplete = true;
          continue;
        }
        budget--;
        const l = (((mr(await jolpicaSlow(`/${y}/drivers/${id}/driverStandings.json`)).StandingsTable as Json | undefined)
          ?.StandingsLists ?? []) as Json[])[0];
        const st = ((l?.DriverStandings as Json[] | undefined) ?? [])[0];
        if (!l || !st) continue;
        seasons.push({
          year: y,
          position: Number(st.position ?? st.positionText) || null,
          points: Number(st.points ?? 0),
          wins: Number(st.wins ?? 0),
          final: y < year || (seasonRaces > 0 && Number(l.round) >= seasonRaces),
          teams: ((st.Constructors as Json[]) ?? []).map((c) => ({ id: c.constructorId as string, name: c.name as string })),
        });
      }
      if (incomplete) {
        // Сохраняем готовые сезоны; пилот останется в очереди и догрузится в следующий запуск.
        await rpc('sync_driver_career', { driver: id, data: { partial: true, seasons } });
        partial.push(id);
        break;
      }
      const firstRes = mr(await jolpicaSlow(`/drivers/${id}/results.json?limit=1`));
      const debut = ((firstRes.RaceTable as Json | undefined)?.Races as Json[] | undefined)?.[0];
      const winsRes = mr(await jolpicaSlow(`/drivers/${id}/results/1.json?limit=1`));
      const firstWin = (((winsRes.RaceTable as Json | undefined)?.Races ?? []) as Json[])[0];
      const wins = Number(winsRes.total ?? 0);
      const data: Json = {
        born: d.dateOfBirth ?? null,
        nationality: d.nationality ?? null,
        debut_year: debut ? Number(debut.season) : null,
        debut_race: raceName(debut),
        first_win_year: firstWin ? Number(firstWin.season) : null,
        first_win_race: raceName(firstWin),
        starts: Number(firstRes.total ?? 0),
        wins,
        podiums: wins + (await totalOf(`/drivers/${id}/results/2`)) + (await totalOf(`/drivers/${id}/results/3`)),
        // Фильтр Jolpica /qualifying/1 врёт (отдаёт не только поулы), поэтому считаем старты с первого места.
        poles: await totalOf(`/drivers/${id}/grid/1/results`),
        fastest_laps: await totalOf(`/drivers/${id}/fastest/1/results`),
        seasons,
      };
      if (p.need_bio && typeof d.url === 'string') {
        try {
          Object.assign(data, await wikiBio(d.url));
        } catch {
          /* Википедия недоступна — биография подтянется в следующий раз */
        }
      }
      await rpc('sync_driver_career', { driver: id, data });
      done.push(id);
    } catch (e) {
      // Лимит Jolpica (429) или сбой — остальное подождёт следующего запуска.
      return { drivers: done.length, ids: done, partial, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { drivers: done.length, ids: done, partial };
}

Deno.serve(async () => {
  const report: Json = {};
  try {
    if (!(await rpc<boolean>('sync_begin'))) {
      return Response.json({ skipped: 'слишком часто' });
    }
    // Текущий сезон — из базы. Когда он закончен, раз в 6 часов ищем календарь следующего и переключаемся
    // (решение владельца 12.11.2026: переход на новый сезон автоматический).
    let year = await rpc<number>('sync_season_year');
    if ((await rpc<boolean>('sync_season_done')) && Date.now() - (await lastOk('next-season')) > 6 * HOUR) {
      try {
        const races = await syncSchedule(year + 1);
        await rpc('sync_mark', { k: 'next-season', ok: true, details: { year: year + 1, races } });
        if (races > 0) {
          const next = await rpc<number | null>('sync_season_rollover');
          if (next) {
            year = next;
            report.rollover = next;
          }
        }
      } catch (e) {
        report.next_season = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // Расписание — раз в 6 часов или сразу, если у этапов ещё нет координат трасс (нужны для погоды).
    if (Date.now() - (await lastOk('schedule')) > 6 * HOUR || (await rpc<boolean>('sync_needs_coords'))) {
      report.schedule = await syncSchedule(year);
      await rpc('sync_mark', { k: 'schedule', ok: true, details: { races: report.schedule } });
    }
    if (Date.now() - (await lastOk('entries')) > 6 * HOUR) {
      report.entries = await syncEntries(year);
      await rpc('sync_mark', { k: 'entries', ok: true, details: { drivers: report.entries } });
    }
    // Фэнтези: блокировка составов со стартом первой сессии (автокопия, DRS) — до результатов этапа.
    try {
      report.fantasy_lock = await rpc<number>('fantasy_lock_due');
    } catch (e) {
      report.fantasy_lock = { error: e instanceof Error ? e.message : String(e) };
    }
    await syncResults(report);
    // Бонусы фазы 2: safety car и практики из OpenF1 (бета) — их сбой не мешает остальному.
    try {
      await syncSafetyCar(report);
    } catch (e) {
      report.safety_car = { error: e instanceof Error ? e.message : String(e) };
    }
    try {
      await syncPractice(report);
    } catch (e) {
      report.practice = { error: e instanceof Error ? e.message : String(e) };
    }
    // Чемпионат и погода — не критичны: их сбой не должен мешать результатам.
    if (Date.now() - (await lastOk('championship')) > 3 * HOUR) {
      try {
        report.championship = await syncChampionship(year);
        await rpc('sync_mark', { k: 'championship', ok: true, details: report.championship as Json });
      } catch (e) {
        report.championship = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (Date.now() - (await lastOk('weather')) > 3 * HOUR || report.schedule) {
      try {
        report.weather = await syncWeather();
        await rpc('sync_mark', { k: 'weather', ok: true, details: { days: report.weather } });
      } catch (e) {
        report.weather = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    // Карьеры пилотов для каталога и профиля пилота — по два за запуск, раз в неделю на пилота.
    try {
      report.careers = await syncCareers(year);
    } catch (e) {
      report.careers = { error: e instanceof Error ? e.message : String(e) };
    }
    await rpc('sync_mark', { k: 'run', ok: true, details: report });
    return Response.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await rpc('sync_mark', { k: 'run', ok: false, details: { error: message } }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
});
