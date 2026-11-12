-- pgTAP: биографии пилотов на трёх языках (миграция 0024).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b8000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}');
insert into season_entries (season_id, driver_id, team_id, number) values
  ((select id from seasons where is_current), 'hamilton', 'ferrari', 44);

select sync_driver_career('hamilton', jsonb_build_object(
  'wins', 105, 'seasons', '[]'::jsonb,
  'bio', 'Британский автогонщик.', 'bio_url', 'https://ru.wikipedia.org/wiki/Хэмилтон,_Льюис',
  'bio_uk', 'Британський автогонщик.', 'bio_url_uk', 'https://uk.wikipedia.org/wiki/Льюїс_Гамільтон',
  'bio_en', 'British racing driver.', 'bio_url_en', 'https://en.wikipedia.org/wiki/Lewis_Hamilton'));

select is((select bio_uk from driver_careers where driver_id = 'hamilton'), 'Британський автогонщик.', 'украинская биография сохраняется');
select is((select bio_url_en from driver_careers where driver_id = 'hamilton'), 'https://en.wikipedia.org/wiki/Lewis_Hamilton', 'ссылка на английскую статью сохраняется');

-- Синхронизация без биографий их не стирает.
select sync_driver_career('hamilton', '{"wins": 106, "seasons": []}'::jsonb);
select is((select bio_en from driver_careers where driver_id = 'hamilton'), 'British racing driver.', 'английская биография не стирается');

select throws_ok($$ select sync_driver_career('hamilton', '{"bio": "x", "bio_url_uk": "https://evil.example/"}'::jsonb) $$,
  '23514', null, 'ссылка только на uk.wikipedia.org');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
select pg_temp.login('b8000000-0000-0000-0000-00000000000a');
select is((driver_screen('hamilton') -> 'career' ->> 'bio_uk'), 'Британський автогонщик.', 'экран пилота отдаёт украинскую биографию');
select throws_ok($$ select sync_driver_career('hamilton', '{"bio": "x"}'::jsonb) $$, '42501', null, 'игрок не пишет биографии');
reset role;

select * from finish();
rollback;
