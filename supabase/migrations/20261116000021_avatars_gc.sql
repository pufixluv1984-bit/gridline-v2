-- 0021 · Аватарки: GIF и уборка неиспользуемых файлов.
--
-- 1. Корзина avatars принимает анимированные GIF (браузер кадрирует и собирает GIF 256×256 до 2 МБ).
-- 2. avatars_orphans(): файлы в корзине, на которые не ссылается ни один профиль (фото заменили или убрали,
--    загрузка оборвалась, аккаунт удалён). Удаляет их Edge Function sync-f1 раз в час через Storage API
--    (удалять строки storage.objects из SQL Supabase не даёт). Свежие файлы (моложе часа) не трогаем:
--    это может быть загрузка, которая ещё не дошла до записи пути в профиль.

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/gif']
 where id = 'avatars';

create function public.avatars_orphans(min_age interval default interval '1 hour', max_rows integer default 1000)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and o.created_at < now() - min_age
     and not exists (
       select 1 from public.profiles p
        where p.avatar_path is not null
          and o.name in (p.avatar_path || '-256', p.avatar_path || '-512')
     )
   order by o.created_at
   limit max_rows
$$;
comment on function public.avatars_orphans(interval, integer) is
  'Файлы корзины avatars без профиля-владельца. Вызывает только sync-f1 (service_role).';
revoke execute on function public.avatars_orphans(interval, integer) from public, anon, authenticated;
grant execute on function public.avatars_orphans(interval, integer) to service_role;
