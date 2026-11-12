-- 0016 · Фаза 4: экраны фэнтези (макеты Fantasy-Squad, -Market, -Leaderboard, -Results, -Analytics),
-- фэнтези-блок в профиле и цены в каталоге пилотов. Один запрос на экран (правило 11).

-- Этап для сборки: ближайший незакрытый этап с фэнтези, иначе последний.
create function public.fantasy_current_event()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select e.id from public.events e join public.seasons s on s.id = e.season_id and s.is_current
     where public.fantasy_enabled(e.id) and public.fantasy_lock_at(e.id) > now() order by e.round limit 1),
    (select e.id from public.events e join public.seasons s on s.id = e.season_id and s.is_current
     where public.fantasy_enabled(e.id) order by e.round desc limit 1))
$$;
grant execute on function public.fantasy_current_event() to authenticated;

-- Последний этап с очками фэнтези в сезоне этапа ev (или текущем).
create function public.fantasy_last_scored(season smallint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select e.id from public.events e
  where e.season_id = season and exists (select 1 from public.fantasy_scores fs where fs.event_id = e.id)
  order by e.round desc limit 1
$$;

-- Фэнтези-лига игрока: выбранная (если участник и режим с фэнтези), иначе первая такая.
create function public.fantasy_league_of(league uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select l.id from public.leagues l where l.id = league and l.mode in ('fantasy', 'both') and public.is_league_member(l.id)),
    (select l.id from public.league_members m join public.leagues l on l.id = m.league_id
     join public.seasons s on s.id = l.season_id and s.is_current
     where m.user_id = auth.uid() and l.mode in ('fantasy', 'both') order by m.joined_at limit 1))
$$;

-- Резервист вместо пилота, который не едет на этапе: активный пилот той же команды с меньшим числом гонок.
create function public.fantasy_sub_for(driver text, ev bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select se2.driver_id
  from public.events e
  join public.season_entries se on se.season_id = e.season_id and se.driver_id = driver
  join public.season_entries se2 on se2.season_id = e.season_id and se2.team_id = se.team_id and se2.active and se2.driver_id <> driver
  where e.id = ev
  order by (select count(*) from public.results r join public.events x on x.id = r.event_id
            where x.season_id = e.season_id and r.driver_id = se2.driver_id and r.kind = 'race'), se2.driver_id
  limit 1
$$;

-- Рынок этапа: цены, изменение, очки (за 3 последних этапа, сезон, прошлый этап), кто не едет, владение в лиге.
create function public.fantasy_market(ev bigint, league uuid)
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

-- ── «Мой состав» и «Рынок» ──
create function public.fantasy_squad_screen(ev bigint default null, league uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  e bigint := coalesce(ev, public.fantasy_current_event());
  lg uuid := public.fantasy_league_of(league);
  base public.fantasy_squads;
  prev public.fantasy_squads;
  start_ev bigint;
begin
  if u is null then
    raise exception 'Нужно войти' using errcode = '42501';
  end if;
  if e is null or not public.fantasy_enabled(e) then
    return jsonb_build_object('event', null);
  end if;
  base := public.fantasy_base_squad(u, e);
  prev := public.fantasy_prev_squad(u, e);
  select fs.start_event_id into start_ev from public.fantasy_seasons fs join public.events x on x.season_id = fs.season_id where x.id = e;
  return jsonb_build_object(
    'event', public.event_json(e),
    'lock_at', public.fantasy_lock_at(e),
    'race_at', (select s.starts_at from public.sessions s where s.event_id = e and s.kind = 'race'),
    'locked', now() >= public.fantasy_lock_at(e),
    'is_start', e = start_ev,
    'league_id', lg,
    'team_name', (select p.team_name from public.profiles p where p.id = u),
    'rules', jsonb_build_object('budget', public.frn('budget'), 'transfer_penalty', public.frn('transfer_penalty'),
                                'free_max', public.frn('free_max')),
    'free_before', public.fantasy_free_before(u, e),
    'base', case when base.user_id is null then null else jsonb_build_object('drivers', base.drivers, 'teams', base.teams, 'drs', base.drs) end,
    'prev_chip', prev.chip,
    'squad', (select jsonb_build_object('drivers', s.drivers, 'teams', s.teams, 'drs', s.drs, 'chip', s.chip, 'cost', s.cost,
                                        'transfers', s.transfers, 'penalty', s.penalty, 'auto', s.auto, 'final_fix', s.final_fix,
                                        'updated_at', s.updated_at)
              from public.fantasy_squads s where s.user_id = u and s.event_id = e),
    'chips_used', coalesce((
      select jsonb_agg(jsonb_build_object('chip', s.chip, 'round', x.round, 'event', x.name) order by x.round)
      from public.fantasy_squads s join public.events x on x.id = s.event_id
      join public.events cur on cur.id = e and cur.season_id = x.season_id
      where s.user_id = u and s.chip is not null and s.event_id <> e), '[]'::jsonb),
    'market', public.fantasy_market(e, lg)
  );
end $$;
grant execute on function public.fantasy_squad_screen(bigint, uuid) to authenticated;

-- ── Таблица фэнтези-лиги ──
-- Очки — этапы сезона лиги с этапа старта и после вступления (как в игре прогнозов). Ничья: больше побед на этапах, лучший последний этап.
create function public.fantasy_league_table(league uuid)
returns table (user_id uuid, nickname text, avatar_color text, team_name text, points numeric, events_won integer,
               last_points numeric, rank integer)
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
  ev as (
    select e.id, e.round from public.events e, l
    where e.season_id = l.season_id and e.round >= l.start_round
      and exists (select 1 from public.fantasy_scores fs where fs.event_id = e.id)
  ),
  pe as (
    select m.user_id, ev.id as event_id, ev.round, coalesce(fs.total, 0) as pts
    from public.league_members m cross join ev
    left join public.fantasy_scores fs on fs.user_id = m.user_id and fs.event_id = ev.id
    where m.league_id = league and public.fantasy_lock_at(ev.id) > m.joined_at
  ),
  best as (select pe.event_id, max(pe.pts) as top from pe group by pe.event_id),
  tot as (
    select m.user_id,
           coalesce(sum(pe.pts), 0) as points,
           count(*) filter (where pe.pts > 0 and pe.pts = b.top)::int as won,
           coalesce(max(pe.pts) filter (where pe.round = (select max(round) from ev)), 0) as last_pts
    from public.league_members m
    left join pe on pe.user_id = m.user_id
    left join best b on b.event_id = pe.event_id
    where m.league_id = league
    group by m.user_id
  )
  select t.user_id, p.nickname, p.avatar_color, p.team_name, t.points, t.won, t.last_pts,
         (rank() over (order by t.points desc, t.won desc, t.last_pts desc))::int
  from tot t join public.profiles p on p.id = t.user_id
  order by 8, p.nickname;
end $$;
revoke execute on function public.fantasy_league_table(uuid) from public, anon;
grant execute on function public.fantasy_league_table(uuid) to authenticated;

-- ── «Лидерборд» ──
create function public.fantasy_leaderboard_screen(league uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lg uuid := public.fantasy_league_of(league);
  season smallint;
  last_ev bigint;
  nxt bigint := public.fantasy_current_event();
begin
  if lg is null then
    return jsonb_build_object('league', null, 'event', case when nxt is null then null else public.event_json(nxt) end,
                              'lock_at', public.fantasy_lock_at(nxt));
  end if;
  season := (select l.season_id from public.leagues l where l.id = lg);
  last_ev := public.fantasy_last_scored(season);
  return jsonb_build_object(
    'league', (select jsonb_build_object('id', l.id, 'name', l.name, 'mode', l.mode,
                                         'member_count', (select count(*) from public.league_members m where m.league_id = l.id))
               from public.leagues l where l.id = lg),
    'leagues', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by m.joined_at)
                         from public.league_members m join public.leagues l on l.id = m.league_id
                         where m.user_id = auth.uid() and l.mode in ('fantasy', 'both') and l.season_id = season), '[]'::jsonb),
    'event', case when nxt is null then null else public.event_json(nxt) end,
    'lock_at', public.fantasy_lock_at(nxt),
    'weather', case when nxt is null then '[]'::jsonb else public.weather_json(nxt) end,
    'last_event', case when last_ev is null then null else public.event_json(last_ev) end,
    'table', coalesce((select jsonb_agg(to_jsonb(t) order by t.rank, t.nickname) from public.fantasy_league_table(lg) t), '[]'::jsonb),
    -- Составы и разбор последнего посчитанного этапа (он уже закрыт — их можно показывать).
    'squads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', s.user_id, 'drivers', s.drivers, 'teams', s.teams, 'drs', s.drs, 'chip', s.chip,
               'cost', s.cost, 'transfers', s.transfers, 'penalty', s.penalty, 'auto', s.auto,
               'cost_next', (select sum(p.price) from public.fantasy_prices p
                             where p.event_id = (select e2.id from public.events e1 join public.events e2 on e2.season_id = e1.season_id and e2.round > e1.round
                                                 where e1.id = last_ev order by e2.round limit 1)
                               and ((p.kind = 'driver' and p.asset_id = any (s.drivers)) or (p.kind = 'team' and p.asset_id = any (s.teams)))),
               'total', fs.total, 'details', fs.details, 'provisional', fs.provisional))
      from public.fantasy_squads s
      join public.league_members m on m.user_id = s.user_id and m.league_id = lg
      left join public.fantasy_scores fs on fs.user_id = s.user_id and fs.event_id = s.event_id
      where s.event_id = last_ev), '[]'::jsonb),
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', fs.user_id, 'round', e.round, 'total', fs.total) order by e.round)
      from public.fantasy_scores fs join public.events e on e.id = fs.event_id and e.season_id = season
      join public.league_members m on m.user_id = fs.user_id and m.league_id = lg), '[]'::jsonb),
    'assets', (select jsonb_build_object(
                 'drivers', coalesce(jsonb_object_agg(d.id, jsonb_build_object('code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                                                              'number', se.number, 'color', t.color, 'team_code', t.code)), '{}'::jsonb))
               from public.season_entries se join public.drivers d on d.id = se.driver_id join public.teams t on t.id = se.team_id
               where se.season_id = season),
    'teams', (select coalesce(jsonb_object_agg(t.id, jsonb_build_object('code', t.code, 'name', t.name, 'color', t.color)), '{}'::jsonb) from public.teams t)
  );
end $$;
grant execute on function public.fantasy_leaderboard_screen(uuid) to authenticated;

-- ── «Результаты этапа» ──
create function public.fantasy_results_screen(ev bigint default null, league uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lg uuid := public.fantasy_league_of(league);
  e bigint := coalesce(ev, public.fantasy_last_scored((select s.id from public.seasons s where s.is_current)));
  season smallint := (select x.season_id from public.events x where x.id = e);
begin
  if e is null then
    return jsonb_build_object('event', null);
  end if;
  return jsonb_build_object(
    'event', public.event_json(e),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'round', x.round, 'name', x.name) order by x.round desc)
                        from public.events x where x.season_id = season
                          and exists (select 1 from public.fantasy_points fp where fp.event_id = x.id)), '[]'::jsonb),
    'winner', (select jsonb_build_object('code', d.code, 'name', coalesce(d.name_ru, d.family_name))
               from public.results r join public.drivers d on d.id = r.driver_id
               where r.event_id = e and r.kind = 'race' and r.position = 1),
    'drivers', coalesce((
      select jsonb_agg(x order by (x ->> 'points')::numeric desc)
      from (select jsonb_build_object('id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                      'number', se.number, 'team_code', t.code, 'team_name', t.name, 'color', t.color,
                                      'points', sum(fp.points), 'lines', jsonb_object_agg(fp.line, fp.points),
                                      'price', (select p.price from public.fantasy_prices p where p.event_id = e and p.kind = 'driver' and p.asset_id = d.id)) x
            from public.fantasy_points fp
            join public.drivers d on d.id = fp.asset_id
            left join public.season_entries se on se.season_id = season and se.driver_id = d.id
            left join public.teams t on t.id = se.team_id
            where fp.event_id = e and fp.kind = 'driver'
            group by d.id, d.code, d.name_ru, d.given_name, d.family_name, se.number, t.code, t.name, t.color) q), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(x order by (x ->> 'points')::numeric desc)
      from (select jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'color', t.color,
                                      'points', sum(fp.points), 'lines', jsonb_object_agg(fp.line, fp.points)) x
            from public.fantasy_points fp join public.teams t on t.id = fp.asset_id
            where fp.event_id = e and fp.kind = 'team'
            group by t.id, t.code, t.name, t.color) q), '[]'::jsonb),
    'mine', (select jsonb_build_object('total', fs.total, 'penalty', fs.penalty, 'drs', fs.drs, 'multiplier', fs.multiplier,
                                       'details', fs.details, 'provisional', fs.provisional,
                                       'chip', (select s.chip from public.fantasy_squads s where s.user_id = fs.user_id and s.event_id = e))
             from public.fantasy_scores fs where fs.user_id = auth.uid() and fs.event_id = e),
    'league', case when lg is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', fs.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color,
                                          'team_name', p.team_name, 'total', fs.total, 'drs', fs.drs,
                                          'chip', (select s.chip from public.fantasy_squads s where s.user_id = fs.user_id and s.event_id = e))
                       order by fs.total desc)
      from public.fantasy_scores fs join public.league_members m on m.user_id = fs.user_id and m.league_id = lg
      join public.profiles p on p.id = fs.user_id
      where fs.event_id = e), '[]'::jsonb) end
  );
end $$;
grant execute on function public.fantasy_results_screen(bigint, uuid) to authenticated;

-- ── «Аналитика» ──
create function public.fantasy_analytics_screen(league uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  lg uuid := public.fantasy_league_of(league);
  season smallint := (select s.id from public.seasons s where s.is_current);
  cur bigint := public.fantasy_current_event();
begin
  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('round', e.round, 'name', e.name, 'total', fs.total, 'penalty', fs.penalty,
                                          'drs', fs.drs, 'chip', s.chip) order by e.round)
      from public.fantasy_scores fs join public.events e on e.id = fs.event_id and e.season_id = season
      left join public.fantasy_squads s on s.user_id = fs.user_id and s.event_id = fs.event_id
      where fs.user_id = u), '[]'::jsonb),
    'league', case when lg is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', fs.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color,
                                          'round', e.round, 'total', fs.total) order by e.round)
      from public.fantasy_scores fs join public.events e on e.id = fs.event_id and e.season_id = season
      join public.league_members m on m.user_id = fs.user_id and m.league_id = lg
      join public.profiles p on p.id = fs.user_id), '[]'::jsonb) end,
    'drivers', public.fantasy_market(cur, null) -> 'drivers'
  );
end $$;
grant execute on function public.fantasy_analytics_screen(uuid) to authenticated;

-- ── Профиль: фэнтези-блок; каталог пилотов: цены ──
alter function public.profile_screen(uuid, smallint) rename to profile_screen_base;
create function public.profile_screen(player uuid default null, season_year smallint default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  u uuid := coalesce(player, auth.uid());
  base jsonb := public.profile_screen_base(player, season_year);
begin
  if base -> 'player' = 'null'::jsonb then
    return base;
  end if;
  return base || jsonb_build_object('fantasy', public.profile_fantasy(u));
end $$;
grant execute on function public.profile_screen(uuid, smallint) to authenticated;

-- Фэнтези в профиле: команда, место в фэнтези-лиге, последний закрытый состав (свой — и текущий черновик).
create function public.profile_fantasy(u uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lg uuid;
  season smallint := (select s.id from public.seasons s where s.is_current);
  sq public.fantasy_squads;
begin
  -- Чужой профиль — только соседу по лиге.
  if u <> auth.uid() and not public.shares_league(u) then
    return null;
  end if;
  select l.id into lg from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = u and l.mode in ('fantasy', 'both') and l.season_id = season and public.is_league_member(l.id)
  order by m.joined_at limit 1;
  select s.* into sq from public.fantasy_squads s join public.events e on e.id = s.event_id and e.season_id = season
  where s.user_id = u and (u = auth.uid() or now() >= public.fantasy_lock_at(s.event_id))
  order by e.round desc limit 1;
  if sq.user_id is null and lg is null then
    return null;
  end if;
  return jsonb_build_object(
    'team_name', (select p.team_name from public.profiles p where p.id = u),
    'league', case when lg is null then null else (
      select jsonb_build_object('id', lg, 'name', (select l.name from public.leagues l where l.id = lg),
                                'rank', t.rank, 'members', (select count(*) from public.league_members m where m.league_id = lg),
                                'points', t.points)
      from public.fantasy_league_table(lg) t where t.user_id = u) end,
    'squad', case when sq.user_id is null then null else jsonb_build_object(
      'drivers', sq.drivers, 'teams', sq.teams, 'drs', sq.drs, 'chip', sq.chip, 'cost', sq.cost,
      'transfers', sq.transfers, 'free_before', sq.free_before,
      'lineup', (select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.family_name),
                                                     'number', se.number, 'color', t.color, 'team_code', t.code) order by x.ord)
                 from unnest(sq.drivers) with ordinality x(id, ord)
                 join public.drivers d on d.id = x.id
                 left join public.season_entries se on se.season_id = season and se.driver_id = d.id
                 left join public.teams t on t.id = se.team_id),
      'cons', (select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'color', t.color) order by x.ord)
               from unnest(sq.teams) with ordinality x(id, ord) join public.teams t on t.id = x.id)) end,
    'chips_used', coalesce((select jsonb_agg(s.chip) from public.fantasy_squads s join public.events e on e.id = s.event_id and e.season_id = season
                            where s.user_id = u and s.chip is not null and (u = auth.uid() or now() >= public.fantasy_lock_at(s.event_id))), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('round', e.round, 'name', e.name, 'total', fs.total) order by e.round)
                         from public.fantasy_scores fs join public.events e on e.id = fs.event_id and e.season_id = season
                         where fs.user_id = u), '[]'::jsonb),
    'budget', public.frn('budget')
  );
end $$;
revoke execute on function public.profile_fantasy(uuid) from public, anon;
grant execute on function public.profile_fantasy(uuid) to authenticated;

alter function public.drivers_screen() rename to drivers_screen_base;
create function public.drivers_screen()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.drivers_screen_base() || jsonb_build_object(
    'prices', coalesce((select jsonb_object_agg(p.asset_id, p.price) from public.fantasy_prices p
                        where p.event_id = public.fantasy_current_event() and p.kind = 'driver'), '{}'::jsonb))
$$;
grant execute on function public.drivers_screen() to authenticated;
