-- 0001 · Основа: профили, лиги и участники, сезоны, этапы, сессии.
-- Правила (CLAUDE.md, docs/ARCHITECTURE.md):
--   * RLS включён на каждой таблице public; без политики таблица закрыта;
--   * клиент только читает расписание (seasons/events/sessions); пишет sync-f1 с service_role;
--   * вступление в лигу — только через RPC join_league (фаза 1), напрямую league_members не пишется;
--   * security definer-функции с пустым search_path и полными именами.

-- ─────────────────────────────── Типы ───────────────────────────────
create type public.league_role as enum ('owner', 'member');
create type public.session_kind as enum ('fp1', 'fp2', 'fp3', 'sprint_qualy', 'sprint', 'qualy', 'race');
create type public.event_status as enum ('scheduled', 'cancelled', 'void');

-- ─────────────────────────────── Время ───────────────────────────────
-- Серверное время для таймеров и дедлайнов (правило 4).
create function public.server_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

-- ─────────────────────────────── Профили ───────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
    constraint profiles_nickname_check
    check (nickname = btrim(nickname) and char_length(nickname) between 2 and 20
           and nickname ~ '^[A-Za-zА-Яа-яЁё0-9 _.-]+$'),
  avatar_color text not null default '#ffd400'
    constraint profiles_avatar_color_check check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  in_global_ranking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Игрок. id = auth.users.id. Ник виден только участникам общих лиг.';

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Ник из формы регистрации или из профиля Google/Discord; всё лишнее вычищается,
-- чтобы проходил check. Если ничего не осталось — «Игрок-xxxx».
create function public.sanitize_nickname(raw text, fallback_seed uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(n) >= 2 then n
    else 'Игрок-' || substr(replace(fallback_seed::text, '-', ''), 1, 4)
  end
  from (
    select btrim(left(btrim(regexp_replace(coalesce(raw, ''), '[^A-Za-zА-Яа-яЁё0-9 _.-]', '', 'g')), 20)) as n
  ) s
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    public.sanitize_nickname(
      coalesce(meta ->> 'nickname', meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name', split_part(new.email, '@', 1)),
      new.id
    )
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────── Сезоны и расписание ───────────────────────────────
create table public.seasons (
  id smallint generated always as identity primary key,
  year smallint not null unique check (year between 2026 and 2100),
  is_current boolean not null default false
);
create unique index seasons_one_current on public.seasons (is_current) where is_current;

create table public.events (
  id bigint generated always as identity primary key,
  season_id smallint not null references public.seasons (id) on delete restrict,
  round smallint not null check (round between 1 and 30),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  circuit text not null check (char_length(circuit) between 2 and 80),
  country text not null check (char_length(country) between 2 and 60),
  is_sprint boolean not null default false,
  status public.event_status not null default 'scheduled',
  unique (season_id, round),
  unique (season_id, slug)
);
comment on table public.events is 'Уик-энд Гран-при. Пишет только sync-f1 (service_role).';

create table public.sessions (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  kind public.session_kind not null,
  starts_at timestamptz not null,
  -- Конец приёма прогнозов, если сессия его задаёт (квалификация — PRODUCT.md §4).
  deadline_at timestamptz,
  unique (event_id, kind)
);
create index sessions_starts_at on public.sessions (starts_at);

-- ─────────────────────────────── Лиги ───────────────────────────────
-- Инвайт-код: 6 символов без похожих (0/O, 1/I/L). Источник случайности — gen_random_uuid().
create function public.gen_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % char_length(alphabet)) + 1, 1);
  end loop;
  return code;
end $$;

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint leagues_name_check
    check (name = btrim(name) and char_length(name) between 2 and 40 and name !~ '[[:cntrl:]<>]'),
  season_id smallint not null references public.seasons (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique default public.gen_invite_code()
    check (invite_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  max_members smallint not null default 30 check (max_members between 2 and 100),
  bonus_config jsonb not null default '{}'::jsonb check (jsonb_typeof(bonus_config) = 'object'),
  created_at timestamptz not null default now()
);
create index leagues_owner on public.leagues (owner_id);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.league_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user on public.league_members (user_id);

-- Проверки членства — security definer, чтобы политики не ссылались друг на друга рекурсивно.
create function public.is_league_member(league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m where m.league_id = league and m.user_id = auth.uid()
  )
$$;

create function public.shares_league(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members a
    join public.league_members b on b.league_id = a.league_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- Создатель лиги сразу становится её владельцем-участником.
create function public.add_league_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.league_members (league_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger leagues_add_owner after insert on public.leagues
  for each row execute function public.add_league_owner();

-- Владелец лиги не меняется через update (передача владения — отдельной RPC, если понадобится).
create function public.leagues_lock_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.season_id is distinct from old.season_id
     or new.invite_code is distinct from old.invite_code then
    raise exception 'owner_id, season_id и invite_code меняются только через RPC' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger leagues_lock before update on public.leagues
  for each row execute function public.leagues_lock_columns();

-- ─────────────────────────────── RLS ───────────────────────────────
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.events enable row level security;
alter table public.sessions enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

-- Профили: свой — всегда; чужой — только при общей лиге. Создаёт профиль только триггер.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_league(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (nickname, avatar_color, in_global_ranking) on public.profiles to authenticated;

-- Расписание общее и публичное: читают все, пишет только service_role (обходит RLS).
create policy seasons_read on public.seasons for select to anon, authenticated using (true);
create policy events_read on public.events for select to anon, authenticated using (true);
create policy sessions_read on public.sessions for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.seasons, public.events, public.sessions from anon, authenticated;

-- Лиги: видят участники; создаёт любой вошедший (владельцем — себя); правит и удаляет владелец.
create policy leagues_select on public.leagues for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_league_member(id));
create policy leagues_insert on public.leagues for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy leagues_update on public.leagues for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy leagues_delete on public.leagues for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.leagues from anon;
revoke update on public.leagues from authenticated;
grant update (name, max_members, bonus_config) on public.leagues to authenticated;

-- Участники: состав лиги видят её участники. Записи — только через RPC (фаза 1).
create policy league_members_select on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
revoke all on public.league_members from anon;
revoke insert, update, delete, truncate on public.league_members from authenticated;

-- ─────────────────────────────── Права на функции ───────────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_league_owner() from public, anon, authenticated;
revoke execute on function public.leagues_lock_columns() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.is_league_member(uuid) from public, anon;
revoke execute on function public.shares_league(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.shares_league(uuid) to authenticated;
grant execute on function public.server_now() to anon, authenticated;
