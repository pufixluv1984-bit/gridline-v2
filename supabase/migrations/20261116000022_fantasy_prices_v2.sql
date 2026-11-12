-- 0022 · Фэнтези: живые цены, модель v2 «справедливая цена» (docs/FANTASY-FORMULA.md §4, решение владельца 12.11.2026).
--
-- fantasy_asset_lines(ev)   — очки пилотов и конструкторов за любой этап по правилам §2 (те же строки, что пишет
--                             recompute_fantasy_scores; тест 0016 проверяет совпадение). Нужна, чтобы форма считалась
--                             по всему сезону, даже по этапам до старта фэнтези.
-- fantasy_price_model(ev)   — рейтинг формы, справедливая цена и новая цена каждого актива (только чтение).
-- fantasy_update_prices(ev) — v2 по умолчанию; старая модель — fantasy_update_prices_v1, включается price_model = "v1".
-- fantasy_seed_prices_from  — новичок стартует с 85% цены напарника.
-- fantasy_market            — справедливая цена и история цен по этапам для экрана «Рынок».

-- ─────────────────────────────── Настройки ───────────────────────────────
insert into public.fantasy_rules (key, value, note) values
  ('price_model', '"v2"', 'Модель цен: v2 — справедливая цена (§4.1), v1 — четверти PPM (§4.3)'),
  ('w_form', '0.45', 'Вес свежей формы в рейтинге'),
  ('w_season', '0.20', 'Вес среднего за сезон'),
  ('w_qualy', '0.20', 'Вес квалификации'),
  ('w_trend', '0.15', 'Вес тренда'),
  ('form_weights', '[3, 2, 1]', 'Веса последних этапов в свежей форме (последний первым)'),
  ('qualy_window', '5', 'Сколько последних квалификаций в рейтинге'),
  ('qualy_h2h', '0.3', 'Доля сравнения с напарником в квалификационной части'),
  ('trend_window', '5', 'Сколько последних этапов для тренда'),
  ('target_driver', '[4.5, 28.0]', 'Справедливая цена пилота: низ, верх'),
  ('target_team', '[5.0, 28.0]', 'Справедливая цена конструктора: низ, верх'),
  ('target_exp', '1.6', 'Кривизна справедливой цены (больше — дорогих меньше)'),
  ('move_share', '0.3', 'Какую долю пути до справедливой цены проходить за этап'),
  ('move_cap', '0.8', 'Предел изменения цены за этап, ±$M'),
  ('move_min', '0.1', 'Меньший сдвиг не делается'),
  ('rookie_share', '0.85', 'Стартовая цена новичка — доля цены напарника')
on conflict (key) do nothing;

alter table public.fantasy_prices add column target numeric(4, 1);
comment on column public.fantasy_prices.target is 'Справедливая цена (модель v2), к которой цена движется';

-- ─────────────────────────────── Очки активов за любой этап ───────────────────────────────
-- Тело — те же правила, что в recompute_fantasy_scores (0015), но во временную таблицу и без проверки «фэнтези включено».
create function public.fantasy_asset_lines(ev bigint)
returns table (kind text, asset_id text, line text, points numeric)
language plpgsql
security definer
set search_path = ''
as $fal$
#variable_conflict use_column
declare
  half numeric := case when (select f.half_points from public.fantasy_events f where f.event_id = ev)
                       then public.frn('half_points') else 1 end;
begin
  create temp table if not exists fal (event_id bigint, kind text, asset_id text, line text, points numeric) on commit drop;
  delete from pg_temp.fal;

  -- Пилоты: квалификация.
  insert into pg_temp.fal (event_id, kind, asset_id, line, points)
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
  insert into pg_temp.fal (event_id, kind, asset_id, line, points)
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
  insert into pg_temp.fal (event_id, kind, asset_id, line, points)
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
    from dt join pg_temp.fal fp on fp.event_id = ev and fp.kind = 'driver' and fp.asset_id = dt.driver_id
    group by dt.team_id
    union all
    select q.team_id, 'q_bonus',
           case when q.q3 >= 2 then public.frn('team_q3_both') when q.q3 = 1 then public.frn('team_q3_one')
                when q.q1 >= 2 then public.frn('team_q1_both') else 0 end
    from q
    union all
    select dt.team_id, 'dsq', public.frn('team_dsq') * count(*)
    from dt join pg_temp.fal fp on fp.event_id = ev and fp.kind = 'driver' and fp.asset_id = dt.driver_id and fp.line = 'dsq'
    group by dt.team_id
  )
  insert into pg_temp.fal (event_id, kind, asset_id, line, points)
  select ev, 'team', team_id, line, sum(pts) from lines group by team_id, line having sum(pts) <> 0;


  return query select f.kind, f.asset_id, f.line, f.points from pg_temp.fal f;
end $fal$;
revoke execute on function public.fantasy_asset_lines(bigint) from public, anon, authenticated;
grant execute on function public.fantasy_asset_lines(bigint) to service_role;

-- ─────────────────────────────── Модель цен v2 ───────────────────────────────
create function public.fantasy_price_model(ev bigint)
returns table (kind text, asset_id text, price numeric, form numeric, season_avg numeric, qualy numeric, h2h numeric, trend numeric,
               rating numeric, target numeric, new_price numeric, delta numeric, reason text)
language plpgsql
security definer
set search_path = ''
as $m$
#variable_conflict use_column
declare
  season smallint;
  rnd smallint;
begin
  select e.season_id, e.round into season, rnd from public.events e where e.id = ev;

  create temp table if not exists fpm_lines (event_id bigint, round smallint, rn integer, kind text, asset_id text, points numeric) on commit drop;
  delete from pg_temp.fpm_lines;
  -- Этапы сезона до ev включительно, где есть гонка; rn = 1 — самый свежий.
  insert into pg_temp.fpm_lines
  select v.id, v.round, v.rn, l.kind, l.asset_id, sum(l.points)
  from (select e.id, e.round, (row_number() over (order by e.round desc))::int as rn
        from public.events e
        where e.season_id = season and e.round <= rnd
          and exists (select 1 from public.results r where r.event_id = e.id and r.kind = 'race')) v
  cross join lateral public.fantasy_asset_lines(v.id) l
  group by v.id, v.round, v.rn, l.kind, l.asset_id;

  return query
  with evs as (select distinct fl.event_id, fl.round, fl.rn from pg_temp.fpm_lines fl),
  assets as (select p.kind, p.asset_id, p.price from public.fantasy_prices p where p.event_id = ev),
  pts as (
    select a.kind, a.asset_id, v.round, v.rn, coalesce(fl.points, 0) as points
    from assets a cross join evs v
    left join pg_temp.fpm_lines fl on fl.event_id = v.event_id and fl.kind = a.kind and fl.asset_id = a.asset_id
  ),
  fw as (select public.fr('form_weights') as w),
  comp as (
    select p.kind, p.asset_id,
           sum(p.points * coalesce((fw.w ->> (p.rn - 1))::numeric, 0)) / nullif(sum(coalesce((fw.w ->> (p.rn - 1))::numeric, 0)), 0) as form,
           avg(p.points) as season_avg,
           case when count(*) filter (where p.rn <= public.frn('trend_window')) >= 3
                then coalesce((regr_slope(p.points, p.round) filter (where p.rn <= public.frn('trend_window')))::numeric, 0) else 0 end as trend
    from pts p cross join fw
    group by p.kind, p.asset_id
  ),
  q as (
    select r.event_id, r.driver_id, r.team_id, r.position, count(*) over (partition by r.event_id) as n
    from public.results r join evs v on v.event_id = r.event_id and v.rn <= public.frn('qualy_window')
    where r.kind = 'qualy'
  ),
  qd as (
    select q.*, 1 - (q.position - 1)::numeric / greatest(q.n - 1, 1) as qs,
           (select t.position from q t where t.event_id = q.event_id and t.team_id = q.team_id and t.driver_id <> q.driver_id limit 1) as mate_pos
    from q
  ),
  qa as (
    select 'driver'::text as kind, qd.driver_id as asset_id, avg(qd.qs) as qs,
           avg(case when qd.mate_pos is null then null when qd.position < qd.mate_pos then 1 else 0 end) as h2h
    from qd group by qd.driver_id
    union all
    select 'team', qd.team_id, avg(qd.qs), null from qd where qd.team_id is not null group by qd.team_id
  ),
  full_ as (
    select a.kind, a.asset_id, a.price, c.form, c.season_avg, c.trend, qa.h2h,
           case when qa.qs is null then null
                when a.kind = 'driver' and qa.h2h is not null then (1 - public.frn('qualy_h2h')) * qa.qs + public.frn('qualy_h2h') * qa.h2h
                else qa.qs end as qualy
    from assets a
    left join comp c on c.kind = a.kind and c.asset_id = a.asset_id
    left join qa on qa.kind = a.kind and qa.asset_id = a.asset_id
  ),
  pr as (
    select f.*,
           percent_rank() over (partition by f.kind order by coalesce(f.form, 0))::numeric as p_form,
           percent_rank() over (partition by f.kind order by coalesce(f.season_avg, 0))::numeric as p_season,
           percent_rank() over (partition by f.kind order by coalesce(f.qualy, 0.5))::numeric as p_qualy,
           percent_rank() over (partition by f.kind order by coalesce(f.trend, 0))::numeric as p_trend
    from full_ f
  ),
  rt as (
    select pr.*,
           public.frn('w_form') * pr.p_form + public.frn('w_season') * pr.p_season
           + public.frn('w_qualy') * pr.p_qualy + public.frn('w_trend') * pr.p_trend as raw
    from pr
  ),
  tg as (
    select rt.*,
           rt.raw / nullif(max(rt.raw) over (partition by rt.kind), 0) as rel,
           public.fr(case rt.kind when 'driver' then 'target_driver' else 'target_team' end) as rng
    from rt
  ),
  mv as (
    select tg.*,
           case when (select count(*) from evs) = 0 then tg.price
                else round((tg.rng ->> 0)::numeric + ((tg.rng ->> 1)::numeric - (tg.rng ->> 0)::numeric)
                           * power(greatest(coalesce(tg.rel, 0), 0), public.frn('target_exp')), 1) end as tgt
    from tg
  ),
  st as (
    select mv.*,
           greatest(-public.frn('move_cap'), least(public.frn('move_cap'), round(public.frn('move_share') * (mv.tgt - mv.price), 1))) as step0
    from mv
  ),
  fin as (
    select st.*,
           greatest(public.frn('price_floor'), st.price + case when abs(st.step0) < public.frn('move_min') then 0 else st.step0 end) as np
    from st
  )
  select fin.kind, fin.asset_id, fin.price,
         round(fin.form, 2), round(fin.season_avg, 2), round(fin.qualy, 3), round(fin.h2h, 2), round(fin.trend, 2),
         round(fin.rel, 3), fin.tgt, fin.np, fin.np - fin.price,
         format('справедливая $%sM · %s', to_char(fin.tgt, 'FM990.0'),
           case
             when fin.np > fin.price then
               case greatest(fin.p_form, fin.p_qualy, fin.p_trend, fin.p_season)
                 when fin.p_form then 'сильная свежая форма'
                 when fin.p_qualy then case when coalesce(fin.h2h, 0) > 0.5 then 'квалификация выше напарника' else 'сильная квалификация' end
                 when fin.p_trend then 'тренд вверх'
                 else 'сильный сезон' end
             when fin.np < fin.price then
               case least(fin.p_form, fin.p_qualy, fin.p_trend, fin.p_season)
                 when fin.p_form then 'слабая свежая форма'
                 when fin.p_qualy then case when fin.h2h is not null and fin.h2h < 0.5 then 'квалификация ниже напарника' else 'слабая квалификация' end
                 when fin.p_trend then 'тренд вниз'
                 else 'слабый сезон' end
             else 'цена около справедливой' end)
  from fin;
end $m$;
revoke execute on function public.fantasy_price_model(bigint) from public, anon, authenticated;
grant execute on function public.fantasy_price_model(bigint) to service_role;

-- ─────────────────────────────── Пересчёт цен после этапа ───────────────────────────────
alter function public.fantasy_update_prices(bigint) rename to fantasy_update_prices_v1;

create function public.fantasy_update_prices(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nxt bigint;
  n integer;
begin
  if coalesce(public.fr('price_model') #>> '{}', 'v1') <> 'v2' then
    return public.fantasy_update_prices_v1(ev);
  end if;
  nxt := (select e2.id from public.events e join public.events e2 on e2.season_id = e.season_id and e2.round > e.round
          where e.id = ev order by e2.round limit 1);
  if nxt is null or not public.fantasy_enabled(ev)
     or exists (select 1 from public.fantasy_events f where f.event_id = ev and f.prices_done) then
    return 0;
  end if;
  delete from public.fantasy_prices where event_id = nxt;
  insert into public.fantasy_prices (event_id, kind, asset_id, price, delta, reason, target)
  select nxt, m.kind, m.asset_id, m.new_price, m.delta, m.reason, m.target from public.fantasy_price_model(ev) m;
  get diagnostics n = row_count;
  insert into public.fantasy_events (event_id, prices_done) values (ev, true)
  on conflict (event_id) do update set prices_done = true;
  return n;
end $$;
revoke execute on function public.fantasy_update_prices(bigint) from public, anon, authenticated;
grant execute on function public.fantasy_update_prices(bigint) to service_role;

-- ─────────────────────────────── Стартовые цены: новичок ───────────────────────────────
create or replace function public.fantasy_seed_prices_from(ev bigint, src smallint)
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
  -- Новичок (не ехал в сезоне-источнике): доля цены напарника вместо нижней цены (FANTASY-FORMULA §4.2).
  if src <> season and public.fr('rookie_share') is not null then
    update public.fantasy_prices p
       set price = greatest(public.frn('price_floor'), round(public.frn('rookie_share') * m.price, 1)),
           reason = format('новичок: %s%% цены напарника', round(public.frn('rookie_share') * 100))
      from (select se.driver_id, max(mp.price) as price
              from public.season_entries se
              join public.season_entries mate on mate.season_id = se.season_id and mate.team_id = se.team_id
                                              and mate.driver_id <> se.driver_id and mate.active
              join public.fantasy_prices mp on mp.event_id = ev and mp.kind = 'driver' and mp.asset_id = mate.driver_id
             where se.season_id = season and se.active
               and exists (select 1 from public.championship c where c.season_id = src and c.kind = 'drivers' and c.driver_id = mate.driver_id)
             group by se.driver_id) m
     where p.event_id = ev and p.kind = 'driver' and p.asset_id = m.driver_id
       and not exists (select 1 from public.championship c where c.season_id = src and c.kind = 'drivers' and c.driver_id = p.asset_id);
  end if;
  return n;
end $$;


-- ─────────────────────────────── «Рынок»: справедливая цена и история ───────────────────────────────
create or replace function public.fantasy_market(ev bigint, league uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  season smallint := (select e.season_id from public.events e where e.id = ev);
  rnd smallint := (select e.round from public.events e where e.id = ev);
  last3 bigint[];
  last_ev bigint;
  locked_ev bigint;
  members integer;
begin
  select coalesce(array_agg(x.id), '{}') into last3 from (
    select e.id from public.events e where e.season_id = season and e.round < rnd
      and exists (select 1 from public.fantasy_points fp where fp.event_id = e.id)
    order by e.round desc limit public.frn('ppm_window')::int) x;
  last_ev := last3[1];
  -- Владение считаем по последнему закрытому этапу: до блокировки чужие составы не раскрываются.
  select e.id into locked_ev from public.events e
  where e.season_id = season and e.round <= rnd and public.fantasy_lock_at(e.id) <= now()
    and exists (select 1 from public.fantasy_squads s where s.event_id = e.id)
  order by e.round desc limit 1;
  members := (select count(*) from public.league_members m where m.league_id = league);

  return jsonb_build_object(
    'league_size', members,
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
               'number', se.number, 'team_id', t.id, 'team_code', t.code, 'team_name', t.name, 'color', t.color,
               'price', p.price, 'delta', p.delta, 'reason', p.reason,
               'target', p.target,
               'history', (select coalesce(jsonb_agg(jsonb_build_object('round', he.round, 'price', h.price) order by he.round), '[]'::jsonb)
                           from public.fantasy_prices h join public.events he on he.id = h.event_id
                           where he.season_id = season and he.round <= rnd and h.kind = 'driver' and h.asset_id = d.id),
               'pts3', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp where fp.event_id = any (last3) and fp.kind = 'driver' and fp.asset_id = d.id),
               'season_pts', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp join public.events e on e.id = fp.event_id
                              where e.season_id = season and e.round < rnd and fp.kind = 'driver' and fp.asset_id = d.id),
               'last_pts', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp where fp.event_id = last_ev and fp.kind = 'driver' and fp.asset_id = d.id),
               'out', not coalesce(se.active, false),
               'sub', case when not coalesce(se.active, false) then public.fantasy_sub_for(d.id, ev) end,
               'owned', case when league is null or locked_ev is null then null else (
                          select count(*) from public.fantasy_squads s join public.league_members m on m.user_id = s.user_id and m.league_id = league
                          where s.event_id = locked_ev and d.id = any (s.drivers)) end)
             order by p.price desc, d.code)
      from public.fantasy_prices p
      join public.drivers d on d.id = p.asset_id
      left join public.season_entries se on se.season_id = season and se.driver_id = d.id
      left join public.teams t on t.id = se.team_id
      where p.event_id = ev and p.kind = 'driver'), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'code', t.code, 'name', t.name, 'color', t.color,
               'price', p.price, 'delta', p.delta, 'reason', p.reason,
               'target', p.target,
               'history', (select coalesce(jsonb_agg(jsonb_build_object('round', he.round, 'price', h.price) order by he.round), '[]'::jsonb)
                           from public.fantasy_prices h join public.events he on he.id = h.event_id
                           where he.season_id = season and he.round <= rnd and h.kind = 'team' and h.asset_id = t.id),
               'pts3', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp where fp.event_id = any (last3) and fp.kind = 'team' and fp.asset_id = t.id),
               'season_pts', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp join public.events e on e.id = fp.event_id
                              where e.season_id = season and e.round < rnd and fp.kind = 'team' and fp.asset_id = t.id),
               'last_pts', (select coalesce(sum(fp.points), 0) from public.fantasy_points fp where fp.event_id = last_ev and fp.kind = 'team' and fp.asset_id = t.id),
               'owned', case when league is null or locked_ev is null then null else (
                          select count(*) from public.fantasy_squads s join public.league_members m on m.user_id = s.user_id and m.league_id = league
                          where s.event_id = locked_ev and t.id = any (s.teams)) end)
             order by p.price desc, t.code)
      from public.fantasy_prices p join public.teams t on t.id = p.asset_id
      where p.event_id = ev and p.kind = 'team'), '[]'::jsonb)
  );
end $$;

revoke execute on function public.fantasy_market(bigint, uuid) from public, anon, authenticated;
