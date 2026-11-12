-- 0015 · Фаза 4: фэнтези-лига — ядро (docs/FANTASY-FORMULA.md, решения владельца 12.11.2026 в PRODUCT.md).
-- Все числа — в fantasy_rules. Состав сохраняется только через RPC fantasy_save_squad (все проверки в базе),
-- блокировка — стартом первой сессии уик-энда, очки считает recompute_fantasy_scores (идемпотентно).

-- ─────────────────────────────── Настройки ───────────────────────────────
create table public.fantasy_rules (
  key text primary key,
  value jsonb not null,
  note text
);
alter table public.fantasy_rules enable row level security;
create policy fantasy_rules_read on public.fantasy_rules for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.fantasy_rules from anon, authenticated;

insert into public.fantasy_rules (key, value, note) values
  ('budget', '100.0', 'Бюджет состава, $M'),
  ('transfer_penalty', '10', 'Штраф за каждый лишний трансфер'),
  ('free_max', '2', 'Сколько бесплатных трансферов можно накопить'),
  ('free_after_first', '2', 'Бесплатных трансферов перед вторым этапом игрока'),
  ('qualy_pts', '[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]', 'Квалификация, места 1–10'),
  ('race_pts', '[25, 18, 15, 12, 10, 8, 6, 4, 2, 1]', 'Гонка, места 1–10'),
  ('gain_cap', '8', 'Предел ± за позиции со старта в гонке'),
  ('fl_bonus', '5', 'Быстрый круг (только при финише в топ-10)'),
  ('dnf', '-10', 'Сход в гонке (не классифицирован)'),
  ('dsq', '-20', 'Дисквалификация пилота'),
  ('sprint_pts', '[8, 7, 6, 5, 4, 3, 2, 1]', 'Спринт, места 1–8'),
  ('sprint_gain_cap', '5', 'Предел ± за позиции со старта в спринте'),
  ('sprint_dnf', '-5', 'Сход в спринте'),
  ('pit_lane_grid', '20', 'Старт с пит-лейн считается этим местом'),
  ('team_q3_both', '5', 'Конструктор: оба пилота в Q3'),
  ('team_q3_one', '2', 'Конструктор: один пилот в Q3'),
  ('team_q1_both', '-3', 'Конструктор: оба вылетели в Q1'),
  ('team_dsq', '-20', 'Конструктор: за каждого дисквалифицированного пилота'),
  ('half_points', '0.5', 'Доля очков за места, если гонка прошла меньше 75% дистанции'),
  ('price_floor', '3.0', 'Минимальная цена, $M'),
  ('class_a_driver', '18.0', 'Пилот класса A — от этой цены'),
  ('class_a_team', '20.0', 'Конструктор класса A — от этой цены'),
  ('delta_a', '[-0.3, -0.1, 0.1, 0.3]', 'Изменение цены класса A по четвертям PPM (снизу вверх)'),
  ('delta_b', '[-0.6, -0.2, 0.2, 0.6]', 'Изменение цены класса B по четвертям PPM'),
  ('ppm_window', '3', 'Сколько последних этапов брать для очков на миллион'),
  ('seed_driver', '[5.0, 27.0]', 'Стартовые цены пилотов из чемпионата: от, до'),
  ('seed_team', '[5.0, 28.0]', 'Стартовые цены конструкторов: от, до'),
  ('seed_exp', '0.8', 'Кривизна стартовых цен (1 — линейно по очкам)');

create function public.fr(k text)
returns jsonb
language sql
stable
set search_path = ''
as $$ select value from public.fantasy_rules where key = k $$;
create function public.frn(k text)
returns numeric
language sql
stable
set search_path = ''
as $$ select (value #>> '{}')::numeric from public.fantasy_rules where key = k $$;
-- n-й элемент массива очков (1-based), 0 — если мест меньше.
create function public.fra(k text, n integer)
returns numeric
language sql
stable
set search_path = ''
as $$ select coalesce((value ->> (n - 1))::numeric, 0) from public.fantasy_rules where key = k and n >= 1 $$;
grant execute on function public.fr(text), public.frn(text), public.fra(text, integer) to anon, authenticated;

-- ─────────────────────────────── Сезон, этапы, цены ───────────────────────────────
-- С какого этапа сезона идёт фэнтези (2026 — пробный этап в Абу-Даби).
create table public.fantasy_seasons (
  season_id smallint primary key references public.seasons (id) on delete cascade,
  start_event_id bigint not null references public.events (id) on delete cascade
);
create table public.fantasy_events (
  event_id bigint primary key references public.events (id) on delete cascade,
  locked_at timestamptz,                  -- когда обработана блокировка (автокопия составов, DRS)
  half_points boolean not null default false,
  prices_done boolean not null default false
);
create table public.fantasy_prices (
  event_id bigint not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('driver', 'team')),
  asset_id text not null,
  price numeric(4, 1) not null check (price > 0),
  delta numeric(3, 1) not null default 0,
  reason text,
  primary key (event_id, kind, asset_id)
);
alter table public.fantasy_seasons enable row level security;
alter table public.fantasy_events enable row level security;
alter table public.fantasy_prices enable row level security;
create policy fantasy_seasons_read on public.fantasy_seasons for select to anon, authenticated using (true);
create policy fantasy_events_read on public.fantasy_events for select to anon, authenticated using (true);
create policy fantasy_prices_read on public.fantasy_prices for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.fantasy_seasons, public.fantasy_events, public.fantasy_prices from anon, authenticated;

-- Блокировка состава: старт первой сессии уик-энда (FP1 или спринт-квалификация).
create function public.fantasy_lock_at(ev bigint)
returns timestamptz
language sql
stable
set search_path = ''
as $$ select min(s.starts_at) from public.sessions s where s.event_id = ev $$;
grant execute on function public.fantasy_lock_at(bigint) to anon, authenticated;

-- Этап входит в фэнтези: не раньше старта фэнтези в его сезоне.
create function public.fantasy_enabled(ev bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    join public.fantasy_seasons fs on fs.season_id = e.season_id
    join public.events st on st.id = fs.start_event_id
    where e.id = ev and e.round >= st.round)
$$;
grant execute on function public.fantasy_enabled(bigint) to anon, authenticated;

-- ─────────────────────────────── Команда игрока и составы ───────────────────────────────
alter table public.profiles add column team_name text
  check (team_name = btrim(team_name) and char_length(team_name) between 2 and 24);
grant update (team_name) on public.profiles to authenticated;

create table public.fantasy_squads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  drivers text[] not null check (cardinality(drivers) = 5),
  teams text[] not null check (cardinality(teams) = 2),
  drs text,
  chip text check (chip in ('wildcard', 'limitless', 'final_fix', 'autopilot', 'no_negative', 'extra_drs')),
  cost numeric(5, 1) not null,
  transfers smallint not null default 0,    -- платных и бесплатных вместе (по итогу против прошлого состава)
  free_before smallint not null,            -- бесплатных было доступно (99 — первая сборка)
  penalty smallint not null default 0,      -- штраф очками (положительное число)
  auto boolean not null default false,      -- скопирован с прошлого этапа при блокировке
  final_fix jsonb,                          -- {"out": …, "in": …} — замена по чипу Final Fix
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index fantasy_squads_event on public.fantasy_squads (event_id);
alter table public.fantasy_squads enable row level security;
-- Чужие составы — только после блокировки и только соседям по лиге (правило 6).
create policy fantasy_squads_select on public.fantasy_squads for select to authenticated
  using (user_id = (select auth.uid())
         or (now() >= public.fantasy_lock_at(event_id) and public.shares_league(user_id)));
revoke all on public.fantasy_squads from anon;
revoke insert, update, delete, truncate on public.fantasy_squads from authenticated;

-- Очки активов за этап (общие для всех): строка = вид очков.
create table public.fantasy_points (
  event_id bigint not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('driver', 'team')),
  asset_id text not null,
  line text not null check (line in ('qualy', 'race', 'gain', 'fl', 'dnf', 'dsq', 'dns',
                                     'sprint', 'sprint_gain', 'sprint_dnf', 'drivers', 'q_bonus')),
  points numeric(5, 1) not null,
  primary key (event_id, kind, asset_id, line)
);
alter table public.fantasy_points enable row level security;
create policy fantasy_points_read on public.fantasy_points for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.fantasy_points from anon, authenticated;

-- Очки игрока за этап с разбором по слотам.
create table public.fantasy_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  total numeric(6, 1) not null,
  penalty smallint not null default 0,
  drs text,
  multiplier smallint not null default 2,
  details jsonb not null default '[]'::jsonb,
  provisional boolean not null default true,
  primary key (user_id, event_id)
);
alter table public.fantasy_scores enable row level security;
create policy fantasy_scores_select on public.fantasy_scores for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_league(user_id));
revoke all on public.fantasy_scores from anon;
revoke insert, update, delete, truncate on public.fantasy_scores from authenticated;

-- ─────────────────────────────── Вспомогательные ───────────────────────────────
-- Предыдущий состав игрока в сезоне (ближайший раньше этого этапа).
create function public.fantasy_prev_squad(u uuid, ev bigint)
returns public.fantasy_squads
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.fantasy_squads s
  join public.events e on e.id = s.event_id
  join public.events x on x.id = ev and x.season_id = e.season_id and e.round < x.round
  where s.user_id = u
  order by e.round desc limit 1
$$;

-- Состав, с которым сравниваются трансферы: прошлый, а если на нём был Limitless — тот, что был до него.
create function public.fantasy_base_squad(u uuid, ev bigint)
returns public.fantasy_squads
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.fantasy_squads;
  pp public.fantasy_squads;
begin
  p := public.fantasy_prev_squad(u, ev);
  if p.user_id is not null and p.chip = 'limitless' then
    pp := public.fantasy_prev_squad(u, p.event_id);
    if pp.user_id is not null then
      return pp;
    end if;
  end if;
  return p;
end $$;

-- Бесплатных трансферов перед этапом: первая сборка — без ограничений (99), перед вторым этапом — free_after_first,
-- дальше +1 за этап с накоплением до free_max. Wildcard и Limitless бесплатные трансферы не тратят.
create function public.fantasy_free_before(u uuid, ev bigint)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  nxt integer;
  cur integer;
  used integer;
begin
  for r in
    select s.transfers, s.chip, s.free_before
    from public.fantasy_squads s
    join public.events e on e.id = s.event_id
    join public.events x on x.id = ev and x.season_id = e.season_id and e.round < x.round
    where s.user_id = u
    order by e.round
  loop
    cur := coalesce(nxt, 99);
    if cur >= 99 then
      nxt := public.frn('free_after_first')::int;
    else
      used := case when r.chip in ('wildcard', 'limitless') then 0 else r.transfers end;
      nxt := least(public.frn('free_max')::int, greatest(0, cur - used) + 1);
    end if;
  end loop;
  return coalesce(nxt, 99);
end $$;

-- Пилот не едет на этапе (резервист в заявке): его можно убрать из состава без траты трансфера.
create function public.fantasy_driver_out(driver text, ev bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select se.active from public.season_entries se join public.events e on e.id = ev
                       where se.season_id = e.season_id and se.driver_id = driver), false)
$$;

-- ─────────────────────────────── Сохранение состава ───────────────────────────────
create function public.fantasy_save_squad(ev bigint, drivers text[], teams text[], drs text default null, chip text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  start_ev bigint;
  base public.fantasy_squads;
  prev public.fantasy_squads;
  free integer;
  cost numeric;
  removed_active integer;
  added_teams integer;
  transfers integer := 0;
  penalty integer := 0;
  first_squad boolean;
begin
  if u is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if not public.fantasy_enabled(ev) then
    raise exception 'На этом этапе фэнтези не проводится' using errcode = '22023';
  end if;
  if now() >= public.fantasy_lock_at(ev) then
    raise exception 'Составы на этот этап уже закрыты' using errcode = '42501', hint = 'locked';
  end if;
  if cardinality(drivers) <> 5 or (select count(distinct x) from unnest(drivers) x) <> 5 then
    raise exception 'Нужно 5 разных пилотов' using errcode = '23514';
  end if;
  if cardinality(teams) <> 2 or (select count(distinct x) from unnest(teams) x) <> 2 then
    raise exception 'Нужно 2 разных конструктора' using errcode = '23514';
  end if;
  if drs is not null and not drs = any (drivers) then
    raise exception 'DRS-буст — только пилоту из состава' using errcode = '23514';
  end if;
  if (select count(*) from public.fantasy_prices p where p.event_id = ev and p.kind = 'driver' and p.asset_id = any (drivers)) <> 5
     or (select count(*) from public.fantasy_prices p where p.event_id = ev and p.kind = 'team' and p.asset_id = any (teams)) <> 2 then
    raise exception 'Кого-то из выбранных нет на рынке этого этапа' using errcode = '23514';
  end if;
  select sum(p.price) into cost from public.fantasy_prices p
  where p.event_id = ev and ((p.kind = 'driver' and p.asset_id = any (drivers)) or (p.kind = 'team' and p.asset_id = any (teams)));

  select fs.start_event_id into start_ev from public.fantasy_seasons fs join public.events e on e.season_id = fs.season_id where e.id = ev;
  prev := public.fantasy_prev_squad(u, ev);
  base := public.fantasy_base_squad(u, ev);
  first_squad := base.user_id is null;

  -- Чипы: один за этап, каждый раз за сезон; часть — не на первом этапе; Wildcard и Limitless не подряд.
  if chip is not null then
    if exists (select 1 from public.fantasy_squads s join public.events e on e.id = s.event_id
               join public.events x on x.id = ev and x.season_id = e.season_id
               where s.user_id = u and s.event_id <> ev and s.chip = fantasy_save_squad.chip) then
      raise exception 'Этот чип уже сыгран в сезоне' using errcode = '23514', hint = 'chip_used';
    end if;
    if chip in ('wildcard', 'limitless', 'final_fix') and (ev = start_ev or first_squad) then
      raise exception 'Этот чип нельзя играть на первом этапе' using errcode = '23514', hint = 'chip_first';
    end if;
    if chip in ('wildcard', 'limitless') and prev.chip in ('wildcard', 'limitless') then
      raise exception 'Wildcard и Limitless нельзя играть два этапа подряд' using errcode = '23514', hint = 'chip_row';
    end if;
  end if;
  if cost > public.frn('budget') and coalesce(chip, '') <> 'limitless' then
    raise exception 'Состав дороже бюджета' using errcode = '23514', hint = 'budget';
  end if;

  free := public.fantasy_free_before(u, ev);
  if not first_squad then
    -- Трансферы по итогу: сколько пилотов из прошлого состава ушло (кроме не едущих) и сколько конструкторов сменилось.
    select count(*) into removed_active from unnest(base.drivers) d
    where not d = any (drivers) and not public.fantasy_driver_out(d, ev);
    select count(*) into added_teams from unnest(teams) t where not t = any (base.teams);
    transfers := removed_active + added_teams;
    if coalesce(chip, '') not in ('wildcard', 'limitless') then
      penalty := greatest(0, transfers - free) * public.frn('transfer_penalty')::int;
    end if;
  end if;

  insert into public.fantasy_squads as s (user_id, event_id, drivers, teams, drs, chip, cost, transfers, free_before, penalty, auto)
  values (u, ev, drivers, teams, drs, chip, cost, transfers, free, penalty, false)
  on conflict (user_id, event_id) do update set
    drivers = excluded.drivers, teams = excluded.teams, drs = excluded.drs, chip = excluded.chip,
    cost = excluded.cost, transfers = excluded.transfers, free_before = excluded.free_before,
    penalty = excluded.penalty, auto = false, updated_at = now();

  return jsonb_build_object('cost', cost, 'transfers', transfers, 'free', free, 'penalty', penalty);
end $$;
revoke execute on function public.fantasy_save_squad(bigint, text[], text[], text, text) from public, anon;
grant execute on function public.fantasy_save_squad(bigint, text[], text[], text, text) to authenticated;

-- Final Fix: одна замена пилота после блокировки и до старта гонки (в пределах бюджета), если чип был выбран заранее.
create function public.fantasy_final_fix(ev bigint, out_driver text, in_driver text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  s public.fantasy_squads;
  race_at timestamptz := (select x.starts_at from public.sessions x where x.event_id = ev and x.kind = 'race');
  new_drivers text[];
  cost numeric;
begin
  select * into s from public.fantasy_squads where user_id = u and event_id = ev for update;
  if s.user_id is null or s.chip is distinct from 'final_fix' then
    raise exception 'Чип Final Fix на этот этап не выбран' using errcode = '23514';
  end if;
  if s.final_fix is not null then
    raise exception 'Final Fix уже использован' using errcode = '23514';
  end if;
  if now() < public.fantasy_lock_at(ev) or race_at is null or now() >= race_at then
    raise exception 'Final Fix работает после закрытия составов и до старта гонки' using errcode = '42501';
  end if;
  if not out_driver = any (s.drivers) or in_driver = any (s.drivers)
     or not exists (select 1 from public.fantasy_prices p where p.event_id = ev and p.kind = 'driver' and p.asset_id = in_driver) then
    raise exception 'Замена: убрать пилота из состава и поставить того, кого в нём нет' using errcode = '23514';
  end if;
  new_drivers := array_replace(s.drivers, out_driver, in_driver);
  select sum(p.price) into cost from public.fantasy_prices p
  where p.event_id = ev and ((p.kind = 'driver' and p.asset_id = any (new_drivers)) or (p.kind = 'team' and p.asset_id = any (s.teams)));
  if cost > public.frn('budget') then
    raise exception 'Состав дороже бюджета' using errcode = '23514', hint = 'budget';
  end if;
  update public.fantasy_squads set drivers = new_drivers, cost = fantasy_final_fix.cost,
    drs = case when drs = out_driver then in_driver else drs end,
    final_fix = jsonb_build_object('out', out_driver, 'in', in_driver), updated_at = now()
  where user_id = u and event_id = ev;
  return jsonb_build_object('cost', cost);
end $$;
revoke execute on function public.fantasy_final_fix(bigint, text, text) from public, anon;
grant execute on function public.fantasy_final_fix(bigint, text, text) to authenticated;

-- ─────────────────────────────── Блокировка (вызывает sync-f1) ───────────────────────────────
-- Не отправил состав — копируется прошлый (без чипа и трансферов). DRS не выбран — прошлый пилот, иначе самый дорогой.
create function public.fantasy_lock_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
  n integer := 0;
begin
  for ev in
    select e.id from public.events e
    where public.fantasy_enabled(e.id) and public.fantasy_lock_at(e.id) <= now()
      and exists (select 1 from public.fantasy_prices p where p.event_id = e.id)
      and not exists (select 1 from public.fantasy_events f where f.event_id = e.id and f.locked_at is not null)
    order by e.round
  loop
    insert into public.fantasy_squads (user_id, event_id, drivers, teams, drs, chip, cost, transfers, free_before, penalty, auto)
    select b.user_id, ev.id, b.drivers, b.teams, b.drs, null,
           coalesce((select sum(p.price) from public.fantasy_prices p where p.event_id = ev.id
                     and ((p.kind = 'driver' and p.asset_id = any (b.drivers)) or (p.kind = 'team' and p.asset_id = any (b.teams)))), 0),
           0, 0, 0, true
    from (select distinct s.user_id from public.fantasy_squads s
          join public.events e on e.id = s.event_id join public.events x on x.id = ev.id
          where e.season_id = x.season_id and e.round < x.round) us
    cross join lateral (select * from public.fantasy_base_squad(us.user_id, ev.id)) b
    where b.user_id is not null
      and not exists (select 1 from public.fantasy_squads s where s.user_id = us.user_id and s.event_id = ev.id);
    get diagnostics n = row_count;

    update public.fantasy_squads s set drs = coalesce(
      (select p.drs from public.fantasy_prev_squad(s.user_id, ev.id) p where p.drs = any (s.drivers)),
      (select fp.asset_id from public.fantasy_prices fp
       where fp.event_id = ev.id and fp.kind = 'driver' and fp.asset_id = any (s.drivers)
       order by fp.price desc, fp.asset_id limit 1))
    where s.event_id = ev.id and s.drs is null;

    insert into public.fantasy_events (event_id, locked_at) values (ev.id, now())
    on conflict (event_id) do update set locked_at = now();
  end loop;
  return n;
end $$;

-- ─────────────────────────────── Подсчёт очков ───────────────────────────────
create function public.recompute_fantasy_scores(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  half numeric := case when (select f.half_points from public.fantasy_events f where f.event_id = ev)
                       then public.frn('half_points') else 1 end;
  final boolean;
  n integer;
begin
  delete from public.fantasy_points where event_id = ev;
  delete from public.fantasy_scores where event_id = ev;
  if not public.fantasy_enabled(ev) then
    return 0;
  end if;

  -- Пилоты: квалификация.
  insert into public.fantasy_points (event_id, kind, asset_id, line, points)
  select ev, 'driver', r.driver_id, 'qualy', public.fra('qualy_pts', r.position)
  from public.results r where r.event_id = ev and r.kind = 'qualy' and r.position <= 10;

  -- Гонка. Классифицирован — позиция цифрой; R/N — сход; D/E — дисквалификация; W/F или «Did not start» — не стартовал.
  with rr as (
    select r.*,
           r.position_text ~ '^\d+$' as classified,
           r.position_text in ('D', 'E') as dsq,
           (r.position_text in ('W', 'F') or r.status ilike 'did not start%' or r.status ilike 'withdrew%') as dns,
           case when coalesce(r.grid, 0) = 0 then public.frn('pit_lane_grid')::int else r.grid end as grid_eff
    from public.results r where r.event_id = ev and r.kind = 'race'
  ),
  lines as (
    select driver_id, 'race' as line, round(public.fra('race_pts', position) * half, 1) as pts from rr where classified and position <= 10
    union all
    select driver_id, 'gain', greatest(-public.frn('gain_cap'), least(public.frn('gain_cap'), grid_eff - position)) from rr where not dsq and not dns
    union all
    select driver_id, 'fl', public.frn('fl_bonus') from rr where classified and position <= 10 and fastest_lap_rank = 1
    union all
    select driver_id, 'dnf', public.frn('dnf') from rr where not classified and not dsq and not dns
    union all
    select driver_id, 'dsq', public.frn('dsq') from rr where dsq
    union all
    select driver_id, 'dns', 0 from rr where dns
  )
  insert into public.fantasy_points (event_id, kind, asset_id, line, points)
  select ev, 'driver', driver_id, line, pts from lines where pts <> 0 or line = 'dns';

  -- Спринт.
  with rr as (
    select r.*, r.position_text ~ '^\d+$' as classified,
           (r.position_text in ('W', 'F') or r.status ilike 'did not start%') as dns,
           case when coalesce(r.grid, 0) = 0 then public.frn('pit_lane_grid')::int else r.grid end as grid_eff
    from public.results r where r.event_id = ev and r.kind = 'sprint'
  ),
  lines as (
    select driver_id, 'sprint' as line, public.fra('sprint_pts', position) as pts from rr where classified and position <= 8
    union all
    select driver_id, 'sprint_gain', greatest(-public.frn('sprint_gain_cap'), least(public.frn('sprint_gain_cap'), grid_eff - position))
    from rr where classified or (not dns and position_text in ('R', 'N'))
    union all
    select driver_id, 'sprint_dnf', public.frn('sprint_dnf') from rr where not classified and not dns
  )
  insert into public.fantasy_points (event_id, kind, asset_id, line, points)
  select ev, 'driver', driver_id, line, pts from lines where pts <> 0;

  -- Конструкторы: сумма их пилотов на этапе + бонус квалификации + штраф за дисквалификации.
  with dt as (
    select distinct on (r.driver_id) r.driver_id, r.team_id
    from public.results r where r.event_id = ev and r.kind in ('race', 'qualy', 'sprint') and r.team_id is not null
    order by r.driver_id, (r.kind = 'race') desc
  ),
  q as (
    select r.team_id,
           count(*) filter (where coalesce(r.q_reached, case when r.position <= 10 then 3 end) = 3) as q3,
           count(*) filter (where coalesce(r.q_reached,
             case when r.position > (select count(*) from public.results z where z.event_id = ev and z.kind = 'qualy')
                                    - case when (select count(*) from public.results z where z.event_id = ev and z.kind = 'qualy') >= 22 then 6 else 5 end
                  then 1 end) = 1) as q1,
           count(*) as n
    from public.results r where r.event_id = ev and r.kind = 'qualy' and r.team_id is not null
    group by r.team_id
  ),
  lines as (
    select dt.team_id, 'drivers' as line, sum(fp.points) as pts
    from dt join public.fantasy_points fp on fp.event_id = ev and fp.kind = 'driver' and fp.asset_id = dt.driver_id
    group by dt.team_id
    union all
    select q.team_id, 'q_bonus',
           case when q.q3 >= 2 then public.frn('team_q3_both') when q.q3 = 1 then public.frn('team_q3_one')
                when q.q1 >= 2 then public.frn('team_q1_both') else 0 end
    from q
    union all
    select dt.team_id, 'dsq', public.frn('team_dsq') * count(*)
    from dt join public.fantasy_points fp on fp.event_id = ev and fp.kind = 'driver' and fp.asset_id = dt.driver_id and fp.line = 'dsq'
    group by dt.team_id
  )
  insert into public.fantasy_points (event_id, kind, asset_id, line, points)
  select ev, 'team', team_id, line, sum(pts) from lines group by team_id, line having sum(pts) <> 0;

  if not exists (select 1 from public.fantasy_points where event_id = ev) then
    return 0;
  end if;
  select coalesce(bool_and(r.is_final), false) into final from public.results r where r.event_id = ev and r.kind in ('qualy', 'race');

  -- Игроки. Пилот без результата на этапе → очки резервиста его команды (автозамена, решение 12.11.2026).
  with sq as (
    select s.*, (s.chip = 'no_negative') as nn from public.fantasy_squads s where s.event_id = ev
  ),
  slots as (
    select sq.user_id, d.ord, d.driver as picked,
           case when exists (select 1 from public.results r where r.event_id = ev and r.driver_id = d.driver and r.kind in ('race', 'qualy'))
                then d.driver
                else (select r.driver_id from public.results r
                      join public.season_entries me on me.driver_id = d.driver
                      join public.events e on e.id = ev and e.season_id = me.season_id
                      where r.event_id = ev and r.kind in ('race', 'qualy') and r.team_id = me.team_id and r.driver_id <> d.driver
                        and not r.driver_id = any (sq.drivers)
                        and r.driver_id not in (select se.driver_id from public.season_entries se
                                                where se.season_id = me.season_id and se.team_id = me.team_id
                                                  and se.driver_id <> d.driver and se.active)
                      order by r.kind limit 1)
           end as actual
    from sq cross join lateral unnest(sq.drivers) with ordinality as d(driver, ord)
  ),
  dpts as (
    select sl.user_id, sl.ord, sl.picked, sl.actual,
           coalesce(sum(case when sq.nn then greatest(fp.points, 0) else fp.points end), 0) as pts,
           coalesce(jsonb_object_agg(fp.line, fp.points) filter (where fp.line is not null), '{}'::jsonb) as lines
    from slots sl join sq on sq.user_id = sl.user_id
    left join public.fantasy_points fp on fp.event_id = ev and fp.kind = 'driver' and fp.asset_id = sl.actual
    group by sl.user_id, sl.ord, sl.picked, sl.actual
  ),
  boost as (
    -- Autopilot: множитель лучшему по очкам пилоту состава; иначе выбранному DRS.
    select sq.user_id,
           case when sq.chip = 'autopilot'
                then (select d.picked from dpts d where d.user_id = sq.user_id order by d.pts desc, d.ord limit 1)
                else sq.drs end as drs,
           case when sq.chip = 'extra_drs' then 3 else 2 end as mult
    from sq
  ),
  tpts as (
    select sq.user_id, t.ord, t.team,
           coalesce(sum(case when sq.nn then greatest(fp.points, 0) else fp.points end), 0) as pts,
           coalesce(jsonb_object_agg(fp.line, fp.points) filter (where fp.line is not null), '{}'::jsonb) as lines
    from sq cross join lateral unnest(sq.teams) with ordinality as t(team, ord)
    left join public.fantasy_points fp on fp.event_id = ev and fp.kind = 'team' and fp.asset_id = t.team
    group by sq.user_id, t.ord, t.team
  ),
  per as (
    select sq.user_id, sq.penalty, b.drs, b.mult,
           (select coalesce(sum(d.pts * case when d.picked = b.drs then b.mult else 1 end), 0) from dpts d where d.user_id = sq.user_id)
           + (select coalesce(sum(t.pts), 0) from tpts t where t.user_id = sq.user_id)
           - sq.penalty as total,
           (select jsonb_agg(jsonb_build_object('slot', 'driver', 'asset', d.picked, 'actual', d.actual, 'points', d.pts,
                                                'mult', case when d.picked = b.drs then b.mult else 1 end, 'lines', d.lines) order by d.ord)
            from dpts d where d.user_id = sq.user_id)
           || (select jsonb_agg(jsonb_build_object('slot', 'team', 'asset', t.team, 'points', t.pts, 'mult', 1, 'lines', t.lines) order by t.ord)
               from tpts t where t.user_id = sq.user_id) as details
    from sq join boost b on b.user_id = sq.user_id
  )
  insert into public.fantasy_scores (user_id, event_id, total, penalty, drs, multiplier, details, provisional)
  select user_id, ev, total, penalty, drs, mult, details, not final from per;
  get diagnostics n = row_count;
  return n;
end $$;

-- ─────────────────────────────── Цены ───────────────────────────────
-- Стартовые цены этапа из чемпионата сезона (решение 12.11.2026): лидер — верх диапазона, ноль очков — низ.
create function public.fantasy_seed_prices(ev bigint)
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
    left join public.championship c on c.season_id = se.season_id and c.kind = 'drivers' and c.driver_id = se.driver_id
    where se.season_id = season and se.active
  ),
  t as (
    select tm.id, coalesce(c.points, 0) as pts
    from public.teams tm
    left join public.championship c on c.season_id = season and c.kind = 'teams' and c.team_id = tm.id
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

-- После финального результата этапа: цены на следующий этап по очкам на миллион (PPM) за последние этапы.
create function public.fantasy_update_prices(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nxt bigint := (select e2.id from public.events e join public.events e2 on e2.season_id = e.season_id and e2.round > e.round
                 where e.id = ev order by e2.round limit 1);
  win integer := public.frn('ppm_window')::int;
  n integer;
begin
  if nxt is null or not public.fantasy_enabled(ev)
     or exists (select 1 from public.fantasy_events f where f.event_id = ev and f.prices_done) then
    return 0;
  end if;
  delete from public.fantasy_prices where event_id = nxt;
  with recent as (
    select e.id from public.events e join public.events x on x.id = ev
    where e.season_id = x.season_id and e.round <= x.round and public.fantasy_enabled(e.id)
      and exists (select 1 from public.fantasy_points fp where fp.event_id = e.id)
    order by e.round desc limit win
  ),
  avgp as (
    select p.kind, p.asset_id, p.price,
           coalesce((select sum(fp.points) from public.fantasy_points fp
                     where fp.event_id in (select id from recent) and fp.kind = p.kind and fp.asset_id = p.asset_id), 0)
             / greatest(1, (select count(*) from recent)) as avg_pts
    from public.fantasy_prices p where p.event_id = ev
  ),
  q as (
    select a.*, a.avg_pts / a.price as ppm,
           ntile(4) over (partition by a.kind order by a.avg_pts / a.price, a.asset_id) as quart,
           a.price >= case a.kind when 'driver' then public.frn('class_a_driver') else public.frn('class_a_team') end as class_a
    from avgp a
  )
  insert into public.fantasy_prices (event_id, kind, asset_id, price, delta, reason)
  select nxt, q.kind, q.asset_id,
         greatest(public.frn('price_floor'), q.price + (public.fr(case when q.class_a then 'delta_a' else 'delta_b' end) ->> (q.quart - 1))::numeric),
         greatest(public.frn('price_floor'), q.price + (public.fr(case when q.class_a then 'delta_a' else 'delta_b' end) ->> (q.quart - 1))::numeric) - q.price,
         case q.quart when 4 then 'очки на миллион в верхней четверти' when 3 then 'очки на миллион выше середины'
                      when 2 then 'очки на миллион ниже середины' else 'очки на миллион в нижней четверти' end
  from q;
  get diagnostics n = row_count;
  insert into public.fantasy_events (event_id, prices_done) values (ev, true)
  on conflict (event_id) do update set prices_done = true;
  return n;
end $$;

-- ─────────────────────────────── Общий пересчёт этапа ───────────────────────────────
-- Все места, где зовётся recompute_event_scores (синхронизация, ручной ввод, safety car), считают и фэнтези.
alter function public.recompute_event_scores(bigint) rename to recompute_predict_scores;
create function public.recompute_event_scores(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  n := public.recompute_predict_scores(ev);
  perform public.recompute_fantasy_scores(ev);
  if (select coalesce(bool_and(r.is_final), false) from public.results r where r.event_id = ev and r.kind = 'race') then
    perform public.fantasy_update_prices(ev);
  end if;
  return n;
end $$;

-- Админ: гонка прошла меньше 75% дистанции — очки за места пополам.
create function public.admin_set_half_points(ev bigint, value boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Только для админа сайта' using errcode = '42501';
  end if;
  insert into public.fantasy_events (event_id, half_points) values (ev, value)
  on conflict (event_id) do update set half_points = excluded.half_points;
  return public.recompute_fantasy_scores(ev);
end $$;

-- Q1/Q2/Q3 для бонуса конструктора (квалификация из Jolpica: есть ли время в Q2/Q3).
alter table public.results add column q_reached smallint check (q_reached between 1 and 3);

create or replace function public.sync_results(season_year smallint, round smallint, session public.session_kind, rows jsonb, final boolean)
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

  insert into public.drivers (id, code, given_name, family_name)
  select x ->> 'driver_id', x ->> 'code', x ->> 'given_name', x ->> 'family_name'
  from jsonb_array_elements(rows) x
  on conflict (id) do nothing;

  delete from public.results where event_id = ev and kind = session;
  insert into public.results (event_id, kind, driver_id, team_id, position, position_text, grid, laps, status,
                              fastest_lap_rank, q_reached, source, is_final)
  select ev, session, x ->> 'driver_id', x ->> 'team_id', (x ->> 'position')::smallint, x ->> 'position_text',
         nullif(x ->> 'grid', '')::smallint, nullif(x ->> 'laps', '')::smallint, x ->> 'status',
         nullif(x ->> 'fastest_lap_rank', '')::smallint, nullif(x ->> 'q_reached', '')::smallint, 'api', final
  from jsonb_array_elements(rows) x;

  if final then
    update public.results set is_final = true where event_id = ev;
  end if;
  return public.recompute_event_scores(ev);
end $$;

-- Опрашивать и спринт (для фэнтези).
create or replace function public.sync_pending()
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
  where ss.kind in ('qualy', 'race', 'sprint')
    and ss.starts_at < now() - interval '1 hour'
    and ss.starts_at > now() - interval '4 days'
  order by ss.starts_at
$$;

revoke execute on function public.recompute_predict_scores(bigint), public.recompute_event_scores(bigint),
  public.recompute_fantasy_scores(bigint), public.fantasy_lock_due(), public.fantasy_seed_prices(bigint),
  public.fantasy_update_prices(bigint), public.fantasy_prev_squad(uuid, bigint), public.fantasy_base_squad(uuid, bigint),
  public.fantasy_free_before(uuid, bigint), public.fantasy_driver_out(text, bigint)
  from public, anon, authenticated;
grant execute on function public.recompute_predict_scores(bigint), public.recompute_event_scores(bigint),
  public.recompute_fantasy_scores(bigint), public.fantasy_lock_due(), public.fantasy_seed_prices(bigint),
  public.fantasy_update_prices(bigint) to service_role;
revoke execute on function public.admin_set_half_points(bigint, boolean) from public, anon;
grant execute on function public.admin_set_half_points(bigint, boolean) to authenticated;

-- ─────────────────────────────── Пробный этап 2026: Абу-Даби ───────────────────────────────
insert into public.fantasy_seasons (season_id, start_event_id)
select e.season_id, e.id from public.events e join public.seasons s on s.id = e.season_id
where s.year = 2026 and e.slug = 'yas-marina'
on conflict (season_id) do nothing;
select public.fantasy_seed_prices(e.id) from public.events e join public.seasons s on s.id = e.season_id
where s.year = 2026 and e.slug = 'yas-marina';
