-- 0017 · Фаза 5: дедлайны прогноза по блокам и блок спринта (решения владельца 12.11.2026, PRODUCT.md).
-- С Гран-при Катара 2026: квалификация закрывается стартом квалификации, спринт — стартом спринта,
-- топ-10 гонки и бонусы — стартом гонки. До Лас-Вегаса включительно — по-старому (всё со стартом квалификации).
-- Спринт: топ-3 точно, +6/+4/+4, без бустера.

-- ─────────────────────────────── Режим дедлайнов этапа ───────────────────────────────
alter table public.events add column split_deadlines boolean not null default true;
update public.events e set split_deadlines = false
from public.seasons s
where s.id = e.season_id and s.year = 2026
  and e.round <= coalesce((select x.round from public.events x where x.season_id = s.id and x.slug = 'las-vegas'), 0);

-- Дедлайн блока: qualy / sprint / race / bonus. Без режима по блокам — у всех дедлайн квалификации.
create function public.block_deadline(ev bigint, block text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when not e.split_deadlines or block = 'qualy' then public.event_deadline(ev)
    when block = 'sprint' then (select coalesce(s.deadline_at, s.starts_at) from public.sessions s where s.event_id = ev and s.kind = 'sprint')
    -- Нет гонки в расписании — блок закрывается вместе с квалификацией.
    else coalesce((select coalesce(s.deadline_at, s.starts_at) from public.sessions s where s.event_id = ev and s.kind = 'race'),
                  public.event_deadline(ev))
  end
  from public.events e where e.id = ev
$$;
grant execute on function public.block_deadline(bigint, text) to anon, authenticated;

-- Когда закрывается весь прогноз (последний блок).
create function public.prediction_closes_at(ev bigint)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(public.block_deadline(ev, 'qualy'), public.block_deadline(ev, 'race'),
                  coalesce(public.block_deadline(ev, 'sprint'), public.block_deadline(ev, 'qualy')))
$$;
grant execute on function public.prediction_closes_at(bigint) to anon, authenticated;

-- ─────────────────────────────── Прогноз: блоки по отдельности, спринт ───────────────────────────────
alter table public.predictions alter column qualy drop not null, alter column race drop not null;
alter table public.predictions add column sprint text[] check (cardinality(sprint) = 3);
grant insert (sprint) on public.predictions to authenticated;
grant update (sprint) on public.predictions to authenticated;

create or replace function public.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.events;
  bad text;
  closed_q boolean;
  closed_s boolean;
  closed_r boolean;
  bonus_changed boolean;
begin
  select * into ev from public.events where id = new.event_id;
  if public.event_deadline(new.event_id) is null or now() >= public.prediction_closes_at(new.event_id) then
    raise exception 'Приём прогнозов на этот этап закрыт' using errcode = '42501', hint = 'deadline_passed';
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id) then
    raise exception 'Нельзя менять владельца или этап прогноза' using errcode = '42501';
  end if;

  closed_q := now() >= public.block_deadline(new.event_id, 'qualy');
  closed_s := now() >= coalesce(public.block_deadline(new.event_id, 'sprint'), '-infinity');
  closed_r := now() >= public.block_deadline(new.event_id, 'race');
  bonus_changed := tg_op = 'INSERT' and (new.fastest_lap is not null or new.first_dnf is not null or new.pole_wins is not null
                                         or new.safety_car is not null or new.dnf_many is not null)
                   or tg_op = 'UPDATE' and (new.fastest_lap, new.first_dnf, new.pole_wins, new.safety_car, new.dnf_many)
                                           is distinct from (old.fastest_lap, old.first_dnf, old.pole_wins, old.safety_car, old.dnf_many);

  -- Закрытый блок не меняется (при вставке — не заполняется).
  if closed_q and (case when tg_op = 'INSERT' then new.qualy is not null else new.qualy is distinct from old.qualy end) then
    raise exception 'Квалификация уже началась — этот блок закрыт' using errcode = '42501', hint = 'block_closed';
  end if;
  if closed_s and (case when tg_op = 'INSERT' then new.sprint is not null else new.sprint is distinct from old.sprint end) then
    raise exception 'Спринт уже начался — этот блок закрыт' using errcode = '42501', hint = 'block_closed';
  end if;
  if closed_r and ((case when tg_op = 'INSERT' then new.race is not null else new.race is distinct from old.race end) or bonus_changed) then
    raise exception 'Гонка уже началась — блок закрыт' using errcode = '42501', hint = 'block_closed';
  end if;
  if (tg_op = 'INSERT' and new.boost_block is not null and now() >= public.block_deadline(new.event_id, new.boost_block))
     or (tg_op = 'UPDATE' and new.boost_block is distinct from old.boost_block
         and ((old.boost_block is not null and now() >= public.block_deadline(new.event_id, old.boost_block))
              or (new.boost_block is not null and now() >= public.block_deadline(new.event_id, new.boost_block)))) then
    raise exception 'Бустер нельзя перенести с закрытого блока или на закрытый блок' using errcode = '42501', hint = 'block_closed';
  end if;

  -- Полнота. По-старому — квалификация и топ-10 обязательны; по блокам — каждый блок заполняется целиком, когда отправлен.
  if not ev.split_deadlines and (new.qualy is null or new.race is null) then
    raise exception 'Заполни все места' using errcode = '23514', hint = 'incomplete';
  end if;
  if new.sprint is not null and not ev.is_sprint then
    raise exception 'На этом этапе нет спринта' using errcode = '23514';
  end if;
  if array_position(new.qualy, null) is not null or array_position(new.race, null) is not null
     or array_position(new.sprint, null) is not null then
    raise exception 'Заполни все места' using errcode = '23514', hint = 'incomplete';
  end if;
  if (new.qualy is not null and (select count(distinct x) from unnest(new.qualy) x) <> 3)
     or (new.race is not null and (select count(distinct x) from unnest(new.race) x) <> 10)
     or (new.sprint is not null and (select count(distinct x) from unnest(new.sprint) x) <> 3) then
    raise exception 'Один пилот не может стоять на двух местах' using errcode = '23514', hint = 'duplicate_driver';
  end if;
  select x into bad
  from unnest(coalesce(new.qualy, '{}') || coalesce(new.race, '{}') || coalesce(new.sprint, '{}')
              || coalesce(array[new.fastest_lap], '{}') || coalesce(array[nullif(new.first_dnf, 'none')], '{}')) x
  where x is not null
    and not exists (select 1 from public.season_entries se where se.season_id = ev.season_id and se.driver_id = x)
  limit 1;
  if bad is not null then
    raise exception 'Пилота % нет в заявке сезона', bad using errcode = '23503', hint = 'unknown_driver';
  end if;
  -- Бустер: один на окно из 5 этапов.
  if new.boost_block is not null and exists (
    select 1 from public.predictions p join public.events e on e.id = p.event_id
    where p.user_id = new.user_id and p.event_id <> new.event_id and p.boost_block is not null
      and e.season_id = ev.season_id and public.boost_window(e.round) = public.boost_window(ev.round)
  ) then
    raise exception 'Бустер уже использован на другом этапе этого окна' using errcode = '23514', hint = 'boost_used';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.submitted_at := now();
  end if;
  return new;
end $$;

-- RLS: свой прогноз правится, пока открыт хоть один блок (какой именно — проверяет триггер);
-- чужой виден соседям по лиге после закрытия всего прогноза.
drop policy predictions_select on public.predictions;
drop policy predictions_insert on public.predictions;
drop policy predictions_update on public.predictions;
drop policy predictions_delete on public.predictions;
create policy predictions_select on public.predictions for select to authenticated
  using (user_id = (select auth.uid())
         or (now() >= public.prediction_closes_at(event_id) and public.shares_league(user_id)));
create policy predictions_insert on public.predictions for insert to authenticated
  with check (user_id = (select auth.uid()) and now() < public.prediction_closes_at(event_id));
create policy predictions_update on public.predictions for update to authenticated
  using (user_id = (select auth.uid()) and now() < public.prediction_closes_at(event_id))
  with check (user_id = (select auth.uid()) and now() < public.prediction_closes_at(event_id));
create policy predictions_delete on public.predictions for delete to authenticated
  using (user_id = (select auth.uid()) and now() < public.event_deadline(event_id));

-- ─────────────────────────────── Очки спринта ───────────────────────────────
alter table public.score_lines drop constraint score_lines_block_check;
alter table public.score_lines add constraint score_lines_block_check check (block in ('qualy', 'sprint', 'race', 'bonus'));
alter table public.score_lines drop constraint score_lines_kind_check;
alter table public.score_lines add constraint score_lines_kind_check check (kind in (
  'qualy_exact', 'sprint_exact', 'race_exact', 'race_off1', 'race_off2', 'race_in_top10', 'race_podium',
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
begin
  n := public.recompute_predict_scores(ev);
  -- Спринт: топ-3 точно, +6 за победителя, +4 за 2-е и 3-е (бустер на спринт не ставится).
  select coalesce(bool_and(r.is_final), false) into final from public.results r where r.event_id = ev and r.kind in ('qualy', 'race');
  insert into public.score_lines (user_id, event_id, block, kind, slot, driver_id, points, provisional)
  select p.user_id, ev, 'sprint', 'sprint_exact', q.slot, q.driver, case q.slot when 1 then 6 else 4 end, not final
  from public.predictions p
  cross join lateral unnest(p.sprint) with ordinality as q(driver, slot)
  join public.results r on r.event_id = ev and r.kind = 'sprint' and r.driver_id = q.driver and r.position = q.slot
  where p.event_id = ev;
  n := n + (select count(*) from public.score_lines where event_id = ev and block = 'sprint');
  perform public.recompute_fantasy_scores(ev);
  if (select coalesce(bool_and(r.is_final), false) from public.results r where r.event_id = ev and r.kind = 'race') then
    perform public.fantasy_update_prices(ev);
  end if;
  return n;
end $$;

-- ─────────────────────────────── Экраны: дедлайны блоков ───────────────────────────────
-- event_json получает дедлайны блоков и ближайший открытый дедлайн (для таймера «ставки закроются через…»).
create or replace function public.event_json(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'round', e.round, 'name', e.name, 'slug', e.slug, 'country', e.country,
    'circuit', e.circuit, 'is_sprint', e.is_sprint, 'status', e.status,
    'deadline', public.event_deadline(e.id),
    'split_deadlines', e.split_deadlines,
    'deadlines', jsonb_build_object(
      'qualy', public.block_deadline(e.id, 'qualy'),
      'sprint', case when e.is_sprint then public.block_deadline(e.id, 'sprint') end,
      'race', public.block_deadline(e.id, 'race')),
    'next_deadline', (select min(d) from unnest(array[public.block_deadline(e.id, 'qualy'),
                                                      case when e.is_sprint then public.block_deadline(e.id, 'sprint') end,
                                                      public.block_deadline(e.id, 'race')]) d where d > now()),
    'season_rounds', (select count(*) from public.events x where x.season_id = e.season_id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'starts_at', s.starts_at) order by s.starts_at)
                          from public.sessions s where s.event_id = e.id), '[]'::jsonb)
  )
  from public.events e where e.id = ev
$$;

-- Разбор этапа: результат спринта (топ-3) для блока спринта.
alter function public.breakdown_screen(bigint, uuid) rename to breakdown_screen_base;
create function public.breakdown_screen(ev bigint default null, player uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (select public.breakdown_screen_base(ev, player) as j)
  select b.j || jsonb_build_object('sprint', coalesce((
    select jsonb_agg(r.driver_id order by r.position) from public.results r
    where r.event_id = (b.j -> 'event' ->> 'id')::bigint and r.kind = 'sprint' and r.position <= 3), '[]'::jsonb))
  from b
$$;
grant execute on function public.breakdown_screen(bigint, uuid) to authenticated;
