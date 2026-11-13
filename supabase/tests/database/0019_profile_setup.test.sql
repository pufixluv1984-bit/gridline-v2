-- pgTAP: окно настройки профиля при первом входе (миграция 0025).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b9000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}');
insert into season_entries (season_id, driver_id, team_id, number) values
  ((select id from seasons where is_current), 'hamilton', 'ferrari', 44);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.login('b9000000-0000-0000-0000-00000000000a');
select is((select setup_done_at from profiles where id = auth.uid()), null, 'новый игрок — окно ещё не пройдено');
select throws_ok($$ update profiles set setup_done_at = now() where id = auth.uid() $$, '42501', null,
  'отметку напрямую не поставить');

select is((welcome_screen() -> 'teams' -> 0 ->> 'color'), '#ED1131', 'окно: команды заявки с цветом');
select is((welcome_screen() -> 'drivers' -> 0 ->> 'id'), 'hamilton', 'окно: пилоты заявки');

select lives_ok($$ select finish_profile_setup() $$, 'игрок отмечает окно пройденным');
select isnt((select setup_done_at from profiles where id = auth.uid()), null, 'отметка стоит');
reset role;

set local role anon;
select throws_ok($$ select welcome_screen() $$, '42501', null, 'без входа данных окна нет');
reset role;

select * from finish();
rollback;
