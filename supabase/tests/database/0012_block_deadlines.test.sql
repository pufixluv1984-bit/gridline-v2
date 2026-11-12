-- pgTAP: дедлайны прогноза по блокам и блок спринта (миграция 0017).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('e2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}');
insert into leagues (id, name, season_id, owner_id) values
  ('e3000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where is_current), 'e2000000-0000-0000-0000-00000000000a');
insert into league_members (league_id, user_id) values ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-00000000000b');
update league_members set joined_at = now() - interval '30 days';
insert into season_entries (season_id, driver_id, team_id, number)
select (select id from seasons where is_current), d.id, 'mclaren', 1 from drivers d;

-- Спринт-этап по блокам и старый этап (всё до квалификации).
insert into events (season_id, round, slug, name, circuit, country, is_sprint, split_deadlines) values
  ((select id from seasons where is_current), 28, 'b-28', 'Этап 28', 'Трасса', 'Страна', true, true),
  ((select id from seasons where is_current), 29, 'b-29', 'Этап 29', 'Трасса', 'Страна', false, false);
create function pg_temp.ev(s text) returns bigint language sql as $$ select id from events where slug = s $$;
insert into sessions (event_id, kind, starts_at) values
  (pg_temp.ev('b-28'), 'sprint_qualy', now() - interval '1 day'),
  (pg_temp.ev('b-28'), 'qualy', now() - interval '1 hour'),
  (pg_temp.ev('b-28'), 'sprint', now() + interval '2 hours'),
  (pg_temp.ev('b-28'), 'race', now() + interval '1 day'),
  (pg_temp.ev('b-29'), 'qualy', now() + interval '1 day'),
  (pg_temp.ev('b-29'), 'race', now() + interval '2 days');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select is(block_deadline(pg_temp.ev('b-28'), 'race'), (select starts_at from sessions where event_id = pg_temp.ev('b-28') and kind = 'race'),
  'по блокам: гонка закрывается стартом гонки');
select is(block_deadline(pg_temp.ev('b-29'), 'race'), event_deadline(pg_temp.ev('b-29')),
  'по-старому: гонка закрывается вместе с квалификацией');
select ok((event_json(pg_temp.ev('b-28')) -> 'deadlines' ->> 'sprint') is not null, 'в event_json есть дедлайны блоков');

select pg_temp.login('e2000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into predictions (event_id, qualy) values (pg_temp.ev('b-28'), array['norris','piastri','russell']) $$,
  '42501', 'Квалификация уже началась — этот блок закрыт', 'квалификация после её старта не принимается');
select lives_ok($$ insert into predictions (event_id, sprint, race, fastest_lap) values (pg_temp.ev('b-28'),
  array['norris','piastri','russell'],
  array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'], 'norris') $$,
  'после квалификации — прогноз на спринт и гонку без квалификации');
select lives_ok($$ update predictions set race = array['piastri','norris','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso']
  where event_id = pg_temp.ev('b-28') $$, 'топ-10 правится до старта гонки');
select throws_ok($$ update predictions set boost_block = 'qualy' where event_id = pg_temp.ev('b-28') $$,
  '42501', null, 'бустер на закрытый блок — отказ');
select lives_ok($$ update predictions set boost_block = 'race' where event_id = pg_temp.ev('b-28') $$, 'бустер на открытый блок');
select throws_ok($$ insert into predictions (event_id, race) values (pg_temp.ev('b-29'),
  array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso']) $$,
  '23514', 'Заполни все места', 'по-старому квалификация и топ-10 обязательны');
select throws_ok($$ insert into predictions (event_id, qualy, race, sprint) values (pg_temp.ev('b-29'), array['norris','piastri','russell'],
  array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'], array['norris','piastri','russell']) $$,
  '23514', 'На этом этапе нет спринта', 'спринт только на спринт-этапе');
reset role;

select pg_temp.login('e2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from predictions where event_id = pg_temp.ev('b-28')), 0,
  'чужой прогноз не виден, пока открыт хоть один блок');
reset role;

-- Спринт прошёл: блок закрыт, гонка ещё открыта.
update sessions set starts_at = now() - interval '10 minutes' where event_id = pg_temp.ev('b-28') and kind = 'sprint';
select pg_temp.login('e2000000-0000-0000-0000-00000000000a');
select throws_ok($$ update predictions set sprint = array['piastri','norris','russell'] where event_id = pg_temp.ev('b-28') $$,
  '42501', 'Спринт уже начался — этот блок закрыт', 'спринт после старта не меняется');
select lives_ok($$ update predictions set boost_block = 'bonus' where event_id = pg_temp.ev('b-28') $$,
  'бустер переносится между открытыми блоками (гонка и бонусы ещё открыты)');
reset role;

insert into results (event_id, kind, driver_id, team_id, position, position_text) values
  (pg_temp.ev('b-28'), 'sprint', 'norris', 'mclaren', 1, '1'),
  (pg_temp.ev('b-28'), 'sprint', 'piastri', 'mclaren', 2, '2'),
  (pg_temp.ev('b-28'), 'sprint', 'russell', 'mercedes', 3, '3');
select recompute_event_scores(pg_temp.ev('b-28'));
select is((select sum(points)::int from score_lines where event_id = pg_temp.ev('b-28') and block = 'sprint'), 14,
  'спринт: топ-3 точно = 6 + 4 + 4');
select is((select max(multiplier)::int from score_lines where event_id = pg_temp.ev('b-28') and block = 'sprint'), 1,
  'бустер на спринт не действует');

-- Гонка началась: весь прогноз закрыт, чужой виден.
update sessions set starts_at = now() - interval '5 minutes' where event_id = pg_temp.ev('b-28') and kind = 'race';
select pg_temp.login('e2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from predictions where event_id = pg_temp.ev('b-28')), 1,
  'после старта гонки прогноз соседа по лиге виден');
reset role;

select * from finish();
rollback;
