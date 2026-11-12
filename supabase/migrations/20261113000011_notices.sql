-- 0011 · Перенос сессии: журнал и предупреждение игрокам (docs/PRODUCT.md §4).
-- Дедлайн и так пересчитывается из расписания при каждой синхронизации; здесь — чтобы игроки
-- об этом узнали: на главной и в прогнозе появляется плашка «перенесли: было … стало …».
-- Плюс sync_needs_coords: у этапов нет координат трасс — расписание обновляется сразу (для погоды).

create table public.event_notices (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  session public.session_kind not null,
  old_at timestamptz not null,
  new_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index event_notices_event on public.event_notices (event_id, created_at desc);
alter table public.event_notices enable row level security;
create policy event_notices_read on public.event_notices for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.event_notices from anon, authenticated;

-- Переносы этапа за 14 дней: по каждой сессии «было» — из самого раннего переноса, «стало» — из последнего.
-- Если сессию перенесли и вернули обратно — плашки нет.
create function public.notices_json(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('session', n.session, 'old_at', n.old_at, 'new_at', n.new_at, 'created_at', n.created_at)
                            order by n.created_at desc), '[]'::jsonb)
  from (
    select x.session,
           (array_agg(x.old_at order by x.created_at, x.id))[1] as old_at,
           (array_agg(x.new_at order by x.created_at desc, x.id desc))[1] as new_at,
           max(x.created_at) as created_at
    from public.event_notices x
    where x.event_id = ev and x.created_at > now() - interval '14 days'
    group by x.session
  ) n
  where n.old_at is distinct from n.new_at
$$;
grant execute on function public.notices_json(bigint) to anon, authenticated;

-- Нужны ли координаты трасс (для погоды): тогда sync-f1 обновит расписание без ожидания 6 часов.
create function public.sync_needs_coords()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e join public.seasons s on s.id = e.season_id and s.is_current
    where e.lat is null
  )
$$;
revoke execute on function public.sync_needs_coords() from public, anon, authenticated;
grant execute on function public.sync_needs_coords() to service_role;

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

    -- Перенос квалификации, спринта или гонки — запись в журнал, игроки увидят предупреждение.
    insert into public.event_notices (event_id, session, old_at, new_at)
    select ev, ss.kind, ss.starts_at, (s ->> 'starts_at')::timestamptz
    from jsonb_array_elements(r -> 'sessions') s
    join public.sessions ss on ss.event_id = ev and ss.kind = (s ->> 'kind')::public.session_kind
    where ss.kind in ('qualy', 'sprint', 'race')
      and abs(extract(epoch from (ss.starts_at - (s ->> 'starts_at')::timestamptz))) > 60;

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
    'notices', case when e is null then '[]'::jsonb else public.notices_json(e) end,
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


create or replace function public.predict_screen(ev bigint default null, league uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := coalesce(ev, public.current_event_id());
  last_ev bigint;
  lg uuid := coalesce(
    (select league where public.is_league_member(league)),
    (select m.league_id from public.league_members m where m.user_id = auth.uid() order by m.joined_at limit 1));
begin
  if e is null then
    return jsonb_build_object('event', null);
  end if;
  select sl.event_id into last_ev
  from public.score_lines sl join public.events x on x.id = sl.event_id
  where sl.user_id = auth.uid()
  order by x.round desc limit 1;

  return jsonb_build_object(
    'event', public.event_json(e),
    'drivers', public.entries_json(e),
    'prediction', (select to_jsonb(p) - 'user_id' - 'event_id' - 'submitted_at'
                   from public.predictions p where p.event_id = e and p.user_id = auth.uid()),
    'boost_used', public.boost_used_elsewhere(e),
    'notices', public.notices_json(e),
    'last', (select jsonb_build_object(
               'name', x.name,
               'total', sum(sl.points * sl.multiplier),
               'qualy', sum(sl.points * sl.multiplier) filter (where sl.block = 'qualy'),
               'race', sum(sl.points * sl.multiplier) filter (where sl.block = 'race'),
               'bonus', sum(sl.points * sl.multiplier) filter (where sl.block = 'bonus'))
             from public.score_lines sl join public.events x on x.id = sl.event_id
             where sl.event_id = last_ev and sl.user_id = auth.uid()
             group by x.name),
    'league', (select jsonb_build_object('id', l.id, 'name', l.name) from public.leagues l where l.id = lg),
    'submissions', case when lg is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(s)) from public.league_submissions(lg, e) s), '[]'::jsonb) end
  );
end $$;

