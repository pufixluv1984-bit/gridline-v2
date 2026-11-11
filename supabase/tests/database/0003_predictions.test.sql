-- pgTAP: прогнозы, дедлайн, подсчёт очков, ручной ввод (миграция 0003).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

-- ── Подготовка ───────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('c0000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@test.local', '{"nickname":"Чужой"}');

create temp table t_ids as select (select id from seasons where year = 2026) as season;
grant select on t_ids to authenticated;

insert into season_entries (season_id, driver_id, team_id, number)
select (select season from t_ids), d.id, 'mclaren', 1 from drivers d;

insert into events (season_id, round, slug, name, circuit, country)
values ((select season from t_ids), 21, 'las-vegas', 'Гран-при Лас-Вегаса', 'Las Vegas', 'США');
create temp table t_ev as select id from events where slug = 'las-vegas';
grant select on t_ev to authenticated;
insert into sessions (event_id, kind, starts_at) values ((select id from t_ev), 'qualy', now() + interval '1 day');

insert into leagues (id, name, season_id, owner_id)
values ('d0000000-0000-0000-0000-000000000001', 'Друзья', (select season from t_ids), 'c0000000-0000-0000-0000-00000000000a');
insert into league_members (league_id, user_id) values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- ── До дедлайна ──────────────────────────────────────────────────────────
select pg_temp.login('c0000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into predictions (event_id, qualy, race, fastest_lap) values ((select id from t_ev),
  array['norris','max_verstappen','piastri'],
  array['norris','max_verstappen','piastri','russell','leclerc','hamilton','albon','sainz','gasly','alonso'],
  'leclerc') $$, 'игрок отправляет прогноз до дедлайна');
select is((select user_id from predictions where event_id = (select id from t_ev)), 'c0000000-0000-0000-0000-00000000000a'::uuid,
  'владельца прогноза ставит база');
select throws_ok($$ update predictions set race = array['norris','norris','piastri','russell','leclerc','hamilton','albon','sainz','gasly','alonso']
  where event_id = (select id from t_ev) $$, '23514', null, 'один пилот на двух местах — отказ');
select throws_ok($$ update predictions set fastest_lap = 'senna' where event_id = (select id from t_ev) $$,
  '23503', null, 'пилота нет в заявке — отказ');
select throws_ok($$ insert into predictions (user_id, event_id, qualy, race) values ('c0000000-0000-0000-0000-00000000000b', (select id from t_ev),
  array['norris','max_verstappen','piastri'], array['norris','max_verstappen','piastri','russell','leclerc','hamilton','albon','sainz','gasly','alonso']) $$,
  '42501', null, 'прогноз за другого игрока — отказ');
reset role;

select pg_temp.login('c0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from predictions), 0, 'сосед по лиге не видит чужой прогноз до дедлайна');
reset role;
select pg_temp.login('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from predictions), 0, 'чужой игрок не видит прогноз');
reset role;

-- ── После дедлайна ───────────────────────────────────────────────────────
update sessions set starts_at = now() - interval '1 minute' where event_id = (select id from t_ev);

select pg_temp.login('c0000000-0000-0000-0000-00000000000a');
update predictions set fastest_lap = 'norris' where event_id = (select id from t_ev);
reset role;
select is((select fastest_lap from predictions where event_id = (select id from t_ev)), 'leclerc', 'после дедлайна прогноз не меняется');

select pg_temp.login('c0000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into predictions (event_id, qualy, race) values ((select id from t_ev),
  array['norris','max_verstappen','piastri'], array['norris','max_verstappen','piastri','russell','leclerc','hamilton','albon','sainz','gasly','alonso']) $$,
  '42501', null, 'после дедлайна новый прогноз не принимается');
select is((select count(*)::int from predictions), 1, 'после дедлайна сосед по лиге видит прогноз');
reset role;
select pg_temp.login('c0000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from predictions), 0, 'чужой и после дедлайна не видит');
select throws_ok($$ insert into results (event_id, kind, driver_id, position) values ((select id from t_ev), 'race', 'norris', 1) $$,
  '42501', null, 'игрок не пишет результаты');
select throws_ok($$ select recompute_event_scores((select id from t_ev)) $$, '42501', null, 'игрок не вызывает подсчёт');
reset role;

-- ── Подсчёт ──────────────────────────────────────────────────────────────
-- Квалификация: поул угадан (+6), P2/P3 переставлены (0).
insert into results (event_id, kind, driver_id, position) values
  ((select id from t_ev), 'qualy', 'norris', 1), ((select id from t_ev), 'qualy', 'piastri', 2), ((select id from t_ev), 'qualy', 'max_verstappen', 3);
-- Гонка: подиум точно (10+10+10, подиум +10), russell/leclerc на 1 мимо (+5+5), hamilton на 2 (+3),
-- albon на 3 (+1), sainz 11-й (0), gasly точно (+10), alonso на 4 (+1). Быстрый круг leclerc (+6).
insert into results (event_id, kind, driver_id, position, fastest_lap_rank) values
  ((select id from t_ev), 'race', 'norris', 1, 2), ((select id from t_ev), 'race', 'max_verstappen', 2, null),
  ((select id from t_ev), 'race', 'piastri', 3, null), ((select id from t_ev), 'race', 'leclerc', 4, 1),
  ((select id from t_ev), 'race', 'russell', 5, null), ((select id from t_ev), 'race', 'alonso', 6, null),
  ((select id from t_ev), 'race', 'hadjar', 7, null), ((select id from t_ev), 'race', 'hamilton', 8, null),
  ((select id from t_ev), 'race', 'gasly', 9, null), ((select id from t_ev), 'race', 'albon', 10, null),
  ((select id from t_ev), 'race', 'sainz', 11, null);

select ok(recompute_event_scores((select id from t_ev)) > 0, 'подсчёт создаёт строки');
select is((select sum(points)::int from score_lines where block = 'qualy'), 6, 'квалификация: только поул, +6');
select is((select sum(points)::int from score_lines where block = 'race'), 65, 'гонка: 30 точно + 10 подиум + 5+5+3+1 + 10 + 1');
select is((select count(*)::int from score_lines where kind = 'race_podium'), 1, 'строка «идеальный подиум»');
select is((select points::int from score_lines where kind = 'fastest_lap'), 6, 'быстрый круг +6');
select is((select count(*)::int from score_lines where driver_id = 'sainz'), 0, 'пилот вне топ-10 — без очков');
select ok((select bool_and(provisional) from score_lines), 'очки предварительные, пока результат не финальный');

select recompute_event_scores((select id from t_ev));
select is((select sum(points)::int from score_lines), 77, 'повторный подсчёт даёт те же 77 очков');

-- ── Ручной ввод ──────────────────────────────────────────────────────────
select pg_temp.login('c0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select admin_set_result((select id from t_ev), 'qualy', array['max_verstappen','norris','piastri']) $$,
  '42501', null, 'не админ не вводит результат');
reset role;
insert into site_admins (user_id) values ('c0000000-0000-0000-0000-00000000000a');
select pg_temp.login('c0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select admin_set_result((select id from t_ev), 'qualy', array['max_verstappen','norris','piastri']) $$,
  'админ вводит квалификацию вручную');
reset role;
select is((select coalesce(sum(points), 0)::int from score_lines where block = 'qualy'), 4, 'пересчёт: теперь угадано только P3, +4');
select is((select source from results where kind = 'qualy' and position = 1), 'manual', 'источник результата — manual');

select * from finish();
rollback;
