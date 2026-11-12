-- pgTAP: GIF в корзине и поиск неиспользуемых аватарок (миграция 0021).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}');
update profiles set avatar_path = 'e2000000-0000-0000-0000-00000000000a/cur' where id = 'e2000000-0000-0000-0000-00000000000a';

insert into storage.objects (bucket_id, name, created_at) values
  ('avatars', 'e2000000-0000-0000-0000-00000000000a/cur-256', now() - interval '2 hours'),
  ('avatars', 'e2000000-0000-0000-0000-00000000000a/cur-512', now() - interval '2 hours'),
  ('avatars', 'e2000000-0000-0000-0000-00000000000a/old-256', now() - interval '2 hours'),
  ('avatars', 'e2000000-0000-0000-0000-00000000000a/new-256', now() - interval '5 minutes'),
  ('avatars', 'e2000000-0000-0000-0000-00000000000f/gone-256', now() - interval '3 days');

select is((select allowed_mime_types from storage.buckets where id = 'avatars'), array['image/webp', 'image/jpeg', 'image/gif'],
  'корзина принимает GIF, но не SVG');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 2097152::bigint, 'лимит файла 2 МБ');
select set_eq($$ select * from avatars_orphans() $$,
  array['e2000000-0000-0000-0000-00000000000a/old-256', 'e2000000-0000-0000-0000-00000000000f/gone-256'],
  'лишние: старое фото и файлы удалённого аккаунта; текущее и свежая загрузка не трогаются');
select ok(not exists (select 1 from avatars_orphans() n where n like '%/cur-%'), 'текущее фото не попадает в уборку');

select ok(not has_function_privilege('authenticated', 'public.avatars_orphans(interval,integer)', 'execute'), 'игроку функция недоступна');
select ok(not has_function_privilege('anon', 'public.avatars_orphans(interval,integer)', 'execute'), 'гостю функция недоступна');

select * from finish();
rollback;
