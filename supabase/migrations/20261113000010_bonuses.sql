-- 0010 · Фаза 2: бонусные ставки, бустер ×2, факты гонки (safety car), практики, настройки бонусов лиги.
-- Правила — docs/PRODUCT.md §2: первый сход +10 (можно «Никто»), победа с поула +3, safety car +3,
-- сходов 2+ или меньше +3. Safety car — только настоящий SC, не VSC и не красный флаг (решение 13.11.2026).
-- Бустер ×2 — на один блок уик-энда, один на каждые 5 этапов сезона (окна 1–5, 6–10, …).

-- ─────────────────────────────── Прогноз: новые поля ───────────────────────────────
alter table public.predictions
  add column first_dnf text,                 -- driverId или 'none' («Никто не сойдёт»)
  add column pole_wins boolean,              -- выиграет ли гонку пилот с поула
  add column safety_car boolean,             -- будет ли выезд safety car
  add column dnf_many boolean,               -- сходов будет 2 и больше (true) или меньше (false)
  add column boost_block text check (boost_block in ('qualy', 'race', 'bonus'));

grant insert (first_dnf, pole_wins, safety_car, dnf_many, boost_block) on public.predictions to authenticated;
grant update (first_dnf, pole_wins, safety_car, dnf_many, boost_block) on public.predictions to authenticated;

-- Окно бустера: этапы 1–5 → 0, 6–10 → 1, …
create function public.boost_window(round smallint)
returns integer
language sql
immutable
set search_path = ''
as $$ select (round - 1) / 5 $$;

-- Проверки прогноза + бонусы и бустер (второй рубеж после RLS).
create or replace function public.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dl timestamptz := public.event_deadline(new.event_id);
  season smallint;
  rnd smallint;
  bad text;
begin
  -- Удаление проверяет только RLS (дедлайн): каскад при удалении аккаунта или этапа должен проходить.
  if dl is null or now() >= dl then
    raise exception 'Приём прогнозов на этот этап закрыт' using errcode = '42501', hint = 'deadline_passed';
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id) then
    raise exception 'Нельзя менять владельца или этап прогноза' using errcode = '42501';
  end if;
  if array_position(new.qualy, null) is not null or array_position(new.race, null) is not null then
    raise exception 'Заполни все места' using errcode = '23514', hint = 'incomplete';
  end if;
  if (select count(distinct x) from unnest(new.qualy) x) <> 3
     or (select count(distinct x) from unnest(new.race) x) <> 10 then
    raise exception 'Один пилот не может стоять на двух местах' using errcode = '23514', hint = 'duplicate_driver';
  end if;
  select e.season_id, e.round into season, rnd from public.events e where e.id = new.event_id;
  select x into bad
  from unnest(new.qualy || new.race || coalesce(array[new.fastest_lap], '{}')
              || coalesce(array[nullif(new.first_dnf, 'none')], '{}')) x
  where x is not null
    and not exists (select 1 from public.season_entries se where se.season_id = season and se.driver_id = x)
  limit 1;
  if bad is not null then
    raise exception 'Пилота % нет в заявке сезона', bad using errcode = '23503', hint = 'unknown_driver';
  end if;
  -- Бустер: один на окно из 5 этапов (на другом этапе того же окна бустер уже стоит — отказ).
  if new.boost_block is not null and exists (
    select 1 from public.predictions p join public.events e on e.id = p.event_id
    where p.user_id = new.user_id and p.event_id <> new.event_id and p.boost_block is not null
      and e.season_id = season and public.boost_window(e.round) = public.boost_window(rnd)
  ) then
    raise exception 'Бустер уже использован на другом этапе этого окна' using errcode = '23514', hint = 'boost_used';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.submitted_at := now();
  end if;
  return new;
end $$;

-- ─────────────────────────────── Факты гонки ───────────────────────────────
create table public.race_facts (
  event_id bigint primary key references public.events (id) on delete cascade,
  safety_car boolean,                       -- null — данных нет
  source text not null default 'api' check (source in ('api', 'manual')),
  updated_at timestamptz not null default now()
);
alter table public.race_facts enable row level security;
create policy race_facts_read on public.race_facts for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.race_facts from anon, authenticated;

-- ─────────────────────────────── Результаты: практики ───────────────────────────────
alter table public.results drop constraint results_kind_check;
alter table public.results add constraint results_kind_check
  check (kind in ('fp1', 'fp2', 'fp3', 'qualy', 'race', 'sprint', 'sprint_qualy'));
alter table public.results add column best_ms integer, add column gap_ms integer;

-- Сход по статусу Jolpica: «Retired» (в т.ч. классифицированный) и старые статусы поломок.
-- Не сходы: финишировал, круговой (Lapped/+N Laps), не стартовал, дисквалифицирован, не классифицирован.
create function public.is_dnf(status text, position_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(position_text, '') not in ('W', 'D', 'E', 'F', 'N')
     and coalesce(status, '') not in ('', 'Finished', 'Lapped', 'Did not start', 'Disqualified', 'Withdrew', 'Not classified')
     and coalesce(status, '') !~ '^\+\d+ Laps?$'
$$;

-- ─────────────────────────────── Очки: множитель бустера ───────────────────────────────
alter table public.score_lines add column multiplier smallint not null default 1 check (multiplier in (1, 2));
alter table public.score_lines drop constraint score_lines_kind_check;
alter table public.score_lines add constraint score_lines_kind_check check (kind in (
  'qualy_exact', 'race_exact', 'race_off1', 'race_off2', 'race_in_top10', 'race_podium',
  'fastest_lap', 'first_dnf', 'pole_wins', 'safety_car', 'dnf_many'
));

create or replace function public.recompute_event_scores(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  final boolean;
  has_race boolean;
  dnf_count integer;
  min_laps integer;
  pole text;
  winner text;
  sc boolean;
begin
  select coalesce(bool_and(r.is_final), false) into final from public.results r where r.event_id = ev and r.kind in ('qualy', 'race');
  delete from public.score_lines where event_id = ev;

  -- Квалификация: поул +6, P2 и P3 точно по +4.
  insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
  select p.user_id, ev, 'qualy', 'qualy_exact', q.slot, q.driver, case q.slot when 1 then 6 else 4 end, not final
  from public.predictions p
  cross join lateral unnest(p.qualy) with ordinality as q(driver, slot)
  join public.results r on r.event_id = ev and r.kind = 'qualy' and r.driver_id = q.driver and r.position = q.slot
  where p.event_id = ev;

  -- Гонка, топ-10: точно +10, ошибка на 1 место +5, на 2 места +3, в десятке, но дальше +1.
  insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
  select p.user_id, ev, 'race',
         case abs(t.slot - r.position) when 0 then 'race_exact' when 1 then 'race_off1' when 2 then 'race_off2' else 'race_in_top10' end,
         t.slot, t.driver,
         case abs(t.slot - r.position) when 0 then 10 when 1 then 5 when 2 then 3 else 1 end,
         not final
  from public.predictions p
  cross join lateral unnest(p.race) with ordinality as t(driver, slot)
  join public.results r on r.event_id = ev and r.kind = 'race' and r.driver_id = t.driver and r.position <= 10
  where p.event_id = ev;

  -- Идеальный подиум: все три места точно, +10.
  insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
  select p.user_id, ev, 'race', 'race_podium', 0, null, 10, not final
  from public.predictions p
  where p.event_id = ev
    and (select count(*) from unnest(p.race[1:3]) with ordinality as t(driver, slot)
         join public.results r on r.event_id = ev and r.kind = 'race' and r.driver_id = t.driver and r.position = t.slot) = 3;

  -- Бонус: быстрый круг гонки, +6.
  insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
  select p.user_id, ev, 'bonus', 'fastest_lap', 0, p.fastest_lap, 6, not final
  from public.predictions p
  join public.results r on r.event_id = ev and r.kind = 'race' and r.fastest_lap_rank = 1 and r.driver_id = p.fastest_lap
  where p.event_id = ev;

  has_race := exists (select 1 from public.results r where r.event_id = ev and r.kind = 'race');
  if has_race then
    select count(*), min(r.laps) into dnf_count, min_laps
    from public.results r where r.event_id = ev and r.kind = 'race' and public.is_dnf(r.status, r.position_text);

    -- Первый сход +10: меньше всех кругов среди сошедших; два на одном круге — засчитываются оба;
    -- сходов не было — верный ответ «Никто» ('none').
    insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
    select p.user_id, ev, 'bonus', 'first_dnf', 0, p.first_dnf, 10, not final
    from public.predictions p
    where p.event_id = ev and p.first_dnf is not null
      and (
        (p.first_dnf = 'none' and dnf_count = 0)
        or exists (select 1 from public.results r
                   where r.event_id = ev and r.kind = 'race' and r.driver_id = p.first_dnf
                     and public.is_dnf(r.status, r.position_text) and r.laps = min_laps)
      );

    -- Сходов два и больше или меньше, +3.
    insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
    select p.user_id, ev, 'bonus', 'dnf_many', 0, null, 3, not final
    from public.predictions p
    where p.event_id = ev and p.dnf_many is not null and p.dnf_many = (dnf_count >= 2);

    -- Выиграет ли гонку пилот с поула, +3 (нужна и квалификация).
    select r.driver_id into pole from public.results r where r.event_id = ev and r.kind = 'qualy' and r.position = 1;
    select r.driver_id into winner from public.results r where r.event_id = ev and r.kind = 'race' and r.position = 1;
    if pole is not null and winner is not null then
      insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
      select p.user_id, ev, 'bonus', 'pole_wins', 0, null, 3, not final
      from public.predictions p
      where p.event_id = ev and p.pole_wins is not null and p.pole_wins = (pole = winner);
    end if;
  end if;

  -- Safety car, +3 — если факт известен (OpenF1 или ручной ввод).
  select f.safety_car into sc from public.race_facts f where f.event_id = ev;
  if sc is not null then
    insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
    select p.user_id, ev, 'bonus', 'safety_car', 0, null, 3, not final
    from public.predictions p
    where p.event_id = ev and p.safety_car is not null and p.safety_car = sc;
  end if;

  -- Бустер ×2: все строки выбранного блока.
  update public.score_lines s set multiplier = 2
  from public.predictions p
  where s.event_id = ev and p.event_id = ev and p.user_id = s.user_id and p.boost_block = s.block;

  select count(*) into n from public.score_lines where event_id = ev;
  return n;
end $$;

-- ─────────────────────────────── Ручной ввод safety car (админ) ───────────────────────────────
create function public.admin_set_safety_car(ev bigint, value boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Только для админа сайта' using errcode = '42501';
  end if;
  insert into public.race_facts (event_id, safety_car, source, updated_at) values (ev, value, 'manual', now())
  on conflict (event_id) do update set safety_car = excluded.safety_car, source = 'manual', updated_at = now();
  return public.recompute_event_scores(ev);
end $$;
revoke execute on function public.admin_set_safety_car(bigint, boolean) from public, anon;
grant execute on function public.admin_set_safety_car(bigint, boolean) to authenticated;

-- ─────────────────────────────── Синхронизация: факт SC (OpenF1) ───────────────────────────────
-- Ручной ввод главнее: API его не перезаписывает.
create function public.sync_safety_car(season_year smallint, round smallint, value boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev bigint;
begin
  select e.id into ev from public.events e join public.seasons s on s.id = e.season_id
  where s.year = season_year and e.round = sync_safety_car.round;
  if ev is null then
    return 0;
  end if;
  insert into public.race_facts (event_id, safety_car, source, updated_at) values (ev, value, 'api', now())
  on conflict (event_id) do update set safety_car = excluded.safety_car, updated_at = now()
    where public.race_facts.source = 'api';
  return public.recompute_event_scores(ev);
end $$;

-- Какие гонки ждут факт SC: гонка прошла (час+), не старше 4 дней, факта ещё нет.
create function public.sync_sc_pending()
returns table (season_year smallint, round smallint, race_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.year, e.round, ss.starts_at
  from public.sessions ss
  join public.events e on e.id = ss.event_id
  join public.seasons s on s.id = e.season_id
  where ss.kind = 'race' and ss.starts_at < now() - interval '1 hour' and ss.starts_at > now() - interval '4 days'
    and not exists (select 1 from public.race_facts f where f.event_id = e.id and f.safety_car is not null)
$$;

-- Практики (OpenF1): этапы с прошедшей практикой без результата.
create function public.sync_practice_pending()
returns table (season_year smallint, round smallint, kind public.session_kind, starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.year, e.round, ss.kind, ss.starts_at
  from public.sessions ss
  join public.events e on e.id = ss.event_id
  join public.seasons s on s.id = e.season_id
  where ss.kind in ('fp1', 'fp2', 'fp3') and ss.starts_at < now() - interval '90 minutes'
    and ss.starts_at > now() - interval '3 days'
    and not exists (select 1 from public.results r where r.event_id = e.id and r.kind = ss.kind)
$$;

-- Результат практики: rows [{driver_id, team_id, position, laps, best_ms, gap_ms}]
create function public.sync_practice(season_year smallint, round smallint, session public.session_kind, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev bigint;
begin
  if session not in ('fp1', 'fp2', 'fp3') then
    raise exception 'Только практики' using errcode = '22023';
  end if;
  select e.id into ev from public.events e join public.seasons s on s.id = e.season_id
  where s.year = season_year and e.round = sync_practice.round;
  if ev is null or jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  delete from public.results where event_id = ev and kind = session;
  insert into public.results (event_id, kind, driver_id, team_id, position, position_text, laps, best_ms, gap_ms, source, is_final)
  select ev, session, x ->> 'driver_id', x ->> 'team_id', (x ->> 'position')::smallint, x ->> 'position',
         nullif(x ->> 'laps', '')::smallint, nullif(x ->> 'best_ms', '')::integer, nullif(x ->> 'gap_ms', '')::integer, 'api', true
  from jsonb_array_elements(rows) x
  where exists (select 1 from public.drivers d where d.id = x ->> 'driver_id');
  return jsonb_array_length(rows);
end $$;

-- OpenF1 знает пилотов по номерам: заявка сезона для сопоставления.
create function public.sync_entries_numbers(season_year smallint)
returns table (number smallint, driver_id text, team_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select se.number, se.driver_id, se.team_id
  from public.season_entries se join public.seasons s on s.id = se.season_id
  where s.year = season_year and se.number is not null
$$;

revoke execute on function public.sync_safety_car(smallint, smallint, boolean) from public, anon, authenticated;
revoke execute on function public.sync_sc_pending() from public, anon, authenticated;
revoke execute on function public.sync_practice_pending() from public, anon, authenticated;
revoke execute on function public.sync_practice(smallint, smallint, public.session_kind, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_entries_numbers(smallint) from public, anon, authenticated;
grant execute on function public.sync_safety_car(smallint, smallint, boolean), public.sync_sc_pending(),
  public.sync_practice_pending(), public.sync_practice(smallint, smallint, public.session_kind, jsonb),
  public.sync_entries_numbers(smallint) to service_role;

-- ─────────────────────────────── Таблица лиги: бустер и все бонусы по настройкам ───────────────────────────────
-- bonus_config: {"fastest_lap": true, "first_dnf": true, "pole_wins": true, "safety_car": true, "dnf_many": true, "boost": true};
-- отсутствующий ключ = включено.
create function public.league_points(l public.leagues, s public.score_lines)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when s.block = 'bonus' and not coalesce((l.bonus_config ->> s.kind)::boolean, true) then 0
    else s.points * case when coalesce((l.bonus_config ->> 'boost')::boolean, true) then s.multiplier else 1 end
  end
$$;

create or replace function public.league_table(league uuid)
returns table (
  user_id uuid, nickname text, avatar_color text, role public.league_role,
  points integer, exact_hits integer, events_won integer, last_points integer,
  provisional boolean, rank integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_league_member(league) then
    raise exception 'Ты не в этой лиге' using errcode = '42501';
  end if;
  return query
  with l as (
    select lg.*, coalesce((select e.round from public.events e where e.id = lg.start_event_id), 0) as start_round
    from public.leagues lg where lg.id = league
  ),
  scored as (
    select e.id, e.round
    from public.events e, l
    where e.season_id = l.season_id and e.round >= l.start_round
      and exists (select 1 from public.score_lines s where s.event_id = e.id)
  ),
  per_event as (
    select m.user_id, ev.id as event_id, ev.round,
           coalesce(sum(public.league_points(lg, s)), 0)::integer as pts,
           count(*) filter (where s.kind in ('race_exact', 'qualy_exact'))::integer as exact,
           coalesce(bool_or(s.provisional), false) as prov
    from public.league_members m
    cross join scored ev
    cross join public.leagues lg
    left join public.score_lines s on s.user_id = m.user_id and s.event_id = ev.id
    where m.league_id = league and lg.id = league
      and public.event_deadline(ev.id) > m.joined_at
    group by m.user_id, ev.id, ev.round
  ),
  winners as (
    select pe.event_id, max(pe.pts) as best from per_event pe group by pe.event_id
  ),
  last_ev as (
    select max(pe.round) as round from per_event pe
  ),
  totals as (
    select m.user_id,
           coalesce(sum(pe.pts), 0)::integer as points,
           coalesce(sum(pe.exact), 0)::integer as exact_hits,
           count(*) filter (where pe.pts > 0 and pe.pts = w.best)::integer as events_won,
           coalesce(max(pe.pts) filter (where pe.round = (select round from last_ev)), 0)::integer as last_points,
           coalesce(bool_or(pe.prov), false) as provisional
    from public.league_members m
    left join per_event pe on pe.user_id = m.user_id
    left join winners w on w.event_id = pe.event_id
    where m.league_id = league
    group by m.user_id
  )
  select t.user_id, p.nickname, p.avatar_color, m.role,
         t.points, t.exact_hits, t.events_won, t.last_points, t.provisional,
         (rank() over (order by t.points desc, t.exact_hits desc, t.events_won desc, t.last_points desc))::integer
  from totals t
  join public.profiles p on p.id = t.user_id
  join public.league_members m on m.league_id = league and m.user_id = t.user_id
  order by 10, p.nickname;
end $$;

-- ─────────────────────────────── Разбор этапа ───────────────────────────────
-- Прогноз игрока против результата и строки очков. Свой — всегда; чужой — только после дедлайна
-- и при общей лиге (те же правила RLS: функция security invoker).
create function public.breakdown_screen(ev bigint default null, player uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := coalesce(ev, (
    select sl.event_id from public.score_lines sl join public.events x on x.id = sl.event_id
    where sl.user_id = coalesce(player, auth.uid()) order by x.round desc limit 1),
    public.current_event_id());
  u uuid := coalesce(player, auth.uid());
begin
  return jsonb_build_object(
    'event', case when e is null then null else public.event_json(e) end,
    'player', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar_color', p.avatar_color)
               from public.profiles p where p.id = u),
    'prediction', (select to_jsonb(pr) - 'user_id' from public.predictions pr where pr.event_id = e and pr.user_id = u),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                'block', s.block, 'kind', s.kind, 'slot', s.slot, 'driver_id', s.driver_id,
                'points', s.points, 'multiplier', s.multiplier, 'provisional', s.provisional) order by s.block, s.slot, s.kind)
              from public.score_lines s where s.event_id = e and s.user_id = u), '[]'::jsonb),
    'qualy', coalesce((select jsonb_agg(r.driver_id order by r.position) from public.results r
                       where r.event_id = e and r.kind = 'qualy' and r.position <= 3), '[]'::jsonb),
    'race', coalesce((select jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'position', r.position,
                        'dnf', public.is_dnf(r.status, r.position_text), 'laps', r.laps, 'fastest', r.fastest_lap_rank = 1)
                        order by r.position) from public.results r where r.event_id = e and r.kind = 'race'), '[]'::jsonb),
    'safety_car', (select f.safety_car from public.race_facts f where f.event_id = e),
    'drivers', case when e is null then '[]'::jsonb else public.entries_json(e) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'round', x.round, 'name', x.name) order by x.round desc)
                        from public.events x where exists (select 1 from public.score_lines s where s.event_id = x.id and s.user_id = u)),
                       '[]'::jsonb)
  );
end $$;
grant execute on function public.breakdown_screen(bigint, uuid) to authenticated;

-- ─────────────────────────────── Прогноз: бустер доступен? ───────────────────────────────
-- Где в текущем окне уже стоит бустер (кроме этого этапа) — для подсказки на экране.
create function public.boost_used_elsewhere(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select (select jsonb_build_object('round', e2.round, 'name', e2.name)
          from public.predictions p join public.events e2 on e2.id = p.event_id
          where p.user_id = auth.uid() and p.event_id <> e.id and p.boost_block is not null
            and e2.season_id = e.season_id and public.boost_window(e2.round) = public.boost_window(e.round)
          limit 1)
  from public.events e where e.id = ev
$$;
grant execute on function public.boost_used_elsewhere(bigint) to authenticated;

-- ── Экран прогноза: все поля прогноза, бустер, очки прошлого этапа с множителем ──
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

-- ── Экран лиги: очки по этапам с бустером и настройками бонусов ──
create or replace function public.league_screen(league uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := public.current_event_id();
begin
  if not public.is_league_member(league) then
    raise exception 'Ты не в этой лиге' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'league', (select jsonb_build_object(
                 'id', l.id, 'name', l.name, 'invite_code', l.invite_code, 'max_members', l.max_members,
                 'mode', l.mode, 'owner_id', l.owner_id, 'bonus_config', l.bonus_config,
                 'start_event', (select jsonb_build_object('round', x.round, 'name', x.name) from public.events x where x.id = l.start_event_id),
                 'member_count', (select count(*) from public.league_members m where m.league_id = l.id))
               from public.leagues l where l.id = league),
    'table', coalesce((select jsonb_agg(to_jsonb(t) order by t.rank, t.nickname) from public.league_table(league) t), '[]'::jsonb),
    -- Очки по этапам для дуэлей (после дедлайна; строки очков видны только соседям по лиге).
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', sl.user_id, 'round', x.round, 'points', sl.pts))
      from (select s.user_id, s.event_id, sum(public.league_points(lg, s))::int as pts
            from public.score_lines s
            join public.league_members m on m.user_id = s.user_id and m.league_id = league
            join public.leagues lg on lg.id = league
            group by s.user_id, s.event_id) sl
      join public.events x on x.id = sl.event_id), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color,
                                          'role', m.role, 'joined_at', m.joined_at) order by m.joined_at)
      from public.league_members m join public.profiles p on p.id = m.user_id
      where m.league_id = league), '[]'::jsonb),
    'event', case when e is null then null else public.event_json(e) end,
    'submissions', case when e is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(s)) from public.league_submissions(league, e) s), '[]'::jsonb) end
  );
end $$;

-- ── Результаты: время практик ──
create or replace function public.results_screen(ev bigint default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := coalesce(ev, (
    select r.event_id from public.results r join public.events x on x.id = r.event_id
    order by x.round desc limit 1));
begin
  return jsonb_build_object(
    'event', case when e is null then null else public.event_json(e) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'round', x.round, 'name', x.name) order by x.round desc)
      from public.events x
      where exists (select 1 from public.results r where r.event_id = x.id)), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind, 'position', r.position, 'position_text', r.position_text, 'grid', r.grid, 'laps', r.laps,
        'status', r.status, 'fastest_lap_rank', r.fastest_lap_rank, 'is_final', r.is_final, 'source', r.source,
        'best_ms', r.best_ms, 'gap_ms', r.gap_ms,
        'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
        'team_name', t.name, 'team_code', t.code, 'color', t.color) order by r.kind, r.position)
      from public.results r
      join public.drivers d on d.id = r.driver_id
      left join public.teams t on t.id = r.team_id
      where r.event_id = e), '[]'::jsonb)
  );
end $$;
