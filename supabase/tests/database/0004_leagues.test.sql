-- pgTAP: лиги — создание, код, лимит попыток, вступление, выход, исключение, передача, таблица (миграция 0004).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('e0000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}'),
  ('e0000000-0000-0000-0000-00000000000c', 'c@test.local', '{"nickname":"Третий"}');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create temp table t_league (id uuid, code text);
grant all on t_league to authenticated;

-- ── Создание ─────────────────────────────────────────────────────────────
select pg_temp.login('e0000000-0000-0000-0000-00000000000a');
select lives_ok($$ with x as (
  insert into leagues (name, season_id, max_members) values ('Друзья', (select id from seasons where year = 2026), 2)
  returning id, invite_code) insert into t_league select id, invite_code from x $$, 'создать лигу');
select is((select owner_id from leagues), 'e0000000-0000-0000-0000-00000000000a'::uuid, 'владелец — создатель');
select throws_ok($$ insert into leagues (name, season_id, invite_code) values ('Своя', (select id from seasons where year = 2026), 'AAAAAA') $$,
  '42501', null, 'свой инвайт-код задать нельзя');
select throws_ok($$ insert into leagues (name, season_id, max_members) values ('Большая', (select id from seasons where year = 2026), 50) $$,
  '23514', null, 'больше 20 игроков нельзя');
reset role;

-- ── Код и лимит попыток ──────────────────────────────────────────────────
select pg_temp.login('e0000000-0000-0000-0000-00000000000b');
select is(league_preview('ZZZZZZ') ->> 'error', 'not_found', 'неверный код — not_found');
select is((league_preview(lower((select code from t_league))) ->> 'name'), 'Друзья', 'превью по коду, регистр не важен');
select is(join_league((select code from t_league)), (select id from t_league), 'вступить по коду');
select is(join_league((select code from t_league)), (select id from t_league), 'повторное вступление — та же лига');
select is((select count(*)::int from league_members), 2, 'участник видит состав лиги');
reset role;

select pg_temp.login('e0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select join_league((select code from t_league)) $$, 'P0001', null, 'мест нет — отказ');
select is(join_league('AAAAA1'), null, 'неверный код — null');
reset role;
select is((select count(*)::int from join_attempts where user_id = 'e0000000-0000-0000-0000-00000000000c' and not ok), 1,
  'неверная попытка записана');
insert into join_attempts (user_id, ok) select 'e0000000-0000-0000-0000-00000000000c', false from generate_series(1, 9);
select pg_temp.login('e0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select league_preview('BBBBBB') $$, 'P0001', null, '10 неверных кодов за час — пауза');
select throws_ok($$ select league_table((select id from t_league)) $$, '42501', null, 'чужой не видит таблицу');
reset role;

-- ── Выход, исключение, передача ──────────────────────────────────────────
select pg_temp.login('e0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select leave_league((select id from t_league)) $$, 'P0001', null, 'владелец с участниками сначала передаёт лигу');
reset role;
select pg_temp.login('e0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select kick_member((select id from t_league), 'e0000000-0000-0000-0000-00000000000a') $$, '42501', null,
  'участник не исключает');
reset role;
select pg_temp.login('e0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select transfer_league((select id from t_league), 'e0000000-0000-0000-0000-00000000000b') $$, 'владелец передаёт лигу');
reset role;
select is((select owner_id from leagues where id = (select id from t_league)), 'e0000000-0000-0000-0000-00000000000b'::uuid,
  'новый владелец');
select is((select role::text from league_members where user_id = 'e0000000-0000-0000-0000-00000000000a'), 'member', 'старый — участник');

-- ── Таблица и тай-брейк ──────────────────────────────────────────────────
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2026), 1, 'ev-one', 'Первый', 'X1', 'Y1'),
  ((select id from seasons where year = 2026), 2, 'ev-two', 'Второй', 'X2', 'Y2');
insert into sessions (event_id, kind, starts_at) select id, 'qualy', now() + interval '1 day' from events where slug in ('ev-one', 'ev-two');
-- Равенство очков (15:15) и точных (1:1), по этапу выиграли по одному → решает последний этап (B 10 > A 5).
insert into score_lines (user_id, event_id, block, kind, slot, points) values
  ('e0000000-0000-0000-0000-00000000000a', (select id from events where slug = 'ev-one'), 'race', 'race_exact', 1, 10),
  ('e0000000-0000-0000-0000-00000000000a', (select id from events where slug = 'ev-two'), 'race', 'race_off1', 1, 5),
  ('e0000000-0000-0000-0000-00000000000b', (select id from events where slug = 'ev-one'), 'race', 'race_off1', 1, 5),
  ('e0000000-0000-0000-0000-00000000000b', (select id from events where slug = 'ev-two'), 'race', 'race_exact', 1, 10),
  ('e0000000-0000-0000-0000-00000000000a', (select id from events where slug = 'ev-two'), 'bonus', 'fastest_lap', 0, 6);
update leagues set bonus_config = '{"fastest_lap": false}' where id = (select id from t_league);

select pg_temp.login('e0000000-0000-0000-0000-00000000000a');
select is((select nickname from league_table((select id from t_league)) where rank = 1), 'T-SHY',
  'бонус выключен в лиге → ничья, решает последний этап');
reset role;
update leagues set bonus_config = '{}' where id = (select id from t_league);
select pg_temp.login('e0000000-0000-0000-0000-00000000000a');
select is((select points from league_table((select id from t_league)) where nickname = 'VOVA'), 21, 'бонус включён → 21 очко');
select is((select nickname from league_table((select id from t_league)) where rank = 1), 'VOVA', 'и VOVA первый');
reset role;

select * from finish();
rollback;
