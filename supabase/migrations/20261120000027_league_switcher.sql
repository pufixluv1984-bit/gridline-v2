-- 0027 · Экран лиги знает все лиги игрока — для переключателя на экране «Лига друзей».
--
-- Игрок может состоять и хозяйничать в нескольких лигах (docs/PRODUCT.md §1), но на экране лиги был виден
-- только последний выбор: казалось, что новая лига заменила старую. Переключатель уже был на главной;
-- теперь список лиг приходит и в league_screen — тем же запросом, без второго (правило 11).
-- Сверху лиги текущего сезона, ниже архив; внутри — по дате вступления.

create or replace function public.league_screen(league uuid)
returns jsonb
language sql
set search_path = ''
as $$
  select public.avatars_fill(public.league_screen_plain(league)) || jsonb_build_object(
    'my_leagues', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'season', s.year, 'current', s.is_current)
                       order by s.is_current desc, s.year desc, m.joined_at)
      from public.league_members m
      join public.leagues l on l.id = m.league_id
      join public.seasons s on s.id = l.season_id
      where m.user_id = auth.uid()), '[]'::jsonb))
$$;
revoke execute on function public.league_screen(uuid) from public, anon;
grant execute on function public.league_screen(uuid) to authenticated;
