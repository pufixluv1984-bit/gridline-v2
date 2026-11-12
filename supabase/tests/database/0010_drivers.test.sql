-- pgTAP: карьеры пилотов и экраны «Пилоты» / «Пилот» (миграция 0013).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('d2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}');
insert into season_entries (season_id, driver_id, team_id, number) values
  ((select id from seasons where is_current), 'hamilton', 'ferrari', 44),
  ((select id from seasons where is_current), 'norris', 'mclaren', 4);

select is((select count(*)::int from sync_careers_pending(5)), 2, 'без карьеры — оба пилота в очереди');

select sync_driver_career('hamilton', jsonb_build_object(
  'born', '1985-01-07', 'nationality', 'British', 'debut_year', 2007, 'debut_race', 'Гран-при Австралии',
  'starts', 380, 'wins', 105, 'poles', 104, 'podiums', 202, 'fastest_laps', 67,
  'bio', 'Британский автогонщик.', 'bio_url', 'https://ru.wikipedia.org/wiki/Хэмилтон,_Льюис',
  'seasons', jsonb_build_array(
    jsonb_build_object('year', 2008, 'position', 1, 'points', 98, 'wins', 5, 'final', true, 'teams', jsonb_build_array(jsonb_build_object('id', 'mclaren', 'name', 'McLaren'))),
    jsonb_build_object('year', 2025, 'position', 6, 'points', 156, 'wins', 0, 'final', true, 'teams', '[]'::jsonb),
    jsonb_build_object('year', 2026, 'position', 1, 'points', 300, 'wins', 9, 'final', false, 'teams', '[]'::jsonb))));

select is(career_titles((select seasons from driver_careers where driver_id = 'hamilton')), '{2008}'::smallint[],
  'титул текущего незаконченного сезона не засчитывается');
select is((select count(*)::int from sync_careers_pending(5)), 1, 'свежая карьера не обновляется повторно');

-- Повторная синхронизация без биографии не стирает её.
select sync_driver_career('hamilton', '{"wins": 106, "seasons": []}'::jsonb);
select is((select bio from driver_careers where driver_id = 'hamilton'), 'Британский автогонщик.', 'биография сохраняется');
select is((select wins from driver_careers where driver_id = 'hamilton'), 106, 'цифры карьеры обновляются');

-- Частичная загрузка длинной карьеры: сезоны сохраняются, пилот остаётся в очереди.
select sync_driver_career('norris', '{"partial": true, "seasons": [{"year": 2019, "position": 11, "points": 49, "final": true}]}'::jsonb);
select ok(exists (select 1 from sync_careers_pending(5) where driver_id = 'norris' and seasons -> 0 ->> 'year' = '2019'),
  'после частичной загрузки пилот снова в очереди, готовые сезоны переданы');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
select pg_temp.login('d2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select sync_driver_career('norris', '{"wins": 999}'::jsonb) $$, '42501', null,
  'игрок не пишет карьеру');
select throws_ok($$ update driver_careers set wins = 0 $$, '42501', null, 'таблица карьер только для чтения');
select is(jsonb_array_length(drivers_screen() -> 'drivers'), 2, 'каталог: пилоты заявки сезона');
select is((driver_screen('hamilton') -> 'career' ->> 'wins')::int, 106, 'профиль пилота: карьера');
select is((driver_screen('hamilton') -> 'driver' ->> 'team_code'), 'FER', 'профиль пилота: текущая команда');
reset role;

select * from finish();
rollback;
