-- pgTAP: журнал ошибок сайта и ник по умолчанию (миграция 0026).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ba000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('ba000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"ADMIN"}');
insert into site_admins (user_id) values ('ba000000-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.login('ba000000-0000-0000-0000-00000000000a');
select lives_ok($$ select log_client_error('crash', 'Screen crash: boom', 'at X', '/predict', 'abc123', 'Chrome') $$, 'игрок пишет ошибку');
select throws_ok($$ select * from client_errors $$, '42501', null, 'игрок не читает журнал');
select throws_ok($$ select client_errors_screen() $$, '42501', null, 'экран журнала — только админу');
-- Лимит: 20 за час с аккаунта.
select log_client_error('error', 'spam ' || g) from generate_series(1, 30) g;
reset role;
select is((select count(*)::int from client_errors where user_id = 'ba000000-0000-0000-0000-00000000000a'), 20, 'не больше 20 за час');
select is((select message from client_errors order by id limit 1), 'Screen crash: boom', 'запись с аккаунтом и текстом');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select lives_ok($$ select log_client_error('error', 'на экране входа') $$, 'без входа тоже можно (экран входа)');
reset role;
select is((select user_id from client_errors where message = 'на экране входа'), null, 'без аккаунта — без id');

select pg_temp.login('ba000000-0000-0000-0000-00000000000b');
select is(jsonb_array_length(client_errors_screen()), 21, 'админ видит журнал (20 с аккаунта + 1 без входа)');
reset role;

select is(sanitize_nickname('', 'ba000000-0000-0000-0000-000000000000'), 'Player-ba00', 'ник по умолчанию — латиницей');

select * from finish();
rollback;
