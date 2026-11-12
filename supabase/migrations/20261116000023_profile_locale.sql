-- 0023 · Язык сайта в профиле: украинский, русский, английский (общий для всех устройств игрока).
-- null — ещё не выбран: сайт берёт язык браузера и при первом входе записывает его сюда.
alter table public.profiles
  add column locale text check (locale in ('uk', 'ru', 'en'));
comment on column public.profiles.locale is 'Язык интерфейса: uk, ru, en; null — по языку браузера';

grant update (locale) on public.profiles to authenticated;

-- Украинские буквы в нике и буквах аватара: і, ї, є, ґ (раньше проходили только русские).
alter table public.profiles
  drop constraint profiles_nickname_check,
  add constraint profiles_nickname_check
    check (nickname = btrim(nickname) and char_length(nickname) between 2 and 20
           and nickname ~ '^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9 _.-]+$'),
  drop constraint profiles_avatar_text_check,
  add constraint profiles_avatar_text_check
    check (avatar_text is null or avatar_text ~ '^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9]{1,2}$');

create or replace function public.sanitize_nickname(raw text, fallback_seed uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(n) >= 2 then n
    else 'Игрок-' || substr(replace(fallback_seed::text, '-', ''), 1, 4)
  end
  from (
    select btrim(left(btrim(regexp_replace(coalesce(raw, ''), '[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9 _.-]', '', 'g')), 20)) as n
  ) s
$$;
