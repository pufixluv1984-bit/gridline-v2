-- pgTAP: фэнтези-ядро (миграция 0015), обязательные примеры из docs/FANTASY-FORMULA.md §8.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('f2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}'),
  ('f2000000-0000-0000-0000-00000000000c', 'c@test.local', '{"nickname":"KOLYA"}');
insert into leagues (id, name, season_id, owner_id, mode) values
  ('f3000000-0000-0000-0000-000000000001', 'Фэнтези', (select id from seasons where is_current), 'f2000000-0000-0000-0000-00000000000a', 'fantasy');
insert into league_members (league_id, user_id) values ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-00000000000b');

insert into season_entries (season_id, driver_id, team_id, number)
select (select id from seasons where is_current), d, t, n from (values
  ('norris', 'mclaren', 4), ('piastri', 'mclaren', 81), ('leclerc', 'ferrari', 16), ('hamilton', 'ferrari', 44),
  ('russell', 'mercedes', 63), ('antonelli', 'mercedes', 12), ('max_verstappen', 'red_bull', 1), ('hadjar', 'red_bull', 6),
  ('albon', 'williams', 23), ('sainz', 'williams', 55)) v(d, t, n);
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where is_current), 24, 'f-30', 'Этап 24', 'Трасса', 'Страна'),
  ((select id from seasons where is_current), 25, 'f-31', 'Этап 25', 'Трасса', 'Страна');
create function pg_temp.ev(s text) returns bigint language sql as $$ select id from events where slug = s $$;
insert into sessions (event_id, kind, starts_at)
select pg_temp.ev(x.slug), x.kind::session_kind, now() + x.shift
from (values ('f-30', 'fp1', interval '1 day'), ('f-30', 'qualy', interval '2 days'), ('f-30', 'race', interval '3 days'),
             ('f-31', 'fp1', interval '8 days'), ('f-31', 'qualy', interval '9 days'), ('f-31', 'race', interval '10 days')) x(slug, kind, shift);
insert into fantasy_seasons (season_id, start_event_id) values ((select id from seasons where is_current), pg_temp.ev('f-30'));
insert into fantasy_prices (event_id, kind, asset_id, price)
select e, k, a, p from (select pg_temp.ev('f-30') e union all select pg_temp.ev('f-31')) ev
cross join (values
  ('driver', 'norris', 25.0), ('driver', 'piastri', 22.0), ('driver', 'max_verstappen', 24.0), ('driver', 'leclerc', 18.0),
  ('driver', 'hamilton', 15.0), ('driver', 'russell', 14.0), ('driver', 'antonelli', 10.0), ('driver', 'sainz', 8.0),
  ('driver', 'albon', 7.0), ('driver', 'hadjar', 6.0),
  ('team', 'mclaren', 25.0), ('team', 'ferrari', 20.0), ('team', 'mercedes', 18.0), ('team', 'red_bull', 15.0), ('team', 'williams', 8.0)) v(k, a, p);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- ── Сборка составов ─────────────────────────────────────────────────────
select pg_temp.login('f2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['norris','piastri','max_verstappen','leclerc','hamilton'], array['mclaren','ferrari']) $$,
  '23514', 'Состав дороже бюджета', 'дороже $100M — отказ');
select throws_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['norris','piastri','leclerc','hamilton'], array['mclaren','ferrari']) $$,
  '23514', 'Нужно 5 разных пилотов', 'не 5 пилотов — отказ');
select throws_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['hamilton','russell','antonelli','hadjar','albon'], array['mclaren','ferrari'], null, 'wildcard') $$,
  '23514', 'Этот чип нельзя играть на первом этапе', 'Wildcard на первом этапе — отказ');
select is((fantasy_save_squad(pg_temp.ev('f-30'), array['hamilton','russell','antonelli','hadjar','albon'], array['mercedes','ferrari'], 'russell') ->> 'cost')::numeric,
  90.0, 'состав сохранён, стоимость считает база');
select throws_ok($$ insert into fantasy_squads (user_id, event_id, drivers, teams, cost, free_before)
  values (auth.uid(), pg_temp.ev('f-31'), array['norris','piastri','max_verstappen','leclerc','hamilton'], array['mclaren','ferrari'], 1, 99) $$,
  '42501', null, 'напрямую в таблицу не пишется — только через проверки RPC');
reset role;

select pg_temp.login('f2000000-0000-0000-0000-00000000000b');
select lives_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['antonelli','russell','sainz','hadjar','albon'], array['mercedes','williams'], 'antonelli', 'no_negative') $$,
  'No Negative можно с первого этапа');
select is((select count(*)::int from fantasy_squads where user_id = 'f2000000-0000-0000-0000-00000000000a'), 0,
  'чужой состав до блокировки не виден даже соседу по лиге');
reset role;

select pg_temp.login('f2000000-0000-0000-0000-00000000000c');
select lives_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['norris','sainz','antonelli','hadjar','albon'], array['williams','red_bull'], 'norris') $$,
  'третий игрок собрал состав');
reset role;

-- ── Этап 30 прошёл ──────────────────────────────────────────────────────
update sessions set starts_at = starts_at - interval '4 days' where event_id = pg_temp.ev('f-30');
select pg_temp.login('f2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select fantasy_save_squad(pg_temp.ev('f-30'), array['hamilton','russell','antonelli','hadjar','sainz'], array['mercedes','ferrari']) $$,
  '42501', 'Составы на этот этап уже закрыты', 'после блокировки состав не меняется');
reset role;
select pg_temp.login('f2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from fantasy_squads where user_id = 'f2000000-0000-0000-0000-00000000000a'), 1,
  'после блокировки состав соседа по лиге виден');
reset role;

insert into results (event_id, kind, driver_id, team_id, position, position_text, grid, laps, status) values
  (pg_temp.ev('f-30'), 'qualy', 'antonelli', 'mercedes', 1, '1', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'norris', 'mclaren', 2, '2', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'piastri', 'mclaren', 3, '3', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'leclerc', 'ferrari', 4, '4', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'max_verstappen', 'red_bull', 5, '5', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'hamilton', 'ferrari', 6, '6', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'sainz', 'williams', 7, '7', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'russell', 'mercedes', 8, '8', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'albon', 'williams', 9, '9', null, null, null),
  (pg_temp.ev('f-30'), 'qualy', 'hadjar', 'red_bull', 10, '10', null, null, null),
  (pg_temp.ev('f-30'), 'race', 'norris', 'mclaren', 1, '1', 2, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'piastri', 'mclaren', 2, '2', 3, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'leclerc', 'ferrari', 3, '3', 4, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'russell', 'mercedes', 4, '4', 8, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'max_verstappen', 'red_bull', 5, '5', 5, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'hamilton', 'ferrari', 6, '6', 6, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'sainz', 'williams', 7, '7', 7, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'albon', 'williams', 8, '8', 9, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'hadjar', 'red_bull', 9, '9', 10, 57, 'Finished'),
  (pg_temp.ev('f-30'), 'race', 'antonelli', 'mercedes', 10, 'R', 1, 12, 'Retired');
select recompute_event_scores(pg_temp.ev('f-30'));

create function pg_temp.pts(a text) returns numeric language sql as $$
  select coalesce(sum(points), 0) from fantasy_points where event_id = pg_temp.ev('f-30') and asset_id = a $$;
select is(pg_temp.pts('russell'), 19.0, '§8: старт 8-м, финиш 4-м: квали 3 + гонка 12 + 4 места = 19');
select is(pg_temp.pts('antonelli'), -8.0, '§8: поул и сход: 10 + 0 − 8 (потолок) − 10 = −8');
select is((select coalesce(sum(points), 0) from fantasy_points where event_id = pg_temp.ev('f-30') and kind = 'team' and asset_id = 'mercedes'),
  16.0, '§8: конструктор: 19 − 8 + 5 (оба в Q3) = 16');
select is((select (d ->> 'points')::numeric from fantasy_scores s, jsonb_array_elements(s.details) d
           where s.user_id = 'f2000000-0000-0000-0000-00000000000b' and d ->> 'asset' = 'antonelli'), 10.0,
  '§8: с No Negative поул со сходом даёт 10');
select is((select (d ->> 'mult')::int from fantasy_scores s, jsonb_array_elements(s.details) d
           where s.user_id = 'f2000000-0000-0000-0000-00000000000a' and d ->> 'asset' = 'russell'), 2, 'DRS ×2 у выбранного пилота');
create temp table t_before as select user_id, total from fantasy_scores where event_id = pg_temp.ev('f-30');
select recompute_event_scores(pg_temp.ev('f-30'));
select is((select count(*)::int from fantasy_scores s join t_before b using (user_id) where s.event_id = pg_temp.ev('f-30') and s.total = b.total), 3,
  '§8: повторный пересчёт не меняет итог');

-- ── Этап 31: трансферы и чипы ───────────────────────────────────────────
select pg_temp.login('f2000000-0000-0000-0000-00000000000a');
select is((fantasy_save_squad(pg_temp.ev('f-31'), array['hamilton','russell','antonelli','sainz','leclerc'], array['red_bull','williams'], 'russell') ->> 'penalty')::int,
  20, '§8: 2 пилота и 2 конструктора при 2 бесплатных → лишних 2 → −20');
select is((fantasy_save_squad(pg_temp.ev('f-31'), array['hamilton','russell','antonelli','hadjar','albon'], array['mercedes','ferrari'], 'russell') ->> 'penalty')::int,
  0, '§8: вернуть обратно — трансферов нет, штрафа нет');
reset role;
select pg_temp.login('f2000000-0000-0000-0000-00000000000b');
select throws_ok($$ select fantasy_save_squad(pg_temp.ev('f-31'), array['antonelli','russell','sainz','hadjar','albon'], array['mercedes','williams'], 'antonelli', 'no_negative') $$,
  '23514', 'Этот чип уже сыгран в сезоне', 'чип — один раз за сезон');
reset role;

-- ── Блокировка этапа 31: кто не отправил — копия прошлого ───────────────
update sessions set starts_at = starts_at - interval '9 days' where event_id = pg_temp.ev('f-31');
select is(fantasy_lock_due(), 2, 'к блокировке скопированы составы двух игроков без отправки');
select is((select drs || ' ' || coalesce(chip, '-') || ' ' || auto::text from fantasy_squads
           where user_id = 'f2000000-0000-0000-0000-00000000000c' and event_id = pg_temp.ev('f-31')), 'norris - true',
  'копия: тот же DRS, без чипа');
select is((select chip from fantasy_squads where user_id = 'f2000000-0000-0000-0000-00000000000b' and event_id = pg_temp.ev('f-31')), null,
  'чип с прошлого этапа не копируется');

-- ── Экраны ──────────────────────────────────────────────────────────────
select pg_temp.login('f2000000-0000-0000-0000-00000000000a');
select is((fantasy_squad_screen(pg_temp.ev('f-31')) -> 'squad' ->> 'penalty')::int, 0, 'экран состава: свой состав этапа');
select is(jsonb_array_length(fantasy_squad_screen(pg_temp.ev('f-31')) -> 'market' -> 'drivers'), 10, 'экран состава: рынок пилотов этапа');
select is((fantasy_squad_screen(pg_temp.ev('f-31')) -> 'market' -> 'drivers' -> 0 ->> 'owned')::int, 0,
  'владение в лиге — по закрытому этапу');
select is(jsonb_array_length(fantasy_leaderboard_screen() -> 'table'), 2, 'лидерборд: участники фэнтези-лиги');
select ok((fantasy_results_screen(pg_temp.ev('f-30')) -> 'mine' ->> 'total') is not null, 'результаты этапа: мои очки');
select ok(profile_screen() ? 'fantasy', 'профиль: фэнтези-блок');
reset role;

select * from finish();
rollback;
