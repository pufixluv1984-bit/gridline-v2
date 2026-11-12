-- 0012 · Фаза 3: профиль игрока (статистика, серии, лучшие пилоты, история, архив сезонов),
-- настройки профиля (любимые пилот и команда, смена ника раз в 30 дней — макет Overlays),
-- звания сезона в лиге (решение 13.11.2026): «Снайпер» — больше всех точных попаданий,
-- «Лучший этап» — самый большой счёт за этап, «Выживший» — самая длинная серия этапов с очками;
-- таблица лиги: сдвиг за этап, форма за 5 этапов, виды «Этап» и «Всё время».

-- ─────────────────────────────── Профиль: новые поля ───────────────────────────────
alter table public.profiles
  add column fav_driver text references public.drivers (id) on delete set null,
  add column fav_team text references public.teams (id) on delete set null,
  add column nickname_changed_at timestamptz;
grant update (fav_driver, fav_team) on public.profiles to authenticated;

-- Ник меняется не чаще раза в 30 дней (первая смена после регистрации — сразу).
create function public.profiles_nick_cooldown()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nickname is distinct from old.nickname then
    if old.nickname_changed_at is not null and old.nickname_changed_at > now() - interval '30 days' then
      raise exception 'Ник можно менять раз в 30 дней' using errcode = '23514', hint = 'nick_cooldown';
    end if;
    new.nickname_changed_at := now();
  end if;
  return new;
end $$;
create trigger profiles_nick_cooldown before update on public.profiles
  for each row execute function public.profiles_nick_cooldown();

-- ─────────────────────────────── Таблица лиги на момент этапа ───────────────────────────────
-- upto: учитывать этапы до этого круга включительно (null — все). Нужна для сдвига мест за этап.
create function public.league_table_upto(league uuid, upto smallint)
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
    where e.season_id = l.season_id and e.round >= l.start_round and (upto is null or e.round <= upto)
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
revoke execute on function public.league_table_upto(uuid, smallint) from public, anon;
grant execute on function public.league_table_upto(uuid, smallint) to authenticated;

create or replace function public.league_table(league uuid)
returns table (
  user_id uuid, nickname text, avatar_color text, role public.league_role,
  points integer, exact_hits integer, events_won integer, last_points integer,
  provisional boolean, rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.league_table_upto(league, null)
$$;

-- ─────────────────────────────── Звания сезона в лиге ───────────────────────────────
-- Те же этапы, что в таблице: сезон лиги, с этапа старта, только этапы после вступления игрока.
-- При равенстве звание у того, кто выше в таблице лиги.
create function public.league_titles(league uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  res jsonb;
begin
  if not public.is_league_member(league) then
    raise exception 'Ты не в этой лиге' using errcode = '42501';
  end if;
  with l as (
    select lg.*, coalesce((select e.round from public.events e where e.id = lg.start_event_id), 0) as start_round
    from public.leagues lg where lg.id = league
  ),
  ev as (
    select e.id, e.round, e.name from public.events e, l
    where e.season_id = l.season_id and e.round >= l.start_round
      and exists (select 1 from public.score_lines s where s.event_id = e.id)
  ),
  pe as (
    select m.user_id, ev.id as event_id, ev.round, ev.name,
           coalesce(sum(public.league_points(lg, s)), 0)::int as pts,
           count(*) filter (where s.kind in ('qualy_exact', 'race_exact'))::int as exact
    from public.league_members m
    cross join ev
    cross join public.leagues lg
    left join public.score_lines s on s.user_id = m.user_id and s.event_id = ev.id
    where m.league_id = league and lg.id = league and public.event_deadline(ev.id) > m.joined_at
    group by m.user_id, ev.id, ev.round, ev.name
  ),
  tbl as (
    select t.user_id, t.rank from public.league_table_upto(league, null) t
  ),
  streaks as (
    select user_id, max(c)::int as streak from (
      select user_id, g, count(*) as c from (
        select user_id, round, pts,
               row_number() over (partition by user_id order by round)
                 - row_number() over (partition by user_id, (pts > 0) order by round) as g
        from pe
      ) x where pts > 0 group by user_id, g
    ) y group by user_id
  ),
  sniper as (
    select pe.user_id, sum(pe.exact)::int as v from pe join tbl using (user_id)
    group by pe.user_id, tbl.rank having sum(pe.exact) > 0 order by 2 desc, tbl.rank limit 1
  ),
  best as (
    select pe.user_id, pe.pts as v, pe.name from pe join tbl using (user_id)
    where pe.pts > 0 order by pe.pts desc, tbl.rank, pe.round limit 1
  ),
  survivor as (
    select s.user_id, s.streak as v from streaks s join tbl using (user_id)
    where s.streak > 0 order by s.streak desc, tbl.rank limit 1
  )
  select jsonb_build_object(
    'sniper', (select jsonb_build_object('user_id', s.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color, 'value', s.v)
               from sniper s join public.profiles p on p.id = s.user_id),
    'best_stage', (select jsonb_build_object('user_id', s.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color, 'value', s.v, 'event', s.name)
                   from best s join public.profiles p on p.id = s.user_id),
    'survivor', (select jsonb_build_object('user_id', s.user_id, 'nickname', p.nickname, 'avatar_color', p.avatar_color, 'value', s.v)
                 from survivor s join public.profiles p on p.id = s.user_id)
  ) into res;
  return res;
end $$;
revoke execute on function public.league_titles(uuid) from public, anon;
grant execute on function public.league_titles(uuid) to authenticated;

-- ─────────────────────────────── Очки игрока по этапам ───────────────────────────────
-- Этапы сезона с результатами (есть строки очков у кого-то); очки с бустером.
-- security invoker: чужие строки видны только соседям по лиге (RLS score_lines).
create function public.player_events(player uuid, season smallint)
returns table (event_id bigint, round smallint, name text, points integer, exact integer, played boolean)
language sql
stable
set search_path = ''
as $$
  select e.id, e.round, e.name,
         coalesce((select sum(s.points * s.multiplier) from public.score_lines s where s.event_id = e.id and s.user_id = player), 0)::integer,
         coalesce((select count(*) from public.score_lines s where s.event_id = e.id and s.user_id = player
                   and s.kind in ('qualy_exact', 'race_exact')), 0)::integer,
         exists (select 1 from public.predictions p where p.event_id = e.id and p.user_id = player)
  from public.events e
  where e.season_id = season and exists (select 1 from public.score_lines s where s.event_id = e.id)
  order by e.round
$$;
grant execute on function public.player_events(uuid, smallint) to authenticated;

-- Самая длинная серия этапов подряд с очками (пропуск или ноль обрывают серию).
create function public.best_streak(player uuid, season smallint)
returns integer
language sql
stable
set search_path = ''
as $$
  with ev as (
    select round, points > 0 as ok, row_number() over (order by round) as rn
    from public.player_events(player, season)
  ),
  grp as (
    select rn - row_number() over (order by round) as g from ev where ok
  )
  select coalesce(max(c), 0)::integer from (select count(*) as c from grp group by g) x
$$;
grant execute on function public.best_streak(uuid, smallint) to authenticated;

-- ─────────────────────────────── Экран «Профиль» ───────────────────────────────
-- Свой профиль или профиль соседа по лиге (RLS profiles). season_year — архив прошлых сезонов.
create function public.profile_screen(player uuid default null, season_year smallint default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  u uuid := coalesce(player, auth.uid());
  season smallint := coalesce(
    (select s.id from public.seasons s where s.year = season_year),
    (select s.id from public.seasons s where s.is_current));
  lg uuid;
  my_rank integer;
  rival uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = u) then
    return jsonb_build_object('player', null);
  end if;

  -- Соперник для дуэли: ближайший по таблице первой общей лиги сезона.
  select m.league_id into lg
  from public.league_members m join public.leagues l on l.id = m.league_id
  where m.user_id = u and l.season_id = season and public.is_league_member(l.id)
  order by m.joined_at limit 1;
  if lg is not null then
    select t.rank into my_rank from public.league_table(lg) t where t.user_id = u;
    select t.user_id into rival from public.league_table(lg) t
    where t.user_id <> u order by abs(t.rank - my_rank), t.rank limit 1;
  end if;

  return jsonb_build_object(
    'player', (select jsonb_build_object(
                 'id', p.id, 'nickname', p.nickname, 'avatar_color', p.avatar_color, 'created_at', p.created_at,
                 'nickname_changed_at', p.nickname_changed_at,
                 'fav_driver', (select jsonb_build_object('id', d.id, 'code', d.code,
                                  'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                  'number', se.number, 'team_name', t.name, 'team_code', t.code, 'color', t.color)
                                from public.drivers d
                                left join public.season_entries se on se.driver_id = d.id
                                  and se.season_id = (select s.id from public.seasons s where s.is_current)
                                left join public.teams t on t.id = se.team_id
                                where d.id = p.fav_driver),
                 'fav_team', (select jsonb_build_object('id', t.id, 'name', t.name, 'code', t.code, 'color', t.color)
                              from public.teams t where t.id = p.fav_team))
               from public.profiles p where p.id = u),
    'is_me', u = auth.uid(),
    -- Для своего профиля: из кого выбирать любимых (заявка текущего сезона).
    'options', case when u = auth.uid() then jsonb_build_object(
      'drivers', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                            'team_name', t.name) order by coalesce(d.name_ru, d.family_name))
        from public.season_entries se
        join public.seasons s on s.id = se.season_id and s.is_current
        join public.drivers d on d.id = se.driver_id
        join public.teams t on t.id = se.team_id
        where se.active), '[]'::jsonb),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name) order by t.name)
        from public.teams t
        where exists (select 1 from public.season_entries se join public.seasons s on s.id = se.season_id and s.is_current
                      where se.team_id = t.id)), '[]'::jsonb)) end,
    'season', (select year from public.seasons where id = season),
    -- Архив: сезоны, в которых у игрока есть очки (и текущий).
    'seasons', coalesce((select jsonb_agg(y order by y desc) from (
                 select s.year as y from public.seasons s where s.is_current
                 union
                 select s.year from public.score_lines sl join public.events e on e.id = sl.event_id
                 join public.seasons s on s.id = e.season_id where sl.user_id = u) q), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.round) from public.player_events(u, season) h), '[]'::jsonb),
    'best_streak', public.best_streak(u, season),
    'titles', coalesce((
      select jsonb_agg(jsonb_build_object('league_id', l.id, 'league', l.name, 'title', t.key, 'value', t.value -> 'value')
                       order by l.name, t.key)
      from public.league_members m join public.leagues l on l.id = m.league_id
      cross join lateral jsonb_each(public.league_titles(l.id)) t
      where m.user_id = u and l.season_id = season and public.is_league_member(l.id)
        and t.value ->> 'user_id' = u::text), '[]'::jsonb),
    -- Точность: угаданные места / ответы по блокам на этапах с результатами (проценты считает экран).
    'accuracy', (
      select jsonb_build_object(
        'qualy_hit', count(*) filter (where s.kind = 'qualy_exact'),
        'qualy_total', 3 * (select count(*) from public.predictions p join public.events e on e.id = p.event_id
                   where p.user_id = u and e.season_id = season
                     and exists (select 1 from public.results r where r.event_id = e.id and r.kind = 'qualy')),
        'race_hit', count(*) filter (where s.kind = 'race_exact'),
        'race_total', 10 * (select count(*) from public.predictions p join public.events e on e.id = p.event_id
                   where p.user_id = u and e.season_id = season
                     and exists (select 1 from public.results r where r.event_id = e.id and r.kind = 'race')),
        'bonus_hit', count(*) filter (where s.block = 'bonus' and s.points > 0),
        'bonus_total', coalesce((
                   select sum((p.fastest_lap is not null)::int + (p.first_dnf is not null)::int + (p.pole_wins is not null)::int
                              + (p.safety_car is not null)::int + (p.dnf_many is not null)::int)
                   from public.predictions p join public.events e on e.id = p.event_id
                   where p.user_id = u and e.season_id = season
                     and exists (select 1 from public.results r where r.event_id = e.id and r.kind = 'race')), 0))
      from public.score_lines s join public.events e on e.id = s.event_id
      where s.user_id = u and e.season_id = season),
    -- Лучшие пилоты: кто принёс больше всего очков в прогнозах сезона.
    'best_drivers', coalesce((
      select jsonb_agg(q.x order by (q.x ->> 'points')::int desc)
      from (select jsonb_build_object('id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                      'points', sum(s.points * s.multiplier)::int, 'color', t.color, 'team_code', t.code,
                                      'number', se.number) as x
            from public.score_lines s
            join public.events e on e.id = s.event_id and e.season_id = season
            join public.drivers d on d.id = s.driver_id
            left join public.season_entries se on se.driver_id = d.id and se.season_id = season
            left join public.teams t on t.id = se.team_id
            where s.user_id = u
            group by d.id, d.code, d.name_ru, d.given_name, d.family_name, t.color, t.code, se.number
            order by sum(s.points * s.multiplier) desc, d.code
            limit 3) q), '[]'::jsonb),
    'leagues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'name', l.name,
               'member_count', (select count(*) from public.league_members m2 where m2.league_id = l.id),
               'rank', (select t.rank from public.league_table(l.id) t where t.user_id = u)) order by m.joined_at)
      from public.league_members m join public.leagues l on l.id = m.league_id
      where m.user_id = u and l.season_id = season and public.is_league_member(l.id)), '[]'::jsonb),
    'duel', case when rival is null then null else (
      select jsonb_build_object(
        'rival', (select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'avatar_color', p.avatar_color)
                  from public.profiles p where p.id = rival),
        'wins', count(*) filter (where a.points > b.points),
        'losses', count(*) filter (where a.points < b.points))
      from public.player_events(u, season) a
      join public.player_events(rival, season) b on b.event_id = a.event_id) end
  );
end $$;
grant execute on function public.profile_screen(uuid, smallint) to authenticated;

-- ─────────────────────────────── Экран лиги: сдвиг, форма, этап, всё время, звания ───────────────────────────────
-- per_event теперь в рамках лиги (сезон лиги, с этапа старта, этапы после вступления) — как в таблице.
create or replace function public.league_screen(league uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  e bigint := public.current_event_id();
  rounds smallint[];
begin
  if not public.is_league_member(league) then
    raise exception 'Ты не в этой лиге' using errcode = '42501';
  end if;
  select coalesce(array_agg(x.round order by x.round), '{}') into rounds
  from public.events x, public.leagues lg
  where lg.id = league and x.season_id = lg.season_id
    and x.round >= coalesce((select y.round from public.events y where y.id = lg.start_event_id), 0)
    and exists (select 1 from public.score_lines s where s.event_id = x.id);
  return jsonb_build_object(
    'league', (select jsonb_build_object(
                 'id', l.id, 'name', l.name, 'invite_code', l.invite_code, 'max_members', l.max_members,
                 'mode', l.mode, 'owner_id', l.owner_id, 'bonus_config', l.bonus_config,
                 'season', (select s.year from public.seasons s where s.id = l.season_id),
                 'start_event', (select jsonb_build_object('round', x.round, 'name', x.name) from public.events x where x.id = l.start_event_id),
                 'member_count', (select count(*) from public.league_members m where m.league_id = l.id))
               from public.leagues l where l.id = league),
    'table', coalesce((select jsonb_agg(to_jsonb(t) order by t.rank, t.nickname) from public.league_table(league) t), '[]'::jsonb),
    -- Места до последнего этапа лиги — для стрелок сдвига.
    'prev_ranks', case when cardinality(rounds) < 2 then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'rank', t.rank))
      from public.league_table_upto(league, rounds[cardinality(rounds) - 1]) t), '[]'::jsonb) end,
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object('round', x.round, 'name', x.name) order by x.round)
      from public.events x, public.leagues lg
      where lg.id = league and x.season_id = lg.season_id and x.round = any (rounds)), '[]'::jsonb),
    -- Очки по этапам лиги (дуэли, форма, вид «Этап»); этапы до вступления игрока не входят.
    'per_event', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'round', x.round, 'points', (
               select coalesce(sum(public.league_points(lg, s)), 0)::int
               from public.score_lines s where s.user_id = m.user_id and s.event_id = x.id)))
      from public.league_members m
      join public.leagues lg on lg.id = m.league_id
      join public.events x on x.season_id = lg.season_id and x.round = any (rounds)
      where m.league_id = league and public.event_deadline(x.id) > m.joined_at), '[]'::jsonb),
    -- Всё время: очки участников за все сезоны и этапы (бонусы — по настройкам этой лиги).
    'all_time', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id,
               'points', (select coalesce(sum(public.league_points(lg, s)), 0)::int from public.score_lines s where s.user_id = m.user_id),
               'exact_hits', (select count(*) from public.score_lines s
                              where s.user_id = m.user_id and s.kind in ('qualy_exact', 'race_exact'))))
      from public.league_members m join public.leagues lg on lg.id = m.league_id
      where m.league_id = league), '[]'::jsonb),
    'titles', public.league_titles(league),
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
