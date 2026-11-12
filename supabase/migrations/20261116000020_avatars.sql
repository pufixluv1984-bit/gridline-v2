-- 0020 · Фото профиля и аватар из букв (макеты Settings, Overlays: «Новое фото профиля», «Кадрирование», «Аватар без фото»).
--
-- Хранение: Supabase Storage, корзина avatars (публичное чтение по неугадываемому пути).
-- Браузер сам уменьшает фото до 256×256 и 512×512 WebP/JPEG и кладёт два файла:
--   avatars/<user_id>/<stamp>-256.webp и avatars/<user_id>/<stamp>-512.webp
-- В profiles.avatar_path хранится «<user_id>/<stamp>» без суффикса. Писать и удалять можно только в своей папке.
--
-- Экраны: фото и буквы попадают во все ответы, где уже есть avatar_color. Чтобы не переписывать
-- десяток функций экранов, они переименованы в <name>_plain, а под прежним именем — обёртка, которая
-- дописывает avatar_path и avatar_text в каждый объект с avatar_color и user_id/id (public.avatars_fill).
-- Тот же приём, что уже есть в 0016–0019 (<name>_base). Обёртка работает с правами игрока: фото чужого
-- игрока подставляется, только если RLS профилей его показывает (общая лига).
-- ВАЖНО для следующих миграций: чтобы поменять экран, переименовывай/правь <name>_plain, а не <name>.

-- ─────────────────────────────── Профиль: новые поля ───────────────────────────────
alter table public.profiles
  add column avatar_path text,
  add column avatar_text text,
  -- Только своя папка в корзине и безопасные символы: путь подставляется в адрес картинки.
  add constraint profiles_avatar_path_check
    check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}$')),
  -- До двух букв или цифр. По умолчанию (null) — первые буквы ника.
  add constraint profiles_avatar_text_check
    check (avatar_text is null or avatar_text ~ '^[A-Za-zА-Яа-яЁё0-9]{1,2}$');
comment on column public.profiles.avatar_path is 'Фото: «<user_id>/<stamp>», файлы <path>-256.webp и <path>-512.webp в корзине avatars. null — аватар из букв.';
comment on column public.profiles.avatar_text is 'Буквы аватара без фото (до 2). null — первые буквы ника.';

grant update (avatar_path, avatar_text) on public.profiles to authenticated;

-- ─────────────────────────────── Корзина avatars ───────────────────────────────
-- Лимит на файл после сжатия в браузере (512×512 WebP — десятки КБ). Только растровые форматы, без SVG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Свою папку можно перечислить (чтобы удалить старые файлы). Чужие — нет; публичные картинки
-- отдаются по прямой ссылке без этой политики.
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────── Подстановка фото в ответы экранов ───────────────────────────────
-- Обходит jsonb и в каждый объект с avatar_color и user_id (или id) дописывает avatar_path и avatar_text игрока.
create function public.avatars_fill(j jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  res jsonb;
  uid text;
  pr record;
begin
  case jsonb_typeof(j)
    when 'array' then
      select coalesce(jsonb_agg(public.avatars_fill(e.v) order by e.o), '[]'::jsonb)
        into res from jsonb_array_elements(j) with ordinality as e(v, o);
      return res;
    when 'object' then
      select coalesce(jsonb_object_agg(e.k, public.avatars_fill(e.v)), '{}'::jsonb)
        into res from jsonb_each(j) as e(k, v);
      if res ? 'avatar_color' then
        uid := coalesce(res ->> 'user_id', res ->> 'id');
        if uid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select p.avatar_path, p.avatar_text into pr from public.profiles p where p.id = uid::uuid;
          if found then
            res := res || jsonb_build_object('avatar_path', pr.avatar_path, 'avatar_text', pr.avatar_text);
          end if;
        end if;
      end if;
      return res;
    else
      return j;
  end case;
end $$;
revoke execute on function public.avatars_fill(jsonb) from public, anon;
grant execute on function public.avatars_fill(jsonb) to authenticated;

-- Экраны с игроками: <name> → <name>_plain, под прежним именем обёртка с avatars_fill (права игрока, как у
-- остальных обёрток). Права на <name>_plain остаются прежними.
do $$
declare
  fn text;
  r record;
  call_args text;
begin
  foreach fn in array array[
    'home_screen', 'league_screen', 'predict_screen', 'breakdown_screen', 'profile_screen',
    'fantasy_leaderboard_screen', 'fantasy_results_screen', 'fantasy_analytics_screen', 'fantasy_squad_screen'
  ] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = fn) <> 1 then
      raise exception 'avatars: ожидалась ровно одна функция public.%', fn;
    end if;
    select p.oid,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           p.proargnames,
           pg_get_function_result(p.oid) as result
      into r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;
    if r.result <> 'jsonb' then
      raise exception 'avatars: public.% возвращает %, а не jsonb', fn, r.result;
    end if;

    select coalesce(string_agg(format('%1$I => %1$I', a), ', '), '')
      into call_args from unnest(coalesce(r.proargnames, array[]::text[])) as a;

    execute format('alter function public.%I(%s) rename to %I', fn, r.ident, fn || '_plain');
    execute format(
      'create function public.%I(%s) returns jsonb language sql set search_path = '''' '
      'as $f$ select public.avatars_fill(public.%I(%s)) $f$',
      fn, r.args, fn || '_plain', call_args);
    execute format('revoke execute on function public.%I(%s) from public, anon', fn, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated', fn, r.ident);
  end loop;
end $$;

-- ─────────────────────────────── Превью приглашения ───────────────────────────────
-- Здесь у игроков нет id (их не раскрываем до вступления), поэтому фото добавлено прямо в выборку.
create or replace function public.league_preview(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  league uuid := public.find_league_by_code(code);
  res jsonb;
begin
  if league is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  select jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'mode', l.mode,
    'max_members', l.max_members,
    'owner_nickname', o.nickname,
    'start_event', (select jsonb_build_object('round', e.round, 'name', e.name) from public.events e where e.id = l.start_event_id),
    'member_count', (select count(*) from public.league_members m where m.league_id = l.id),
    'already_member', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'avatar_color', p.avatar_color,
                                          'avatar_path', p.avatar_path, 'avatar_text', p.avatar_text) order by m.joined_at)
      from (select * from public.league_members m2 where m2.league_id = l.id order by m2.joined_at limit 8) m
      join public.profiles p on p.id = m.user_id
    ), '[]'::jsonb)
  ) into res
  from public.leagues l
  join public.profiles o on o.id = l.owner_id
  where l.id = league;
  return res;
end $$;
