-- pgTAP: переход на новый сезон и перенос лиги (миграция 0018).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('a2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}');
insert into season_entries (season_id, driver_id, team_id, number) values
  ((select id from seasons where year = 2026), 'norris', 'mclaren', 4),
  ((select id from seasons where year = 2026), 'piastri', 'mclaren', 81);
insert into championship (season_id, kind, position, driver_id, team_id, points) values
  ((select id from seasons where year = 2026), 'drivers', 1, 'norris', null, 400),
  ((select id from seasons where year = 2026), 'drivers', 2, 'piastri', null, 200),
  ((select id from seasons where year = 2026), 'teams', 1, null, 'mclaren', 600);
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2026), 24, 'r-24', 'Финал 2026', 'Трасса', 'Страна');
insert into sessions (event_id, kind, starts_at) values
  ((select id from events where slug = 'r-24'), 'qualy', now() - interval '6 days'),
  ((select id from events where slug = 'r-24'), 'race', now() - interval '5 days');
insert into leagues (id, name, season_id, owner_id, mode) values
  ('a3000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026), 'a2000000-0000-0000-0000-00000000000a', 'both');
insert into league_members (league_id, user_id) values ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000b');

select ok(sync_season_done(), 'все этапы 2026 прошли — сезон закончен');
select is(sync_season_rollover(), null::smallint, 'календаря 2027 ещё нет — остаёмся в 2026');

insert into seasons (year) values (2027);
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2027), 1, 'r-27-1', 'Этап 1', 'Трасса', 'Страна');
insert into sessions (event_id, kind, starts_at) values
  ((select id from events where slug = 'r-27-1'), 'fp1', now() + interval '60 days'),
  ((select id from events where slug = 'r-27-1'), 'qualy', now() + interval '61 days'),
  ((select id from events where slug = 'r-27-1'), 'race', now() + interval '62 days');

select is(sync_season_rollover(), 2027::smallint, 'календарь 2027 есть — переход');
select is((select year from seasons where is_current), 2027::smallint, '2027 — текущий сезон');
select is((select count(*)::int from season_entries where season_id = (select id from seasons where year = 2027)), 2,
  'заявка 2027 до первой гонки — копия 2026');
select is((select start_event_id from fantasy_seasons where season_id = (select id from seasons where year = 2027)),
  (select id from events where slug = 'r-27-1'), 'фэнтези 2027 — с первого этапа');
select ok((select price from fantasy_prices where event_id = (select id from events where slug = 'r-27-1') and asset_id = 'norris')
          > (select price from fantasy_prices where event_id = (select id from events where slug = 'r-27-1') and asset_id = 'piastri'),
  'стартовые цены 2027 — по итогам чемпионата 2026');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
select pg_temp.login('a2000000-0000-0000-0000-00000000000b');
select throws_ok($$ select league_carry_over('a3000000-0000-0000-0000-000000000001') $$, '42501', null, 'переносит только хозяин');
select ok((league_screen('a3000000-0000-0000-0000-000000000001') ->> 'archive')::boolean, 'лига 2026 — в архиве');
reset role;
select pg_temp.login('a2000000-0000-0000-0000-00000000000a');
create temp table t_new as select league_carry_over('a3000000-0000-0000-0000-000000000001') as id;
select is((select count(*)::int from league_members where league_id = (select id from t_new)), 2, 'в новой лиге те же игроки');
select is(league_carry_over('a3000000-0000-0000-0000-000000000001'), (select id from t_new), 'повторный перенос возвращает ту же лигу');
select is((select mode from leagues where id = (select id from t_new)), 'both', 'режим лиги сохранён');
reset role;

select * from finish();
rollback;
