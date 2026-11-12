-- pgTAP: язык сайта в профиле (миграция 0023).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b7000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.login('b7000000-0000-0000-0000-00000000000a');
select is((select locale from profiles where id = auth.uid()), null, 'новый игрок — язык не выбран');
select lives_ok($$ update profiles set locale = 'uk' where id = auth.uid() $$, 'игрок сам выбирает язык');
select throws_ok($$ update profiles set locale = 'de' where id = auth.uid() $$, '23514', null, 'только uk, ru, en');
reset role;

select * from finish();
rollback;
