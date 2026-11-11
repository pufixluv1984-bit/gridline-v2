-- 0005 · Синхронизация с Jolpica: служебные таблицы и атомарные функции записи для Edge Function sync-f1.
-- Вызывает их только service_role (ключ есть только внутри Supabase). Браузер в Jolpica не ходит.

create table public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Адрес функции для pg_cron. Локально seed.sql очищает его, чтобы локальная база не дёргала боевую функцию.
insert into public.app_config (key, value)
values ('sync_url', 'https://mpyfkxgrqkclfqseviob.supabase.co/functions/v1/sync-f1')
on conflict (key) do nothing;

create table public.sync_state (
  key text primary key,                -- 'run', 'schedule', 'entries'
  last_run timestamptz,
  last_ok timestamptz,
  info jsonb not null default '{}'::jsonb
);
alter table public.sync_state enable row level security;
revoke all on public.sync_state from anon, authenticated;

-- Для подвала «Данные F1 обновлены N минут назад»: только время, без подробностей.
create function public.data_updated_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$ select max(last_ok) from public.sync_state $$;
grant execute on function public.data_updated_at() to anon, authenticated;

-- Не чаще раза в 2 минуты: функцию можно вызвать без ключа, это защищает Jolpica и наш лимит.
create function public.sync_begin(min_gap interval default interval '2 minutes')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev timestamptz;
begin
  insert into public.sync_state (key) values ('run') on conflict (key) do nothing;
  select last_run into prev from public.sync_state where key = 'run' for update;
  if prev is not null and prev > now() - min_gap then
    return false;
  end if;
  update public.sync_state set last_run = now() where key = 'run';
  return true;
end $$;

create function public.sync_mark(k text, ok boolean, details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sync_state (key, last_run, last_ok, info)
  values (k, now(), case when ok then now() end, details)
  on conflict (key) do update
    set last_run = now(),
        last_ok = case when ok then now() else public.sync_state.last_ok end,
        info = excluded.info
$$;

-- Расписание сезона. races: [{round, slug, name, circuit, country, sessions: [{kind, starts_at}]}].
-- Дедлайн прогноза = старт квалификации; перенос сессии сам двигает дедлайн (PRODUCT.md §4).
create function public.sync_schedule(season_year smallint, races jsonb)
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
    insert into public.events (season_id, round, slug, name, circuit, country, is_sprint)
    values (season, (r ->> 'round')::smallint, r ->> 'slug', r ->> 'name', r ->> 'circuit', r ->> 'country',
            coalesce((r ->> 'is_sprint')::boolean, false))
    on conflict (season_id, round) do update
      set slug = excluded.slug, name = excluded.name, circuit = excluded.circuit,
          country = excluded.country, is_sprint = excluded.is_sprint
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

-- Заявка: rows [{driver_id, code, given_name, family_name, team_id, number}] — состав последнего этапа.
create function public.sync_entries(season_year smallint, rows jsonb)
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

  -- Новая команда, которой нет в справочнике, — серый цвет, код из id; поправить можно миграцией.
  insert into public.teams (id, code, name, color)
  select distinct x ->> 'team_id', upper(left(regexp_replace(x ->> 'team_id', '[^a-z]', '', 'g'), 3)), x ->> 'team_name', '#9A9AA4'
  from jsonb_array_elements(rows) x
  on conflict (id) do nothing;

  insert into public.drivers (id, code, given_name, family_name)
  select x ->> 'driver_id', x ->> 'code', x ->> 'given_name', x ->> 'family_name'
  from jsonb_array_elements(rows) x
  on conflict (id) do update set code = excluded.code;

  update public.season_entries set active = false where season_id = season;
  insert into public.season_entries (season_id, driver_id, team_id, number, active)
  select season, x ->> 'driver_id', x ->> 'team_id', nullif(x ->> 'number', '')::smallint, true
  from jsonb_array_elements(rows) x
  on conflict (season_id, driver_id) do update
    set team_id = excluded.team_id, number = excluded.number, active = true;
  return jsonb_array_length(rows);
end $$;

-- Результат сессии целиком (замена) и пересчёт очков — одной транзакцией.
-- rows: [{driver_id, team_id, position, position_text, grid, laps, status, fastest_lap_rank}]
create function public.sync_results(season_year smallint, round smallint, session public.session_kind, rows jsonb, final boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev bigint;
begin
  select e.id into ev
  from public.events e join public.seasons s on s.id = e.season_id
  where s.year = season_year and e.round = sync_results.round;
  if ev is null or jsonb_array_length(rows) = 0 then
    return 0;
  end if;

  -- Пилот, которого нет в справочнике (замена в последний момент), добавляется без русского имени.
  insert into public.drivers (id, code, given_name, family_name)
  select x ->> 'driver_id', x ->> 'code', x ->> 'given_name', x ->> 'family_name'
  from jsonb_array_elements(rows) x
  on conflict (id) do nothing;

  delete from public.results where event_id = ev and kind = session;
  insert into public.results (event_id, kind, driver_id, team_id, position, position_text, grid, laps, status,
                              fastest_lap_rank, source, is_final)
  select ev, session, x ->> 'driver_id', x ->> 'team_id', (x ->> 'position')::smallint, x ->> 'position_text',
         nullif(x ->> 'grid', '')::smallint, nullif(x ->> 'laps', '')::smallint, x ->> 'status',
         nullif(x ->> 'fastest_lap_rank', '')::smallint, 'api', final
  from jsonb_array_elements(rows) x;

  -- Финальность — общая для этапа: квалификация становится финальной вместе с гонкой.
  if final then
    update public.results set is_final = true where event_id = ev;
  end if;
  return public.recompute_event_scores(ev);
end $$;

-- Что опрашивать: этапы, где сессия уже прошла, а результата нет или он ещё не финальный.
create function public.sync_pending()
returns table (season_year smallint, round smallint, kind public.session_kind, starts_at timestamptz, has_results boolean, is_final boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.year, e.round, ss.kind, ss.starts_at,
         exists (select 1 from public.results r where r.event_id = e.id and r.kind = ss.kind),
         coalesce((select bool_and(r.is_final) from public.results r where r.event_id = e.id and r.kind = ss.kind), false)
  from public.sessions ss
  join public.events e on e.id = ss.event_id
  join public.seasons s on s.id = e.season_id
  where ss.kind in ('qualy', 'race')
    and ss.starts_at < now() - interval '1 hour'           -- сессия закончилась
    and ss.starts_at > now() - interval '4 days'           -- 48 ч проверки штрафов + запас
  order by ss.starts_at
$$;

revoke execute on function public.sync_begin(interval) from public, anon, authenticated;
revoke execute on function public.sync_mark(text, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_schedule(smallint, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_entries(smallint, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_results(smallint, smallint, public.session_kind, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.sync_pending() from public, anon, authenticated;
grant execute on function public.sync_begin(interval), public.sync_mark(text, boolean, jsonb),
  public.sync_schedule(smallint, jsonb), public.sync_entries(smallint, jsonb),
  public.sync_results(smallint, smallint, public.session_kind, jsonb, boolean), public.sync_pending(),
  public.recompute_event_scores(bigint)
  to service_role;
