-- 0004 · Лиги (фаза 1): создание, вступление по коду с ограничением попыток, выход, исключение,
-- передача, кто отправил прогноз, таблица лиги с тай-брейком (PRODUCT.md §1–2, макеты Lobby-* и League).

-- ─────────────────────────────── Поля лиги ───────────────────────────────
alter table public.leagues
  add column start_event_id bigint references public.events (id) on delete set null,
  add column mode text not null default 'predict' check (mode in ('predict', 'fantasy', 'both'));

-- Лимит игроков: 2–20, по умолчанию 8 (макет Lobby-Create).
alter table public.leagues drop constraint leagues_max_members_check;
alter table public.leagues alter column max_members set default 8;
alter table public.leagues add constraint leagues_max_members_check check (max_members between 2 and 20);

-- Владельца ставит база, а не браузер.
alter table public.leagues alter column owner_id set default auth.uid();
revoke insert on public.leagues from authenticated;
grant insert (name, season_id, start_event_id, max_members, mode, bonus_config) on public.leagues to authenticated;

-- Передача лиги идёт через RPC transfer_league: только она выставляет флаг, разрешающий сменить владельца.
create or replace function public.leagues_lock_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.owner_id is distinct from old.owner_id
        and coalesce(current_setting('gridline.allow_owner_change', true), '') <> 'on')
     or new.season_id is distinct from old.season_id
     or new.invite_code is distinct from old.invite_code then
    raise exception 'owner_id, season_id и invite_code меняются только через RPC' using errcode = '42501';
  end if;
  return new;
end $$;

-- ─────────────────────────────── Ограничение попыток ───────────────────────────────
create table public.join_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null
);
create index join_attempts_user_at on public.join_attempts (user_id, at);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Не больше 10 неверных кодов в час: перебор 31^6 ≈ 900 млн кодов становится бессмысленным.
create function public.find_league_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  league uuid;
begin
  if uid is null then
    raise exception 'Нужно войти в аккаунт' using errcode = '42501';
  end if;
  if (select count(*) from public.join_attempts a where a.user_id = uid and not a.ok and a.at > now() - interval '1 hour') >= 10 then
    raise exception 'Слишком много неверных кодов. Попробуй через час.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  select l.id into league from public.leagues l where l.invite_code = upper(btrim(code));
  -- Неверный код не бросает исключение: иначе откатилась бы и запись о попытке.
  insert into public.join_attempts (user_id, ok) values (uid, league is not null);
  return league;
end $$;
revoke execute on function public.find_league_by_code(text) from public, anon, authenticated;

-- ─────────────────────────────── Превью приглашения (Lobby-Join) ───────────────────────────────
create function public.league_preview(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  league uuid := public.find_league_by_code(code);
  res jsonb;
begin
  if league is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'mode', l.mode,
    'max_members', l.max_members,
    'owner_nickname', o.nickname,
    'start_event', (select jsonb_build_object('round', e.round, 'name', e.name) from public.events e where e.id = l.start_event_id),
    'member_count', (select count(*) from public.league_members m where m.league_id = l.id),
    'already_member', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'avatar_color', p.avatar_color) order by m.joined_at)
      from (select * from public.league_members m2 where m2.league_id = l.id order by m2.joined_at limit 8) m
      join public.profiles p on p.id = m.user_id
    ), '[]'::jsonb)
  ) into res
  from public.leagues l
  join public.profiles o on o.id = l.owner_id
  where l.id = league;
  return res;
end $$;
revoke execute on function public.league_preview(text) from public, anon;
grant execute on function public.league_preview(text) to authenticated;

-- ─────────────────────────────── Вступление, выход, исключение, передача ───────────────────────────────
-- Возвращает id лиги или null, если кода нет.
create function public.join_league(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  league uuid := public.find_league_by_code(code);
  cap smallint;
begin
  if league is null then
    return null;  -- кода нет; попытка уже записана
  end if;
  if exists (select 1 from public.league_members m where m.league_id = league and m.user_id = auth.uid()) then
    return league;
  end if;
  select l.max_members into cap from public.leagues l where l.id = league for update;
  if (select count(*) from public.league_members m where m.league_id = league) >= cap then
    raise exception 'В лиге нет свободных мест' using errcode = 'P0001', hint = 'league_full';
  end if;
  insert into public.league_members (league_id, user_id, role) values (league, auth.uid(), 'member');
  return league;
end $$;
revoke execute on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

create function public.leave_league(league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if not exists (select 1 from public.league_members m where m.league_id = league and m.user_id = uid) then
    raise exception 'Ты не в этой лиге' using errcode = '42501';
  end if;
  if exists (select 1 from public.leagues l where l.id = league and l.owner_id = uid) then
    if exists (select 1 from public.league_members m where m.league_id = league and m.user_id <> uid) then
      raise exception 'Сначала передай лигу другому игроку' using errcode = 'P0001', hint = 'owner_must_transfer';
    end if;
    delete from public.leagues where id = league;  -- владелец один — лига удаляется
    return;
  end if;
  delete from public.league_members where league_id = league and user_id = uid;
end $$;
revoke execute on function public.leave_league(uuid) from public, anon;
grant execute on function public.leave_league(uuid) to authenticated;

create function public.kick_member(league uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.leagues l where l.id = league and l.owner_id = auth.uid()) then
    raise exception 'Только владелец лиги' using errcode = '42501';
  end if;
  if member = auth.uid() then
    raise exception 'Себя исключить нельзя' using errcode = 'P0001', hint = 'self';
  end if;
  delete from public.league_members where league_id = league and user_id = member;
end $$;
revoke execute on function public.kick_member(uuid, uuid) from public, anon;
grant execute on function public.kick_member(uuid, uuid) to authenticated;

create function public.transfer_league(league uuid, new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.leagues l where l.id = league and l.owner_id = auth.uid()) then
    raise exception 'Только владелец лиги' using errcode = '42501';
  end if;
  if not exists (select 1 from public.league_members m where m.league_id = league and m.user_id = new_owner) or new_owner = auth.uid() then
    raise exception 'Новый владелец должен быть участником лиги' using errcode = 'P0001', hint = 'not_member';
  end if;
  perform set_config('gridline.allow_owner_change', 'on', true);
  update public.leagues set owner_id = new_owner where id = league;
  perform set_config('gridline.allow_owner_change', '', true);
  update public.league_members set role = case when user_id = new_owner then 'owner'::public.league_role else 'member'::public.league_role end
  where league_id = league and user_id in (new_owner, auth.uid());
end $$;
revoke execute on function public.transfer_league(uuid, uuid) from public, anon;
grant execute on function public.transfer_league(uuid, uuid) to authenticated;

-- ─────────────────────────────── Кто отправил прогноз (без выбора) ───────────────────────────────
create function public.league_submissions(league uuid, ev bigint)
returns table (user_id uuid, nickname text, avatar_color text, submitted boolean)
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
  select m.user_id, p.nickname, p.avatar_color,
         exists (select 1 from public.predictions pr where pr.user_id = m.user_id and pr.event_id = ev)
  from public.league_members m
  join public.profiles p on p.id = m.user_id
  where m.league_id = league
  order by m.joined_at;
end $$;
revoke execute on function public.league_submissions(uuid, bigint) from public, anon;
grant execute on function public.league_submissions(uuid, bigint) to authenticated;

-- ─────────────────────────────── Таблица лиги ───────────────────────────────
-- Очки считаются по настройкам лиги: этапы с start_event, только этапы, на которые игрок успел
-- (дедлайн после вступления), бонусы — если включены в bonus_config (по умолчанию включены).
-- Тай-брейк: больше точных попаданий → больше выигранных этапов → лучший последний этап.
create function public.league_table(league uuid)
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
  scored as (   -- этапы лиги, по которым уже есть очки
    select e.id, e.round
    from public.events e, l
    where e.season_id = l.season_id and e.round >= l.start_round
      and exists (select 1 from public.score_lines s where s.event_id = e.id)
  ),
  per_event as (
    select m.user_id, ev.id as event_id, ev.round,
           coalesce(sum(s.points), 0)::integer as pts,
           count(*) filter (where s.kind in ('race_exact', 'qualy_exact'))::integer as exact,
           coalesce(bool_or(s.provisional), false) as prov
    from public.league_members m
    cross join scored ev
    cross join l
    left join public.score_lines s
      on s.user_id = m.user_id and s.event_id = ev.id
     and (s.block <> 'bonus' or coalesce((l.bonus_config ->> s.kind)::boolean, true))
    where m.league_id = league
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
revoke execute on function public.league_table(uuid) from public, anon;
grant execute on function public.league_table(uuid) to authenticated;
