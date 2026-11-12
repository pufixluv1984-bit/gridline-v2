-- 0024 · Биографии пилотов на трёх языках: к русской (bio, bio_url) добавляются украинская и английская
-- из соответствующих разделов Википедии. Экран пилота (driver_screen) отдаёт to_jsonb(driver_careers),
-- поэтому новые поля попадают в него сами; язык выбирает интерфейс.

alter table public.driver_careers
  add column bio_uk text check (char_length(bio_uk) <= 4000),
  add column bio_url_uk text check (bio_url_uk ~ '^https://uk\.wikipedia\.org/'),
  add column bio_en text check (char_length(bio_en) <= 4000),
  add column bio_url_en text check (bio_url_en ~ '^https://en\.wikipedia\.org/');

create or replace function public.sync_driver_career(driver text, data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Частичная загрузка (длинная карьера, лимит API): сохраняем только готовые сезоны,
  -- а дату обновления оставляем старой, чтобы пилот снова попал в очередь.
  if coalesce((data ->> 'partial')::boolean, false) then
    insert into public.driver_careers as c (driver_id, seasons, updated_at)
    values (driver, coalesce(data -> 'seasons', '[]'::jsonb), now() - interval '8 days')
    on conflict (driver_id) do update set seasons = excluded.seasons, updated_at = now() - interval '8 days';
    return;
  end if;
  insert into public.driver_careers as c (
    driver_id, born, nationality, debut_year, debut_race, first_win_year, first_win_race,
    starts, wins, poles, podiums, fastest_laps, seasons,
    bio, bio_url, bio_uk, bio_url_uk, bio_en, bio_url_en, updated_at, bio_updated_at)
  values (
    driver, (data ->> 'born')::date, data ->> 'nationality',
    (data ->> 'debut_year')::smallint, data ->> 'debut_race',
    (data ->> 'first_win_year')::smallint, data ->> 'first_win_race',
    coalesce((data ->> 'starts')::int, 0), coalesce((data ->> 'wins')::int, 0), coalesce((data ->> 'poles')::int, 0),
    coalesce((data ->> 'podiums')::int, 0), coalesce((data ->> 'fastest_laps')::int, 0),
    coalesce(data -> 'seasons', '[]'::jsonb),
    data ->> 'bio', data ->> 'bio_url', data ->> 'bio_uk', data ->> 'bio_url_uk', data ->> 'bio_en', data ->> 'bio_url_en',
    now(), case when data ? 'bio' then now() end)
  on conflict (driver_id) do update set
    born = excluded.born, nationality = excluded.nationality,
    debut_year = excluded.debut_year, debut_race = excluded.debut_race,
    first_win_year = excluded.first_win_year, first_win_race = excluded.first_win_race,
    starts = excluded.starts, wins = excluded.wins, poles = excluded.poles,
    podiums = excluded.podiums, fastest_laps = excluded.fastest_laps, seasons = excluded.seasons,
    updated_at = now(),
    -- Биографии трогаем, только если их запрашивали в этот раз (ключ bio есть в данных).
    bio = case when data ? 'bio' then excluded.bio else c.bio end,
    bio_url = case when data ? 'bio' then excluded.bio_url else c.bio_url end,
    bio_uk = case when data ? 'bio' then excluded.bio_uk else c.bio_uk end,
    bio_url_uk = case when data ? 'bio' then excluded.bio_url_uk else c.bio_url_uk end,
    bio_en = case when data ? 'bio' then excluded.bio_en else c.bio_en end,
    bio_url_en = case when data ? 'bio' then excluded.bio_url_en else c.bio_url_en end,
    bio_updated_at = case when data ? 'bio' then now() else c.bio_updated_at end;
end $$;

revoke execute on function public.sync_driver_career(text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_driver_career(text, jsonb) to service_role;

-- Все пилоты — в очередь синхронизации, чтобы подтянуть биографии на украинском и английском.
-- sync-f1 обновляет по два пилота за запуск, так что очередь разойдётся за несколько запусков.
update public.driver_careers
set bio_updated_at = null,
    updated_at = least(updated_at, now() - interval '8 days');
