-- pgTAP: RPC экранов и сброс инвайт-кода (миграция 0008).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('f0000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}');
insert into season_entries (season_id, driver_id, team_id, number)
select (select id from seasons where year = 2026), d.id, 'mclaren', 1 from drivers d where d.id in ('norris', 'piastri');
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2026), 21, 'las-vegas', 'Гран-при Лас-Вегаса', 'Las Vegas', 'США'),
  ((select id from seasons where year = 2026), 22, 'lusail', 'Гран-при Катара', 'Lusail', 'Катар'),
  ((select id from seasons where year = 2026), 20, 'sao-paulo', 'Гран-при Сан-Паулу', 'Interlagos', 'Бразилия');
insert into sessions (event_id, kind, starts_at)
select id, 'qualy'::session_kind, now() + (round - 21) * interval '7 days' from events
union all
select id, 'race'::session_kind, now() + (round - 21) * interval '7 days' + interval '1 day' from events;
insert into results (event_id, kind, driver_id, team_id, position)
select id, 'race', 'norris', 'mclaren', 1 from events where slug = 'sao-paulo';
insert into leagues (id, name, season_id, owner_id) values
  ('a1000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026), 'f0000000-0000-0000-0000-00000000000a');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select is((select slug from events where id = current_event_id()), 'las-vegas', 'текущий этап — ближайший будущий');

select pg_temp.login('f0000000-0000-0000-0000-00000000000a');
select is(predict_screen() -> 'event' ->> 'slug', 'las-vegas', 'predict_screen: этап по умолчанию');
select is(jsonb_array_length(predict_screen() -> 'drivers'), 2, 'predict_screen: пилоты заявки');
select ok(predict_screen() -> 'prediction' = 'null'::jsonb, 'predict_screen: прогноза ещё нет');
select is(home_screen() ->> 'league_id', 'a1000000-0000-0000-0000-000000000001', 'home_screen: лига игрока');
select is(home_screen() -> 'last_race' -> 'podium' -> 0 ->> 'code', 'NOR', 'home_screen: победитель прошлого этапа');
select is(jsonb_array_length(home_screen() -> 'next_events'), 1, 'home_screen: следующие этапы');
select is(league_screen('a1000000-0000-0000-0000-000000000001') -> 'league' ->> 'name', 'Друзья', 'league_screen для участника');
select ok(reset_invite_code('a1000000-0000-0000-0000-000000000001') ~ '^[A-HJKMNP-Z2-9]{6}$', 'владелец сбрасывает код');
reset role;

select pg_temp.login('f0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select league_screen('a1000000-0000-0000-0000-000000000001') $$, '42501', null, 'чужой не открывает лигу');
select throws_ok($$ select reset_invite_code('a1000000-0000-0000-0000-000000000001') $$, '42501', null, 'чужой не сбрасывает код');
select is(home_screen() ->> 'league_id', null, 'home_screen без лиг — пусто');
reset role;

select * from finish();
rollback;
