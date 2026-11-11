-- pgTAP: удаление своего аккаунта (миграция 0002).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaa0000-0000-0000-0000-000000000001', 'solo@test.local', '{"nickname":"Solo"}'),
  ('aaaa0000-0000-0000-0000-000000000002', 'boss@test.local', '{"nickname":"Boss"}'),
  ('aaaa0000-0000-0000-0000-000000000003', 'mate@test.local', '{"nickname":"Mate"}');
insert into seasons (year, is_current) values (2026, true) on conflict (year) do update set is_current = true;

-- Solo — владелец лиги без других участников; Boss — владелец лиги, где есть Mate.
insert into leagues (id, name, season_id, owner_id) values
  ('bbbb0000-0000-0000-0000-000000000001', 'Одиночка', (select id from seasons where year = 2026), 'aaaa0000-0000-0000-0000-000000000001'),
  ('bbbb0000-0000-0000-0000-000000000002', 'Компания', (select id from seasons where year = 2026), 'aaaa0000-0000-0000-0000-000000000002');
insert into league_members (league_id, user_id) values
  ('bbbb0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000003');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Аноним не может.
set local role anon;
select throws_ok($$ select delete_my_account() $$, '42501', null, 'аноним не вызывает delete_my_account');
reset role;

-- Владелец лиги с участниками — отказ, ничего не удалено.
select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
select throws_ok($$ select delete_my_account() $$, 'P0001', null, 'владелец лиги с участниками сначала передаёт лигу');
reset role;
select is((select count(*)::int from auth.users where id = 'aaaa0000-0000-0000-0000-000000000002'), 1,
  'после отказа аккаунт на месте');

-- Solo удаляет себя: уходит аккаунт, профиль и его пустая лига.
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');
select lives_ok($$ select delete_my_account() $$, 'игрок удаляет свой аккаунт');
reset role;
select is((select count(*)::int from auth.users where id = 'aaaa0000-0000-0000-0000-000000000001'), 0, 'auth.users удалён');
select is((select count(*)::int from profiles where id = 'aaaa0000-0000-0000-0000-000000000001'), 0, 'профиль удалён');
select is((select count(*)::int from leagues where id = 'bbbb0000-0000-0000-0000-000000000001'), 0, 'пустая лига удалена');

-- Чужое не тронуто; участник (не владелец) может удалить себя, лига остаётся.
select is((select count(*)::int from profiles where id in ('aaaa0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000003')), 2,
  'чужие профили на месте');
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');
select delete_my_account();
reset role;
select is((select count(*)::int from league_members where league_id = 'bbbb0000-0000-0000-0000-000000000002'), 1,
  'участник ушёл, лига и её владелец остались');

select * from finish();
rollback;
