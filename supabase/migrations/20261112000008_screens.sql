-- 0008 · По одному запросу на экран (правило 11): RPC, собирающие данные экрана в один JSON.
-- security invoker (по умолчанию): данные читаются с правами игрока, RLS действует как обычно.

-- Этап «сейчас»: первый, чья гонка ещё не прошла больше 12 часов назад.
create function public.current_event_id()
returns bigint
language sql
stable
set search_path = ''
as $$
  select e.id
  from public.events e
  join public.seasons s on s.id = e.season_id and s.is_current
  join public.sessions r on r.event_id = e.id and r.kind = 'race'
  where r.starts_at > now() - interval '12 hours' and e.status = 'scheduled'
  order by e.round
  limit 1
$$;
grant execute on function public.current_event_id() to anon, authenticated;

create function public.event_json(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'round', e.round, 'name', e.name, 'slug', e.slug, 'country', e.country,
    'circuit', e.circuit, 'is_sprint', e.is_sprint, 'status', e.status,
    'deadline', public.event_deadline(e.id),
    'season_rounds', (select count(*) from public.events x where x.season_id = e.season_id),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'starts_at', s.starts_at) order by s.starts_at)
                          from public.sessions s where s.event_id = e.id), '[]'::jsonb)
  )
  from public.events e where e.id = ev
$$;
grant execute on function public.event_json(bigint) to anon, authenticated;

-- Пилоты заявки сезона этапа: для выбора в прогнозе и подписей в таблицах.
create function public.entries_json(ev bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
    'number', se.number, 'active', se.active,
    'team_id', t.id, 'team_code', t.code, 'team_name', t.name, 'color', t.color
  ) order by t.name, se.number), '[]'::jsonb)
  from public.events e
  join public.season_entries se on se.season_id = e.season_id
  join public.drivers d on d.id = se.driver_id
  join public.teams t on t.id = se.team_id
  where e.id = ev
$$;
grant execute on function public.entries_json(bigint) to anon, authenticated;

-- ── Экран «Прогноз» ─────────────────────────────────────────────────────
create function public.predict_screen(ev bigint default null, league uuid default null)
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
    'prediction', (select jsonb_build_object('qualy', p.qualy, 'race', p.race, 'fastest_lap', p.fastest_lap, 'updated_at', p.updated_at)
                   from public.predictions p where p.event_id = e and p.user_id = auth.uid()),
    'last', (select jsonb_build_object(
               'name', x.name,
               'total', sum(sl.points), 'qualy', sum(sl.points) filter (where sl.block = 'qualy'),
               'race', sum(sl.points) filter (where sl.block = 'race'), 'bonus', sum(sl.points) filter (where sl.block = 'bonus'))
             from public.score_lines sl join public.events x on x.id = sl.event_id
             where sl.event_id = last_ev and sl.user_id = auth.uid()
             group by x.name),
    'league', (select jsonb_build_object('id', l.id, 'name', l.name) from public.leagues l where l.id = lg),
    'submissions', case when lg is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(s)) from public.league_submissions(lg, e) s), '[]'::jsonb) end
  );
end $$;
grant execute on function public.predict_screen(bigint, uuid) to authenticated;

-- ── Экран «Лига» ────────────────────────────────────────────────────────
create function public.league_screen(league uuid)
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
      from (select s.user_id, s.event_id, sum(s.points)::int as pts
            from public.score_lines s
            join public.league_members m on m.user_id = s.user_id and m.league_id = league
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
grant execute on function public.league_screen(uuid) to authenticated;

-- ── Экран «Главная» ─────────────────────────────────────────────────────
create function public.home_screen(league uuid default null)
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
grant execute on function public.home_screen(uuid) to authenticated;

-- ── Экран «Результаты» ──────────────────────────────────────────────────
create function public.results_screen(ev bigint default null)
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
        'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
        'team_name', t.name, 'team_code', t.code, 'color', t.color) order by r.kind, r.position)
      from public.results r
      join public.drivers d on d.id = r.driver_id
      left join public.teams t on t.id = r.team_id
      where r.event_id = e), '[]'::jsonb)
  );
end $$;
grant execute on function public.results_screen(bigint) to anon, authenticated;

-- ── Календарь ───────────────────────────────────────────────────────────
create function public.schedule_screen()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'current_event_id', public.current_event_id(),
    'events', coalesce(jsonb_agg(public.event_json(e.id) order by e.round), '[]'::jsonb)
  )
  from public.events e
  join public.seasons s on s.id = e.season_id and s.is_current
$$;
grant execute on function public.schedule_screen() to anon, authenticated;

-- ── Новый инвайт-код (макет Lobby-Invite: «Сбросить ссылку») ────────────
create or replace function public.leagues_lock_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.owner_id is distinct from old.owner_id
        and coalesce(current_setting('gridline.allow_owner_change', true), '') <> 'on')
     or (new.invite_code is distinct from old.invite_code
        and coalesce(current_setting('gridline.allow_code_change', true), '') <> 'on')
     or new.season_id is distinct from old.season_id then
    raise exception 'owner_id, season_id и invite_code меняются только через RPC' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.reset_invite_code(league uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not exists (select 1 from public.leagues l where l.id = league and l.owner_id = auth.uid()) then
    raise exception 'Только владелец лиги' using errcode = '42501';
  end if;
  perform set_config('gridline.allow_code_change', 'on', true);
  loop
    code := public.gen_invite_code();
    begin
      update public.leagues set invite_code = code where id = league;
      exit;
    exception when unique_violation then
      -- совпадение с чужим кодом — пробуем ещё
    end;
  end loop;
  perform set_config('gridline.allow_code_change', '', true);
  return code;
end $$;
revoke execute on function public.reset_invite_code(uuid) from public, anon;
grant execute on function public.reset_invite_code(uuid) to authenticated;
