-- 0026 · Журнал ошибок сайта и нейтральный ник по умолчанию.
--
-- 1. client_errors: сбои в браузерах игроков (упал экран, необработанная ошибка). Раньше о них можно было узнать
--    только из консоли игрока. Пишет только функция log_client_error (с лимитом частоты), читает только админ сайта.
--    Хранится 30 дней. Личного — только id аккаунта (при удалении аккаунта обнуляется).
-- 2. Ник по умолчанию (если у Google/Discord не нашлось имени): «Player-xxxx» вместо «Игрок-xxxx» —
--    сайт на трёх языках, а латиница читается на всех.

create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('crash', 'error', 'rejection')),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 4000),
  path text check (char_length(path) <= 200),
  release text check (char_length(release) <= 40),
  agent text check (char_length(agent) <= 300)
);
comment on table public.client_errors is 'Сбои сайта в браузерах игроков (30 дней). Пишет log_client_error, читает админ сайта.';
create index client_errors_created on public.client_errors (created_at desc);
create index client_errors_user on public.client_errors (user_id, created_at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

-- Запись: не больше 20 за час с аккаунта и 100 за час без входа (экран входа), заодно чистка старше 30 дней.
create function public.log_client_error(kind text, message text, stack text default null, path text default null,
                                        release text default null, agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if kind not in ('crash', 'error', 'rejection') or coalesce(btrim(message), '') = '' then
    return;
  end if;
  if (select count(*) from public.client_errors e
      where e.user_id is not distinct from me and e.created_at > now() - interval '1 hour')
     >= case when me is null then 100 else 20 end then
    return;
  end if;
  insert into public.client_errors (user_id, kind, message, stack, path, release, agent)
  values (case when exists (select 1 from public.profiles p where p.id = me) then me end,
          kind, left(btrim(message), 500), left(stack, 4000), left(path, 200), left(release, 40), left(agent, 300));
  delete from public.client_errors where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.log_client_error(text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;

-- Экран «Ошибки» для админа: последние 100 сбоев с ником, одним запросом.
create function public.client_errors_screen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Только для админа сайта' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'at', e.created_at, 'kind', e.kind, 'message', e.message, 'stack', e.stack,
             'path', e.path, 'release', e.release, 'agent', e.agent, 'nickname', p.nickname)
           order by e.created_at desc)
    from (select * from public.client_errors order by created_at desc limit 100) e
    left join public.profiles p on p.id = e.user_id), '[]'::jsonb);
end $$;
revoke execute on function public.client_errors_screen() from public, anon;
grant execute on function public.client_errors_screen() to authenticated;

-- Ник по умолчанию — латиницей.
create or replace function public.sanitize_nickname(raw text, fallback_seed uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(n) >= 2 then n
    else 'Player-' || substr(replace(fallback_seed::text, '-', ''), 1, 4)
  end
  from (
    select btrim(left(btrim(regexp_replace(coalesce(raw, ''), '[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9 _.-]', '', 'g')), 20)) as n
  ) s
$$;
