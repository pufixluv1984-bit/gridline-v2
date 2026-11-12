-- pgTAP: бонусы фазы 2, бустер, safety car, настройки лиги, разбор этапа (миграция 0010).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('b2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}');
insert into season_entries (season_id, driver_id, team_id, number)
select (select id from seasons where year = 2026), d.id, 'mclaren', 1 from drivers d;
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2026), 22, 'lusail', 'Гран-при Катара', 'Lusail', 'Катар'),
  ((select id from seasons where year = 2026), 23, 'yas-marina', 'Гран-при Абу-Даби', 'Yas', 'ОАЭ'),
  ((select id from seasons where year = 2026), 26, 'ev-26', 'Этап 26', 'Трасса', 'Страна');
insert into sessions (event_id, kind, starts_at) select id, 'qualy'::session_kind, now() + interval '2 days' from events;
insert into leagues (id, name, season_id, owner_id) values
  ('b3000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026), 'b2000000-0000-0000-0000-00000000000a');
insert into league_members (league_id, user_id) values ('b3000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b');
-- Вступили задолго до этапов (в транзакции now() неподвижно, а дедлайны ниже сдвигаются в прошлое).
update league_members set joined_at = now() - interval '10 days' where league_id = 'b3000000-0000-0000-0000-000000000001';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create function pg_temp.ev(s text) returns bigint language sql as $$ select id from events where slug = s $$;

-- ── Прогнозы ─────────────────────────────────────────────────────────────
select pg_temp.login('b2000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into predictions (event_id, qualy, race, first_dnf, pole_wins, safety_car, dnf_many, boost_block)
  values (pg_temp.ev('lusail'), array['norris','piastri','max_verstappen'],
          array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'],
          'stroll', true, true, true, 'bonus') $$, 'прогноз с бонусами и бустером');
select throws_ok($$ insert into predictions (event_id, qualy, race, boost_block)
  values (pg_temp.ev('yas-marina'), array['norris','piastri','max_verstappen'],
          array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'], 'race') $$,
  '23514', null, 'второй бустер в том же окне (этапы 21–25) — отказ');
select lives_ok($$ insert into predictions (event_id, qualy, race, first_dnf)
  values (pg_temp.ev('yas-marina'), array['norris','piastri','max_verstappen'],
          array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'], 'none') $$,
  'без бустера на соседнем этапе — можно');
select lives_ok($$ insert into predictions (event_id, qualy, race, boost_block)
  values (pg_temp.ev('ev-26'), array['norris','piastri','max_verstappen'],
          array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'], 'race') $$,
  'в следующем окне (26–30) бустер снова доступен');
select throws_ok($$ update predictions set first_dnf = 'senna' where event_id = pg_temp.ev('lusail') $$,
  '23503', null, 'первый сход — только пилот из заявки или «Никто»');
reset role;

select pg_temp.login('b2000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into predictions (event_id, qualy, race, first_dnf, pole_wins, safety_car, dnf_many)
  values (pg_temp.ev('lusail'), array['norris','piastri','max_verstappen'],
          array['norris','piastri','max_verstappen','russell','leclerc','hamilton','albon','sainz','gasly','alonso'],
          'bottas', false, false, false) $$, 'второй игрок отправил прогноз');
select is((breakdown_screen(pg_temp.ev('ev-26'), 'b2000000-0000-0000-0000-00000000000a') -> 'prediction'), 'null'::jsonb,
  'чужой прогноз в разборе скрыт до дедлайна');
reset role;

-- ── Катар прошёл ────────────────────────────────────────────────────────
update sessions set starts_at = now() - interval '1 day' where event_id in (pg_temp.ev('lusail'), pg_temp.ev('yas-marina'));

insert into results (event_id, kind, driver_id, position) values
  (pg_temp.ev('lusail'), 'qualy', 'norris', 1), (pg_temp.ev('lusail'), 'qualy', 'piastri', 2), (pg_temp.ev('lusail'), 'qualy', 'max_verstappen', 3);
insert into results (event_id, kind, driver_id, position, position_text, laps, status) values
  (pg_temp.ev('lusail'), 'race', 'norris', 1, '1', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'piastri', 2, '2', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'max_verstappen', 3, '3', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'russell', 4, '4', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'leclerc', 5, '5', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'hamilton', 6, '6', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'sainz', 7, '7', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'gasly', 8, '8', 57, 'Finished'),
  (pg_temp.ev('lusail'), 'race', 'hadjar', 9, '9', 56, 'Lapped'),
  (pg_temp.ev('lusail'), 'race', 'antonelli', 10, '10', 56, 'Lapped'),
  (pg_temp.ev('lusail'), 'race', 'albon', 18, '18', 50, 'Retired'),        -- классифицирован, но сошёл
  (pg_temp.ev('lusail'), 'race', 'alonso', 19, 'R', 30, 'Retired'),        -- первые сходы: 30 кругов,
  (pg_temp.ev('lusail'), 'race', 'stroll', 20, 'R', 30, 'Retired'),        -- двое на одном круге
  (pg_temp.ev('lusail'), 'race', 'bottas', 21, 'W', 0, 'Did not start');   -- не стартовал — не сход
insert into race_facts (event_id, safety_car) values (pg_temp.ev('lusail'), true);
select recompute_event_scores(pg_temp.ev('lusail'));

create temp view t_a as select * from score_lines where user_id = 'b2000000-0000-0000-0000-00000000000a' and event_id = pg_temp.ev('lusail');
create temp view t_b as select * from score_lines where user_id = 'b2000000-0000-0000-0000-00000000000b' and event_id = pg_temp.ev('lusail');

select is((select points from t_a where kind = 'first_dnf')::int, 10, 'первый сход: двое на одном круге — засчитан любой');
select is((select count(*)::int from t_b where kind = 'first_dnf'), 0, 'не стартовавший — не первый сход');
select is((select count(*)::int from t_a where kind = 'dnf_many'), 1, 'сходов 3 (включая классифицированного) — «2 и больше» верно');
select is((select count(*)::int from t_a where kind = 'pole_wins'), 1, 'поул выиграл гонку — «да» верно');
select is((select count(*)::int from t_a where kind = 'safety_car'), 1, 'safety car был — «да» верно');
select is((select count(*)::int from t_b where block = 'bonus'), 0, 'у второго игрока все бонусы мимо');
select ok((select bool_and(multiplier = 2) from t_a where block = 'bonus'), 'бустер удвоил блок бонусов');
select ok((select bool_and(multiplier = 1) from t_a where block <> 'bonus'), 'остальные блоки без бустера');
select is((select sum(points)::int from t_a where block = 'race'), 80, 'гонка: 60 точно + 10 подиум + 5 + 5');

-- Абу-Даби: сходов не было — «Никто» верно.
insert into results (event_id, kind, driver_id, position, position_text, laps, status) values
  (pg_temp.ev('yas-marina'), 'race', 'norris', 1, '1', 58, 'Finished'), (pg_temp.ev('yas-marina'), 'race', 'piastri', 2, '2', 58, 'Finished');
select recompute_event_scores(pg_temp.ev('yas-marina'));
select is((select points::int from score_lines where event_id = pg_temp.ev('yas-marina') and kind = 'first_dnf'
           and user_id = 'b2000000-0000-0000-0000-00000000000a'), 10, 'сходов нет — «Никто» +10');

-- ── Таблица лиги по настройкам ──────────────────────────────────────────
select pg_temp.login('b2000000-0000-0000-0000-00000000000a');
select is((select points from league_table('b3000000-0000-0000-0000-000000000001') where nickname = 'VOVA'), 162,
  'VOVA: Катар 14 + 80 + 19×2 (бустер) и Абу-Даби 20 + 10 («Никто»)');
reset role;
update leagues set bonus_config = '{"boost": false, "safety_car": false}' where id = 'b3000000-0000-0000-0000-000000000001';
select pg_temp.login('b2000000-0000-0000-0000-00000000000a');
select is((select points from league_table('b3000000-0000-0000-0000-000000000001') where nickname = 'VOVA'), 140,
  'без бустера и без ставки safety car: Катар 14 + 80 + 16, Абу-Даби 30');
reset role;

-- ── Разбор и ручной ввод ────────────────────────────────────────────────
select pg_temp.login('b2000000-0000-0000-0000-00000000000b');
select is((breakdown_screen(pg_temp.ev('lusail'), 'b2000000-0000-0000-0000-00000000000a') -> 'prediction' ->> 'first_dnf'), 'stroll',
  'после дедлайна сосед по лиге видит прогноз в разборе');
select throws_ok($$ select admin_set_safety_car(pg_temp.ev('lusail'), false) $$, '42501', null, 'не админ не меняет safety car');
reset role;

select * from finish();
rollback;
