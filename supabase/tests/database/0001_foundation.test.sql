-- pgTAP: миграция 0001 (supabase test db). Проверяет RLS и триггеры, а не интерфейс (правило 1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- ── Каждая таблица public под RLS ──────────────────────────────────────
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'RLS включён на всех таблицах public'
);

-- ── Пользователи и профили из триггера ──────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'vova@test.local', '{"nickname":"VOVA"}'),
  ('22222222-2222-2222-2222-222222222222', 'tshy@test.local', '{"nickname":"T-SHY"}'),
  ('33333333-3333-3333-3333-333333333333', 'oauth@test.local', '{"full_name":"<b>Ян</b> 🙂"}'),
  ('44444444-4444-4444-4444-444444444444', 'x@test.local', '{"name":"!"}');

select is((select nickname from profiles where id = '11111111-1111-1111-1111-111111111111'), 'VOVA',
  'ник из формы регистрации');
select is((select nickname from profiles where id = '33333333-3333-3333-3333-333333333333'), 'bЯнb',
  'ник из Google/Discord очищается от лишних символов');
select is((select nickname from profiles where id = '44444444-4444-4444-4444-444444444444'), 'Игрок-4444',
  'пустой ник заменяется на «Игрок-xxxx»');

insert into seasons (year, is_current) values (2026, true) on conflict (year) do update set is_current = true;
insert into events (season_id, round, slug, name, circuit, country)
  values ((select id from seasons where year = 2026), 22, 'las-vegas', 'Гран-при Лас-Вегаса', 'Las Vegas Strip', 'США');

-- Хелпер: войти как пользователь (auth.uid() читает request.jwt.claims).
create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- ── Аноним ──────────────────────────────────────────────────────────────
set local role anon;
select is((select count(*)::int from profiles), 0, 'аноним не видит профили');
select is((select count(*)::int from events), 1, 'аноним видит расписание');
select ok(server_now() is not null, 'server_now() доступна анониму');
select throws_ok($$ insert into events (season_id, round, slug, name, circuit, country) values (1, 1, 'x-x', 'xx', 'xx', 'xx') $$,
  '42501', null, 'аноним не пишет расписание');
reset role;

-- ── VOVA создаёт лигу ───────────────────────────────────────────────────
select pg_temp.login('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into leagues (id, name, season_id, owner_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026),
          '11111111-1111-1111-1111-111111111111') $$, 'вошедший создаёт лигу');
select is((select role::text from league_members where league_id = 'aaaaaaaa-0000-0000-0000-000000000001'
           and user_id = '11111111-1111-1111-1111-111111111111'), 'owner', 'создатель стал владельцем');
select matches((select invite_code from leagues where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '^[A-HJKMNP-Z2-9]{6}$', 'инвайт-код из 6 символов без похожих');
select throws_ok($$ insert into leagues (name, season_id, owner_id)
  values ('Чужая', 1, '22222222-2222-2222-2222-222222222222') $$, '42501', null, 'нельзя создать лигу от чужого имени');
select throws_ok($$ insert into events (season_id, round, slug, name, circuit, country) values (1, 2, 'y-y', 'yy', 'yy', 'yy') $$,
  '42501', null, 'игрок не пишет расписание');
select throws_ok($$ update profiles set nickname = '<script>' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'ник проверяет база');
select throws_ok($$ update leagues set owner_id = '22222222-2222-2222-2222-222222222222'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, '42501', null, 'владельца лиги не сменить обычным update');
reset role;

-- ── T-SHY ещё не в лиге ─────────────────────────────────────────────────
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from leagues), 0, 'чужую лигу не видно');
select is((select count(*)::int from league_members), 0, 'чужой состав не видно');
select is((select count(*)::int from profiles), 1, 'виден только свой профиль');
select throws_ok($$ insert into league_members (league_id, user_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'вступить в лигу напрямую нельзя');
update profiles set nickname = 'HACK' where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is((select nickname from profiles where id = '11111111-1111-1111-1111-111111111111'), 'VOVA',
  'чужой профиль не правится');

-- ── После вступления (в фазе 1 это делает join_league) ─────────────────
insert into league_members (league_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
select pg_temp.login('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from leagues), 1, 'участник видит лигу');
select is((select count(*)::int from profiles), 2, 'участник видит профили соседей по лиге');
select is((select count(*)::int from profiles where id = '33333333-3333-3333-3333-333333333333'), 0,
  'профили вне общих лиг скрыты');
update leagues set name = 'Захват' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select is((select name from leagues where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Друзья',
  'участник не правит настройки лиги');

select * from finish();
rollback;
