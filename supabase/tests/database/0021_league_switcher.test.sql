-- pgTAP: список лиг игрока в league_screen для переключателя (миграция 0027).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('a7000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}');
insert into leagues (id, name, season_id, owner_id, mode) values
  ('a8000000-0000-0000-0000-000000000001', 'Первая', (select id from seasons where is_current), 'a7000000-0000-0000-0000-00000000000a', 'predict'),
  ('a8000000-0000-0000-0000-000000000002', 'Вторая', (select id from seasons where is_current), 'a7000000-0000-0000-0000-00000000000a', 'both'),
  ('a8000000-0000-0000-0000-000000000003', 'Чужая', (select id from seasons where is_current), 'a7000000-0000-0000-0000-00000000000b', 'predict');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.login('a7000000-0000-0000-0000-00000000000a');
select is(jsonb_array_length(league_screen('a8000000-0000-0000-0000-000000000001') -> 'my_leagues'), 2,
  'обе свои лиги в списке — новая лига не заменяет старую');
select ok(not (league_screen('a8000000-0000-0000-0000-000000000002') -> 'my_leagues') @> '[{"name":"Чужая"}]',
  'чужой лиги в списке нет');
select ok((league_screen('a8000000-0000-0000-0000-000000000002') -> 'my_leagues') @> '[{"name":"Первая","current":true}]',
  'у лиги есть сезон и признак текущего');
select is(league_screen('a8000000-0000-0000-0000-000000000002') -> 'league' ->> 'name', 'Вторая',
  'остальной экран лиги на месте');
select throws_ok($$ select league_screen('a8000000-0000-0000-0000-000000000003') $$, null, null,
  'чужую лигу не открыть, как и раньше');
reset role;

select * from finish();
rollback;
