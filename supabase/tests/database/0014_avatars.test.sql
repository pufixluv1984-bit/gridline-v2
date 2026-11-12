-- pgTAP: фото профиля и аватар из букв (миграция 0020).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('d2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('d2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}'),
  ('d2000000-0000-0000-0000-00000000000c', 'c@test.local', '{"nickname":"STRANGER"}');
insert into leagues (id, name, season_id, owner_id) values
  ('d3000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026), 'd2000000-0000-0000-0000-00000000000a');
insert into league_members (league_id, user_id) values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- ── Поля профиля ───────────────────────────────────────────────────────
select pg_temp.login('d2000000-0000-0000-0000-00000000000a');
select lives_ok($$ update profiles set avatar_path = 'd2000000-0000-0000-0000-00000000000a/k1x2' where id = auth.uid() $$,
  'своё фото: путь в своей папке');
select throws_ok($$ update profiles set avatar_path = 'd2000000-0000-0000-0000-00000000000b/k1x2' where id = auth.uid() $$,
  '23514', null, 'путь в чужой папке — отказ');
select throws_ok($$ update profiles set avatar_path = 'd2000000-0000-0000-0000-00000000000a/../x' where id = auth.uid() $$,
  '23514', null, 'путь с лишними символами — отказ');
select lives_ok($$ update profiles set avatar_text = 'Вл' where id = auth.uid() $$, 'буквы: кириллица, до двух');
select throws_ok($$ update profiles set avatar_text = 'ABC' where id = auth.uid() $$, '23514', null, 'больше двух букв — отказ');
select throws_ok($$ update profiles set avatar_text = '<b' where id = auth.uid() $$, '23514', null, 'спецсимволы — отказ');
select is((select count(*)::int from profiles where id = 'd2000000-0000-0000-0000-00000000000b' and avatar_path is not null), 0,
  'чужой профиль не тронут');
reset role;

-- ── Подстановка в ответы экранов ───────────────────────────────────────
select pg_temp.login('d2000000-0000-0000-0000-00000000000b');
select is(public.avatars_fill('{"user_id":"d2000000-0000-0000-0000-00000000000a","avatar_color":"#ffd400"}') ->> 'avatar_path',
  'd2000000-0000-0000-0000-00000000000a/k1x2', 'фото участника общей лиги подставляется');
select is(public.avatars_fill('[{"x":{"id":"d2000000-0000-0000-0000-00000000000a","avatar_color":"#ffd400"}}]') -> 0 -> 'x' ->> 'avatar_text',
  'Вл', 'обход вложенных массивов и объектов');
select ok(not (public.avatars_fill('{"user_id":"d2000000-0000-0000-0000-00000000000c","avatar_color":"#ffd400"}') ? 'avatar_path'),
  'игрок без общей лиги: фото не раскрывается (RLS профилей)');
select is(public.avatars_fill('{"id":"norris","code":"NOR"}'), '{"id":"norris","code":"NOR"}'::jsonb,
  'объекты без avatar_color не меняются');
select is((select (t ->> 'avatar_path') from jsonb_array_elements(public.league_screen('d3000000-0000-0000-0000-000000000001') -> 'table') t
           where t ->> 'user_id' = 'd2000000-0000-0000-0000-00000000000a'),
  'd2000000-0000-0000-0000-00000000000a/k1x2', 'таблица лиги отдаёт фото');
select ok((public.profile_screen('d2000000-0000-0000-0000-00000000000a') -> 'player') ? 'avatar_text', 'экран профиля отдаёт буквы');
reset role;

-- ── Корзина ─────────────────────────────────────────────────────────────
-- Состав форматов меняется миграциями (0021 добавила GIF, см. 0015_avatars_gc); здесь главное — без SVG.
select ok(not exists (select 1 from storage.buckets b where b.id = 'avatars' and 'image/svg+xml' = any(b.allowed_mime_types)),
  'корзина avatars не принимает SVG');

select * from finish();
rollback;
