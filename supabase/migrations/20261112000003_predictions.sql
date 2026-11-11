-- 0003 · Игра прогнозов (фаза 1): команды, пилоты, заявка сезона, прогнозы, результаты, очки,
-- ручной ввод результата (только админ сайта — решение владельца 11.11.2026).
-- Правила начисления — docs/PRODUCT.md §2 (главнее макета Predict). Бонусы фазы 1: только быстрый круг.

-- ─────────────────────────────── Админы сайта ───────────────────────────────
create table public.site_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;

create function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.site_admins a where a.user_id = auth.uid()) $$;
revoke execute on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ─────────────────────────────── Команды и пилоты ───────────────────────────────
create table public.teams (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),         -- constructorId из Jolpica
  code text not null check (code ~ '^[A-Z]{2,3}$'),              -- код из макетов: MCL, RBR, RB…
  name text not null check (char_length(name) between 2 and 40), -- по-русски
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$')
);

create table public.drivers (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),         -- driverId из Jolpica
  code text not null check (code ~ '^[A-Z]{3}$'),
  given_name text not null,
  family_name text not null,
  name_ru text                                                   -- если нет — показываем латиницу
);

-- Заявка сезона: кто за кого выступает сейчас. active = был в заявке последнего этапа.
create table public.season_entries (
  season_id smallint not null references public.seasons (id) on delete cascade,
  driver_id text not null references public.drivers (id) on delete cascade,
  team_id text not null references public.teams (id),
  number smallint check (number between 0 and 99),
  active boolean not null default true,
  primary key (season_id, driver_id)
);

alter table public.teams enable row level security;
alter table public.drivers enable row level security;
alter table public.season_entries enable row level security;
create policy teams_read on public.teams for select to anon, authenticated using (true);
create policy drivers_read on public.drivers for select to anon, authenticated using (true);
create policy season_entries_read on public.season_entries for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.teams, public.drivers, public.season_entries from anon, authenticated;

-- ─────────────────────────────── Дедлайн этапа ───────────────────────────────
-- Приём прогнозов закрывается со стартом квалификации (PRODUCT.md §7). Нет сессии — приём закрыт (null).
create function public.event_deadline(ev bigint)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(s.deadline_at, s.starts_at)
  from public.sessions s
  where s.event_id = ev and s.kind = 'qualy'
$$;
grant execute on function public.event_deadline(bigint) to anon, authenticated;

-- ─────────────────────────────── Прогнозы ───────────────────────────────
-- Один прогноз на (игрок, этап), общий для всех его лиг. Пилоты — driverId из Jolpica.
create table public.predictions (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  qualy text[] not null check (cardinality(qualy) = 3),          -- поул, P2, P3
  race text[] not null check (cardinality(race) = 10),           -- топ-10 финиша
  fastest_lap text,                                              -- бонус, можно пропустить
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index predictions_event on public.predictions (event_id);

-- Второй рубеж после RLS: дедлайн, состав пилотов, повторы, неизменяемые поля.
create function public.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dl timestamptz := public.event_deadline(new.event_id);
  season smallint;
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
  select e.season_id into season from public.events e where e.id = new.event_id;
  select x into bad
  from unnest(new.qualy || new.race || coalesce(array[new.fastest_lap], '{}')) x
  where x is not null
    and not exists (select 1 from public.season_entries se where se.season_id = season and se.driver_id = x)
  limit 1;
  if bad is not null then
    raise exception 'Пилота % нет в заявке сезона', bad using errcode = '23503', hint = 'unknown_driver';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.submitted_at := now();
  end if;
  return new;
end $$;

create trigger predictions_guard before insert or update on public.predictions
  for each row execute function public.predictions_guard();

alter table public.predictions enable row level security;
-- Свой прогноз — всегда; чужой — только после дедлайна и только при общей лиге (правило 6).
create policy predictions_select on public.predictions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (now() >= public.event_deadline(event_id) and public.shares_league(user_id))
  );
create policy predictions_insert on public.predictions for insert to authenticated
  with check (user_id = (select auth.uid()) and now() < public.event_deadline(event_id));
create policy predictions_update on public.predictions for update to authenticated
  using (user_id = (select auth.uid()) and now() < public.event_deadline(event_id))
  with check (user_id = (select auth.uid()) and now() < public.event_deadline(event_id));
create policy predictions_delete on public.predictions for delete to authenticated
  using (user_id = (select auth.uid()) and now() < public.event_deadline(event_id));
revoke all on public.predictions from anon;
revoke insert, update on public.predictions from authenticated;
grant insert (event_id, qualy, race, fastest_lap) on public.predictions to authenticated;
-- event_id нужен для upsert из браузера (ON CONFLICT … SET event_id = тот же); менять его запрещает триггер.
grant update (event_id, qualy, race, fastest_lap) on public.predictions to authenticated;

-- ─────────────────────────────── Результаты ───────────────────────────────
create table public.results (
  event_id bigint not null references public.events (id) on delete cascade,
  kind public.session_kind not null check (kind in ('qualy', 'race', 'sprint', 'sprint_qualy')),
  driver_id text not null references public.drivers (id),
  team_id text references public.teams (id),
  position smallint not null check (position between 1 and 40),
  position_text text,                 -- 1…, R (сход), D (дисквалификация), W (не стартовал)
  grid smallint,
  laps smallint,
  status text,
  fastest_lap_rank smallint,
  source text not null default 'api' check (source in ('api', 'manual')),
  is_final boolean not null default false,   -- false первые 48 часов: возможны штрафы (PRODUCT.md §5)
  updated_at timestamptz not null default now(),
  primary key (event_id, kind, driver_id),
  constraint results_position_unique unique (event_id, kind, position) deferrable initially deferred
);
alter table public.results enable row level security;
create policy results_read on public.results for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.results from anon, authenticated;

-- ─────────────────────────────── Строки очков ───────────────────────────────
-- Каждое начисление — строка с причиной (из них рисуется «разбор этапа»).
create table public.score_lines (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint not null references public.events (id) on delete cascade,
  block text not null check (block in ('qualy', 'race', 'bonus')),
  kind text not null check (kind in (
    'qualy_exact', 'race_exact', 'race_off1', 'race_off2', 'race_in_top10', 'race_podium', 'fastest_lap'
  )),
  slot smallint not null default 0,   -- место в прогнозе (1…10), 0 — для строк без места
  driver_id text,
  points smallint not null,
  provisional boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, kind, slot)
);
create index score_lines_event_user on public.score_lines (event_id, user_id);
alter table public.score_lines enable row level security;
-- Строки появляются только после результатов (то есть после дедлайна): свои и соседей по лигам.
create policy score_lines_select on public.score_lines for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_league(user_id));
revoke all on public.score_lines from anon;
revoke insert, update, delete, truncate on public.score_lines from authenticated;

-- Подсчёт очков этапа. Идемпотентно: строки этапа пересоздаются в одной транзакции (правило 3).
-- Очки за гонку даются, только если пилот финишировал в топ-10 (толкование PRODUCT.md §2).
create function public.recompute_event_scores(ev bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  final boolean;
begin
  select coalesce(bool_and(r.is_final), false) into final from public.results r where r.event_id = ev;
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

  select count(*) into n from public.score_lines where event_id = ev;
  return n;
end $$;
revoke execute on function public.recompute_event_scores(bigint) from public, anon, authenticated;

-- Ручной ввод результата при сбое источника — только админ сайта. Тот же подсчёт очков.
create function public.admin_set_result(ev bigint, session public.session_kind, driver_ids text[], fastest_lap text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Только для админа сайта' using errcode = '42501';
  end if;
  if session not in ('qualy', 'race') then
    raise exception 'Вручную вводятся только квалификация и гонка' using errcode = '22023';
  end if;
  if cardinality(driver_ids) < 3 or (select count(distinct x) from unnest(driver_ids) x) <> cardinality(driver_ids) then
    raise exception 'Нужен список пилотов без повторов' using errcode = '22023';
  end if;
  delete from public.results where event_id = ev and kind = session;
  insert into public.results (event_id, kind, driver_id, team_id, position, position_text, fastest_lap_rank, source, is_final)
  select ev, session, d.driver, se.team_id, d.pos, d.pos::text,
         case when session = 'race' and d.driver = fastest_lap then 1 end, 'manual', true
  from unnest(driver_ids) with ordinality as d(driver, pos)
  join public.events e on e.id = ev
  left join public.season_entries se on se.season_id = e.season_id and se.driver_id = d.driver;
  return public.recompute_event_scores(ev);
end $$;
revoke execute on function public.admin_set_result(bigint, public.session_kind, text[], text) from public, anon;
grant execute on function public.admin_set_result(bigint, public.session_kind, text[], text) to authenticated;

-- ─────────────────────────────── Справочник 2026 ───────────────────────────────
-- Цвета — из drivers.json набора владельца; имена по-русски — как в макетах.
insert into public.seasons (year, is_current) values (2026, true)
  on conflict (year) do update set is_current = true;

insert into public.teams (id, code, name, color) values
  ('mclaren', 'MCL', 'Макларен', '#F47600'),
  ('red_bull', 'RBR', 'Ред Булл', '#4781D7'),
  ('mercedes', 'MER', 'Мерседес', '#00D7B6'),
  ('ferrari', 'FER', 'Феррари', '#ED1131'),
  ('williams', 'WIL', 'Уильямс', '#1868DB'),
  ('aston_martin', 'AST', 'Астон Мартин', '#229971'),
  ('haas', 'HAS', 'Хаас', '#9C9FA2'),
  ('rb', 'RB', 'Рейсинг Буллз', '#6C98FF'),
  ('alpine', 'ALP', 'Альпин', '#00A1E8'),
  ('audi', 'AUD', 'Ауди', '#F50537'),
  ('cadillac', 'CAD', 'Кадиллак', '#909090')
on conflict (id) do update set code = excluded.code, name = excluded.name, color = excluded.color;

insert into public.drivers (id, code, given_name, family_name, name_ru) values
  ('norris', 'NOR', 'Lando', 'Norris', 'Ландо Норрис'),
  ('max_verstappen', 'VER', 'Max', 'Verstappen', 'Макс Ферстаппен'),
  ('hadjar', 'HAD', 'Isack', 'Hadjar', 'Исак Аджар'),
  ('russell', 'RUS', 'George', 'Russell', 'Джордж Расселл'),
  ('antonelli', 'ANT', 'Andrea Kimi', 'Antonelli', 'Кими Антонелли'),
  ('piastri', 'PIA', 'Oscar', 'Piastri', 'Оскар Пиастри'),
  ('lawson', 'LAW', 'Liam', 'Lawson', 'Лиам Лоусон'),
  ('leclerc', 'LEC', 'Charles', 'Leclerc', 'Шарль Леклер'),
  ('hamilton', 'HAM', 'Lewis', 'Hamilton', 'Льюис Хэмилтон'),
  ('hulkenberg', 'HUL', 'Nico', 'Hülkenberg', 'Нико Хюлькенберг'),
  ('arvid_lindblad', 'LIN', 'Arvid', 'Lindblad', 'Арвид Линдблад'),
  ('alonso', 'ALO', 'Fernando', 'Alonso', 'Фернандо Алонсо'),
  ('colapinto', 'COL', 'Franco', 'Colapinto', 'Франко Колапинто'),
  ('gasly', 'GAS', 'Pierre', 'Gasly', 'Пьер Гасли'),
  ('albon', 'ALB', 'Alexander', 'Albon', 'Александр Албон'),
  ('bortoleto', 'BOR', 'Gabriel', 'Bortoleto', 'Габриэл Бортолето'),
  ('bearman', 'BEA', 'Oliver', 'Bearman', 'Оливер Берман'),
  ('perez', 'PER', 'Sergio', 'Pérez', 'Серхио Перес'),
  ('sainz', 'SAI', 'Carlos', 'Sainz', 'Карлос Сайнс'),
  ('stroll', 'STR', 'Lance', 'Stroll', 'Лэнс Стролл'),
  ('bottas', 'BOT', 'Valtteri', 'Bottas', 'Валттери Боттас'),
  ('ocon', 'OCO', 'Esteban', 'Ocon', 'Эстебан Окон'),
  ('rafael_camara', 'CAM', 'Rafael', 'Camara', 'Рафаэл Камара')
on conflict (id) do update set name_ru = excluded.name_ru;
