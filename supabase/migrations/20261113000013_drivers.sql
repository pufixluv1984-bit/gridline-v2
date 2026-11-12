-- 0013 · Фаза 3: каталог пилотов и профиль пилота (макеты Drivers, Driver-Profile).
-- Карьера — из Jolpica F1 API, биография — из русской Википедии (CC BY-SA, с указанием источника).
-- Всё забирает Edge Function sync-f1 (service_role); браузер во внешние API не ходит.

create table public.driver_careers (
  driver_id text primary key references public.drivers (id) on delete cascade,
  born date,
  nationality text,                      -- как в Jolpica: British, Dutch…
  debut_year smallint,
  debut_race text,                       -- по-русски, если трасса известна
  first_win_year smallint,
  first_win_race text,
  starts integer not null default 0,
  wins integer not null default 0,
  poles integer not null default 0,
  podiums integer not null default 0,
  fastest_laps integer not null default 0,
  -- [{year, position, points, wins, final, teams: [{id, name}]}]; final — сезон закончен (титул считается)
  seasons jsonb not null default '[]'::jsonb check (jsonb_typeof(seasons) = 'array'),
  bio text check (char_length(bio) <= 4000),
  bio_url text check (bio_url ~ '^https://ru\.wikipedia\.org/'),
  updated_at timestamptz not null default now(),
  bio_updated_at timestamptz
);
alter table public.driver_careers enable row level security;
create policy driver_careers_read on public.driver_careers for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.driver_careers from anon, authenticated;

-- Титулы: только законченные сезоны (текущий засчитывается после последнего этапа).
create function public.career_titles(seasons jsonb)
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg((x ->> 'year')::smallint order by (x ->> 'year')::smallint), '{}')
  from jsonb_array_elements(seasons) x
  where (x ->> 'position') = '1' and coalesce((x ->> 'final')::boolean, false)
$$;
grant execute on function public.career_titles(jsonb) to anon, authenticated;

-- ── Синхронизация (service_role) ─────────────────────────────────────────
-- Кого обновить: пилоты заявки текущего сезона без карьеры или с карьерой старше 7 дней.
create function public.sync_careers_pending(n integer default 2)
returns table (driver_id text, need_bio boolean, seasons jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select se.driver_id,
         c.bio_updated_at is null or c.bio_updated_at < now() - interval '30 days',
         c.seasons
  from public.season_entries se
  join public.seasons s on s.id = se.season_id and s.is_current
  left join public.driver_careers c on c.driver_id = se.driver_id
  where se.active and (c.driver_id is null or c.updated_at < now() - interval '7 days')
  order by c.updated_at nulls first, se.driver_id
  limit greatest(1, least(n, 5))
$$;

create function public.sync_driver_career(driver text, data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Частичная загрузка (длинная карьера, лимит API): сохраняем только готовые сезоны,
  -- а дату обновления оставляем старой, чтобы пилот снова попал в очередь.
  if coalesce((data ->> 'partial')::boolean, false) then
    insert into public.driver_careers as c (driver_id, seasons, updated_at)
    values (driver, coalesce(data -> 'seasons', '[]'::jsonb), now() - interval '8 days')
    on conflict (driver_id) do update set seasons = excluded.seasons, updated_at = now() - interval '8 days';
    return;
  end if;
  insert into public.driver_careers as c (
    driver_id, born, nationality, debut_year, debut_race, first_win_year, first_win_race,
    starts, wins, poles, podiums, fastest_laps, seasons, bio, bio_url, updated_at, bio_updated_at)
  values (
    driver, (data ->> 'born')::date, data ->> 'nationality',
    (data ->> 'debut_year')::smallint, data ->> 'debut_race',
    (data ->> 'first_win_year')::smallint, data ->> 'first_win_race',
    coalesce((data ->> 'starts')::int, 0), coalesce((data ->> 'wins')::int, 0), coalesce((data ->> 'poles')::int, 0),
    coalesce((data ->> 'podiums')::int, 0), coalesce((data ->> 'fastest_laps')::int, 0),
    coalesce(data -> 'seasons', '[]'::jsonb),
    data ->> 'bio', data ->> 'bio_url', now(),
    case when data ? 'bio' then now() end)
  on conflict (driver_id) do update set
    born = excluded.born, nationality = excluded.nationality,
    debut_year = excluded.debut_year, debut_race = excluded.debut_race,
    first_win_year = excluded.first_win_year, first_win_race = excluded.first_win_race,
    starts = excluded.starts, wins = excluded.wins, poles = excluded.poles,
    podiums = excluded.podiums, fastest_laps = excluded.fastest_laps, seasons = excluded.seasons,
    updated_at = now(),
    -- Биографию трогаем, только если её запрашивали в этот раз.
    bio = case when data ? 'bio' then excluded.bio else c.bio end,
    bio_url = case when data ? 'bio' then excluded.bio_url else c.bio_url end,
    bio_updated_at = case when data ? 'bio' then now() else c.bio_updated_at end;
end $$;

revoke execute on function public.sync_careers_pending(integer), public.sync_driver_career(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_careers_pending(integer), public.sync_driver_career(text, jsonb) to service_role;

-- ── Экраны ───────────────────────────────────────────────────────────────
-- Каталог: пилоты заявки текущего сезона с очками чемпионата и сводкой карьеры.
create function public.drivers_screen()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'season', s.year,
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
               'number', se.number, 'team_id', t.id, 'team_code', t.code, 'team_name', t.name, 'color', t.color,
               'points', coalesce(ch.points, 0), 'position', ch.position, 'wins', coalesce(ch.wins, 0),
               'titles', coalesce(cardinality(public.career_titles(c.seasons)), 0),
               'career_points', (select coalesce(sum((x ->> 'points')::numeric), 0) from jsonb_array_elements(c.seasons) x),
               'career_wins', c.wins)
             order by coalesce(ch.position, 99), t.name, se.number)
      from public.season_entries se
      join public.drivers d on d.id = se.driver_id
      join public.teams t on t.id = se.team_id
      left join public.championship ch on ch.season_id = s.id and ch.kind = 'drivers' and ch.driver_id = d.id
      left join public.driver_careers c on c.driver_id = d.id
      where se.season_id = s.id and se.active), '[]'::jsonb)
  )
  from public.seasons s where s.is_current
$$;
grant execute on function public.drivers_screen() to authenticated;

-- Профиль пилота: заявка, чемпионат текущего сезона, карьера и справочник команд (для логотипов в истории).
create function public.driver_screen(driver text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'driver', (select jsonb_build_object(
                 'id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                 'number', se.number, 'active', coalesce(se.active, false),
                 'team_id', t.id, 'team_code', t.code, 'team_name', t.name, 'color', t.color)
               from public.drivers d
               left join public.season_entries se on se.driver_id = d.id
                 and se.season_id = (select id from public.seasons where is_current)
               left join public.teams t on t.id = se.team_id
               where d.id = driver),
    'season', (select year from public.seasons where is_current),
    'championship', (select jsonb_build_object('position', ch.position, 'points', ch.points, 'wins', ch.wins)
                     from public.championship ch join public.seasons s on s.id = ch.season_id and s.is_current
                     where ch.kind = 'drivers' and ch.driver_id = driver),
    'career', (select to_jsonb(c) || jsonb_build_object('titles', public.career_titles(c.seasons))
               from public.driver_careers c where c.driver_id = driver),
    'teams', (select jsonb_object_agg(t.id, jsonb_build_object('code', t.code, 'name', t.name, 'color', t.color)) from public.teams t)
  )
$$;
grant execute on function public.driver_screen(text) to authenticated;
