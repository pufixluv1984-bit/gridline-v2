-- 0025 · Настройка профиля при первом входе: окно «Добро пожаловать» (ник, аватар, любимые команда и пилот, язык).
-- setup_done_at — когда игрок прошёл или пропустил окно; null — окно ещё не показывалось.
-- Окно только для новых игроков: у всех, кто уже есть, отметка ставится сразу.

alter table public.profiles add column setup_done_at timestamptz;
comment on column public.profiles.setup_done_at is 'Окно настройки профиля пройдено или пропущено; null — показать при входе';

update public.profiles set setup_done_at = coalesce(created_at, now());

-- Отметку ставит только эта функция и только себе (столбец игроку напрямую не доступен).
create function public.finish_profile_setup()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set setup_done_at = now()
  where id = (select auth.uid()) and setup_done_at is null
$$;
revoke execute on function public.finish_profile_setup() from public, anon;
grant execute on function public.finish_profile_setup() to authenticated;

-- Данные окна одним запросом: команды (с цветом — он станет цветом профиля) и пилоты заявки текущего сезона.
create function public.welcome_screen()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'color', t.color) order by t.name)
      from public.teams t
      where exists (select 1 from public.season_entries se join public.seasons s on s.id = se.season_id and s.is_current
                    where se.team_id = t.id and se.active)), '[]'::jsonb),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', coalesce(d.name_ru, d.given_name || ' ' || d.family_name),
                                          'team_name', t.name) order by coalesce(d.name_ru, d.family_name))
      from public.season_entries se
      join public.seasons s on s.id = se.season_id and s.is_current
      join public.drivers d on d.id = se.driver_id
      join public.teams t on t.id = se.team_id
      where se.active), '[]'::jsonb)
  )
$$;
revoke execute on function public.welcome_screen() from public, anon;
grant execute on function public.welcome_screen() to authenticated;
