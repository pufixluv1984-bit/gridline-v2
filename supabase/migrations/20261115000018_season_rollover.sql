-- 0018 · Фаза 5: переход на новый сезон (решение владельца 12.11.2026).
-- Синхронизация сама делает новый сезон текущим, когда прошлый закончен и в Jolpica есть календарь нового.
-- Заявка нового сезона до первой гонки — копия прошлой; фэнтези стартует с 1-го этапа с ценами из итогов прошлого чемпионата.
-- Лиги прошлого сезона остаются архивом; хозяин переносит лигу на новый сезон кнопкой (RPC league_carry_over).

-- ─────────────────────────────── Сезон ───────────────────────────────
create function public.sync_season_year()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select year from public.seasons where is_current), extract(year from now())::smallint) $$;

-- Сезон закончен: все этапы прошли (старт гонки больше двух дней назад, штрафы зафиксированы).
create function public.sync_season_done()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e join public.seasons s on s.id = e.season_id and s.is_current)
     and not exists (
       select 1 from public.events e
       join public.seasons s on s.id = e.season_id and s.is_current
       left join public.sessions r on r.event_id = e.id and r.kind = 'race'
       where e.status = 'scheduled' and (r.starts_at is null or r.starts_at > now() - interval '2 days'))
$$;

-- Стартовые цены этапа из чемпионата указанного сезона (для нового сезона — из итогов прошлого).
create function public.fantasy_seed_prices_from(ev bigint, src smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  season smallint := (select e.season_id from public.events e where e.id = ev);
  k numeric := public.frn('seed_exp');
  n integer;
begin
  delete from public.fantasy_prices where event_id = ev;
  with d as (
    select se.driver_id as id, coalesce(c.points, 0) as pts
    from public.season_entries se
    left join public.championship c on c.season_id = src and c.kind = 'drivers' and c.driver_id = se.driver_id
    where se.season_id = season and se.active
  ),
  t as (
    select tm.id, coalesce(c.points, 0) as pts
    from public.teams tm
    left join public.championship c on c.season_id = src and c.kind = 'teams' and c.team_id = tm.id
    where exists (select 1 from public.season_entries se where se.season_id = season and se.team_id = tm.id and se.active)
  )
  insert into public.fantasy_prices (event_id, kind, asset_id, price, reason)
  select ev, 'driver', d.id,
         round((public.fr('seed_driver') ->> 0)::numeric
               + ((public.fr('seed_driver') ->> 1)::numeric - (public.fr('seed_driver') ->> 0)::numeric)
                 * coalesce(power(d.pts / nullif((select max(pts) from d), 0), k), 0), 1),
         'стартовая цена из чемпионата'
  from d
  union all
  select ev, 'team', t.id,
         round((public.fr('seed_team') ->> 0)::numeric
               + ((public.fr('seed_team') ->> 1)::numeric - (public.fr('seed_team') ->> 0)::numeric)
                 * coalesce(power(t.pts / nullif((select max(pts) from t), 0), k), 0), 1),
         'стартовая цена из чемпионата'
  from t;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fantasy_seed_prices(ev bigint)
returns integer
language sql
security definer
set search_path = ''
as $$ select public.fantasy_seed_prices_from(ev, (select e.season_id from public.events e where e.id = ev)) $$;

-- Переход: следующий сезон с календарём становится текущим. Возвращает новый год или null.
create function public.sync_season_rollover()
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.seasons;
  nxt public.seasons;
  start_ev bigint;
begin
  select * into cur from public.seasons where is_current;
  select s.* into nxt from public.seasons s
  where s.year > coalesce(cur.year, 0) and exists (select 1 from public.events e where e.season_id = s.id)
  order by s.year limit 1;
  if nxt.id is null or (cur.id is not null and not public.sync_season_done()) then
    return null;
  end if;

  update public.seasons set is_current = (id = nxt.id);

  -- До первой гонки Jolpica может не отдавать заявку: берём прошлую (синхронизация потом заменит).
  if cur.id is not null and not exists (select 1 from public.season_entries where season_id = nxt.id) then
    insert into public.season_entries (season_id, driver_id, team_id, number, active)
    select nxt.id, se.driver_id, se.team_id, se.number, true
    from public.season_entries se where se.season_id = cur.id and se.active;
  end if;

  -- Фэнтези нового сезона — с первого этапа, цены из итогов прошлого чемпионата.
  select e.id into start_ev from public.events e where e.season_id = nxt.id order by e.round limit 1;
  insert into public.fantasy_seasons (season_id, start_event_id) values (nxt.id, start_ev)
  on conflict (season_id) do nothing;
  if not exists (select 1 from public.fantasy_prices where event_id = start_ev) then
    perform public.fantasy_seed_prices_from(start_ev, coalesce(cur.id, nxt.id));
  end if;
  return nxt.year;
end $$;

revoke execute on function public.sync_season_year(), public.sync_season_done(), public.sync_season_rollover(),
  public.fantasy_seed_prices_from(bigint, smallint) from public, anon, authenticated;
grant execute on function public.sync_season_year(), public.sync_season_done(), public.sync_season_rollover(),
  public.fantasy_seed_prices_from(bigint, smallint) to service_role;

-- ─────────────────────────────── Перенос лиги на новый сезон ───────────────────────────────
alter table public.leagues add column carried_to uuid references public.leagues (id) on delete set null;

create function public.league_carry_over(league uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leagues;
  season smallint := (select s.id from public.seasons s where s.is_current);
  nid uuid;
begin
  select * into l from public.leagues where id = league for update;
  if l.id is null or l.owner_id <> auth.uid() then
    raise exception 'Перенести лигу может только её хозяин' using errcode = '42501';
  end if;
  if l.season_id = season then
    raise exception 'Лига уже в текущем сезоне' using errcode = '23514';
  end if;
  if l.carried_to is not null then
    return l.carried_to;
  end if;
  insert into public.leagues (name, season_id, owner_id, max_members, mode, bonus_config)
  values (l.name, season, l.owner_id, l.max_members, l.mode, l.bonus_config)
  returning id into nid;
  insert into public.league_members (league_id, user_id, role)
  select nid, m.user_id, 'member' from public.league_members m
  where m.league_id = league and m.user_id <> l.owner_id;
  update public.leagues set carried_to = nid where id = league;
  return nid;
end $$;
revoke execute on function public.league_carry_over(uuid) from public, anon;
grant execute on function public.league_carry_over(uuid) to authenticated;

-- Экран лиги: архив прошлого сезона и ссылка на перенесённую лигу.
alter function public.league_screen(uuid) rename to league_screen_base;
create function public.league_screen(league uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.league_screen_base(league) || jsonb_build_object(
    'archive', (select l.season_id <> s.id from public.leagues l, public.seasons s where l.id = league and s.is_current),
    'current_season', (select s.year from public.seasons s where s.is_current),
    'carried_to', (select l.carried_to from public.leagues l where l.id = league))
$$;
grant execute on function public.league_screen(uuid) to authenticated;
