-- 0009 · Чемпионат мира (Jolpica) и погода уик-энда (Open-Meteo) для главной (макет Main).
-- Обе вещи кладёт sync-f1 на сервере: браузер во внешние сервисы не ходит.

-- Координаты трассы для прогноза погоды (из Jolpica Circuit.Location).
alter table public.events add column lat double precision, add column lon double precision;

create table public.championship (
  season_id smallint not null references public.seasons (id) on delete cascade,
  kind text not null check (kind in ('drivers', 'teams')),
  position smallint not null check (position between 1 and 60),
  driver_id text references public.drivers (id),
  team_id text references public.teams (id),
  points numeric(6, 1) not null,
  wins smallint not null default 0,
  primary key (season_id, kind, position)
);
alter table public.championship enable row level security;
create policy championship_read on public.championship for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.championship from anon, authenticated;

create table public.event_weather (
  event_id bigint not null references public.events (id) on delete cascade,
  day date not null,
  t_max numeric(4, 1),
  t_min numeric(4, 1),
  wind_max numeric(5, 1),        -- км/ч
  precip_prob smallint,          -- %
  code smallint,                 -- WMO weather code (ясно, облачно, дождь…)
  updated_at timestamptz not null default now(),
  primary key (event_id, day)
);
alter table public.event_weather enable row level security;
create policy event_weather_read on public.event_weather for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.event_weather from anon, authenticated;

-- Расписание теперь пишет и координаты трассы.
create or replace function public.sync_schedule(season_year smallint, races jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season smallint;
  r jsonb;
  ev bigint;
  n integer := 0;
begin
  insert into public.seasons (year) values (season_year) on conflict (year) do nothing;
  select id into season from public.seasons where year = season_year;

  for r in select * from jsonb_array_elements(races) loop
    insert into public.events (season_id, round, slug, name, circuit, country, is_sprint, lat, lon)
    values (season, (r ->> 'round')::smallint, r ->> 'slug', r ->> 'name', r ->> 'circuit', r ->> 'country',
            coalesce((r ->> 'is_sprint')::boolean, false), (r ->> 'lat')::double precision, (r ->> 'lon')::double precision)
    on conflict (season_id, round) do update
      set slug = excluded.slug, name = excluded.name, circuit = excluded.circuit,
          country = excluded.country, is_sprint = excluded.is_sprint, lat = excluded.lat, lon = excluded.lon
    returning id into ev;

    insert into public.sessions (event_id, kind, starts_at, deadline_at)
    select ev, (s ->> 'kind')::public.session_kind, (s ->> 'starts_at')::timestamptz,
           case when s ->> 'kind' = 'qualy' then (s ->> 'starts_at')::timestamptz end
    from jsonb_array_elements(r -> 'sessions') s
    on conflict (event_id, kind) do update
      set starts_at = excluded.starts_at, deadline_at = excluded.deadline_at;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Таблица чемпионата целиком (замена). rows: [{position, driver_id|team_id, points, wins, ...}]
create function public.sync_championship(season_year smallint, kind text, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season smallint;
begin
  select id into season from public.seasons where year = season_year;
  if season is null or jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  if kind = 'drivers' then
    insert into public.drivers (id, code, given_name, family_name)
    select x ->> 'driver_id', x ->> 'code', x ->> 'given_name', x ->> 'family_name'
    from jsonb_array_elements(rows) x
    on conflict (id) do nothing;
  end if;
  delete from public.championship c where c.season_id = season and c.kind = sync_championship.kind;
  insert into public.championship (season_id, kind, position, driver_id, team_id, points, wins)
  select season, sync_championship.kind, (x ->> 'position')::smallint,
         nullif(x ->> 'driver_id', ''), nullif(x ->> 'team_id', ''),
         (x ->> 'points')::numeric, coalesce((x ->> 'wins')::smallint, 0)
  from jsonb_array_elements(rows) x
  where nullif(x ->> 'team_id', '') is null or exists (select 1 from public.teams t where t.id = x ->> 'team_id');
  return jsonb_array_length(rows);
end $$;

-- Погода этапа по дням (замена). days: [{day, t_max, t_min, wind_max, precip_prob, code}]
create function public.sync_weather(ev bigint, days jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_weather where event_id = ev;
  insert into public.event_weather (event_id, day, t_max, t_min, wind_max, precip_prob, code)
  select ev, (x ->> 'day')::date, (x ->> 't_max')::numeric, (x ->> 't_min')::numeric,
         (x ->> 'wind_max')::numeric, (x ->> 'precip_prob')::smallint, (x ->> 'code')::smallint
  from jsonb_array_elements(days) x;
  return jsonb_array_length(days);
end $$;

-- Для погоды: текущий этап с координатами и днями сессий.
create function public.sync_weather_target()
returns table (event_id bigint, lat double precision, lon double precision, first_day date, last_day date)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.lat, e.lon, min(s.starts_at)::date, max(s.starts_at)::date
  from public.events e join public.sessions s on s.event_id = e.id
  where e.id = public.current_event_id() and e.lat is not null
  group by e.id, e.lat, e.lon
$$;

revoke execute on function public.sync_championship(smallint, text, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_weather(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_weather_target() from public, anon, authenticated;
grant execute on function public.sync_championship(smallint, text, jsonb), public.sync_weather(bigint, jsonb),
  public.sync_weather_target() to service_role;

-- ── Главная: добавляем чемпионат (топ-5) и погоду ──────────────────────
create function public.championship_top(kind text, lim integer default 5)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by (x ->> 'position')::int), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'position', c.position, 'points', c.points, 'wins', c.wins,
      'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
      'number', se.number,
      'team_name', coalesce(t.name, t2.name), 'team_code', coalesce(t.code, t2.code), 'color', coalesce(t.color, t2.color)
    ) as x
    from public.championship c
    join public.seasons s on s.id = c.season_id and s.is_current
    left join public.drivers d on d.id = c.driver_id
    left join public.season_entries se on se.season_id = c.season_id and se.driver_id = c.driver_id
    left join public.teams t on t.id = se.team_id
    left join public.teams t2 on t2.id = c.team_id
    where c.kind = championship_top.kind
    order by c.position
    limit lim
  ) q
$$;
grant execute on function public.championship_top(text, integer) to anon, authenticated;

create function public.weather_json(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', w.day, 't_max', w.t_max, 't_min', w.t_min, 'wind_max', w.wind_max,
    'precip_prob', w.precip_prob, 'code', w.code) order by w.day), '[]'::jsonb)
  from public.event_weather w where w.event_id = ev
$$;
grant execute on function public.weather_json(bigint) to anon, authenticated;

-- home_screen: те же поля плюс championship и weather.
create or replace function public.home_screen(league uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := public.current_event_id();
  my_leagues jsonb;
  lg uuid;
  last_ev bigint;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', l.name,
           'member_count', (select count(*) from public.league_members m2 where m2.league_id = l.id)) order by m.joined_at), '[]'::jsonb)
    into my_leagues
  from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = auth.uid();

  lg := coalesce(
    (select league where public.is_league_member(league)),
    (select m.league_id from public.league_members m where m.user_id = auth.uid() order by m.joined_at limit 1)
  );

  select r.event_id into last_ev
  from public.results r join public.events x on x.id = r.event_id
  where r.kind = 'race'
  order by x.round desc limit 1;

  return jsonb_build_object(
    'event', case when e is null then null else public.event_json(e) end,
    'track', (select slug from public.events where id = e),
    'weather', case when e is null then '[]'::jsonb else public.weather_json(e) end,
    'championship', jsonb_build_object('drivers', public.championship_top('drivers'), 'teams', public.championship_top('teams')),
    'submitted', exists (select 1 from public.predictions p where p.event_id = e and p.user_id = auth.uid()),
    'season_done', (select count(distinct r.event_id) from public.results r where r.kind = 'race'),
    'last_race', (select jsonb_build_object(
                    'event', x.name, 'round', x.round,
                    'podium', (select jsonb_agg(jsonb_build_object(
                                 'position', r.position, 'code', d.code,
                                 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                 'team_name', t.name, 'team_code', t.code, 'color', t.color) order by r.position)
                               from public.results r
                               join public.drivers d on d.id = r.driver_id
                               left join public.teams t on t.id = r.team_id
                               where r.event_id = x.id and r.kind = 'race' and r.position <= 3))
                  from public.events x where x.id = last_ev),
    'next_events', coalesce((
      select jsonb_agg(jsonb_build_object('round', n.round, 'name', n.name, 'race_at', n.race_at) order by n.round)
      from (select x.round, x.name, s.starts_at as race_at
            from public.events x
            join public.sessions s on s.event_id = x.id and s.kind = 'race'
            where x.season_id = (select season_id from public.events where id = e)
              and x.round > (select round from public.events where id = e)
            order by x.round limit 3) n), '[]'::jsonb),
    'leagues', my_leagues,
    'league_id', lg,
    'table', case when lg is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(t) order by t.rank, t.nickname) from public.league_table(lg) t), '[]'::jsonb) end,
    'submissions', case when lg is null or e is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(s)) from public.league_submissions(lg, e) s), '[]'::jsonb) end
  );
end $$;
