-- 0023 · Язык сайта в профиле: украинский, русский, английский (общий для всех устройств игрока).
-- null — ещё не выбран: сайт берёт язык браузера и при первом входе записывает его сюда.
alter table public.profiles
  add column locale text check (locale in ('uk', 'ru', 'en'));
comment on column public.profiles.locale is 'Язык интерфейса: uk, ru, en; null — по языку браузера';

grant update (locale) on public.profiles to authenticated;
