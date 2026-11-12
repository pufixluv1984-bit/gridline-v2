-- 0019 · Фаза 5: окно «Итоги этапа» (макет Overlays) — очки за последний посчитанный этап и сдвиг места в лиге.

create function public.stage_summary(league uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  ev public.events;
  lg uuid;
  pr integer;
  fa numeric;
  rank_now integer;
  rank_prev integer;
begin
  if u is null then
    return null;
  end if;
  -- Последний этап текущего сезона с результатом гонки, где у игрока есть очки (прогнозы или фэнтези).
  select e.* into ev from public.events e join public.seasons s on s.id = e.season_id and s.is_current
  where exists (select 1 from public.results r where r.event_id = e.id and r.kind = 'race')
    and (exists (select 1 from public.score_lines sl where sl.event_id = e.id and sl.user_id = u)
         or exists (select 1 from public.fantasy_scores fs where fs.event_id = e.id and fs.user_id = u)
         or exists (select 1 from public.predictions p where p.event_id = e.id and p.user_id = u))
  order by e.round desc limit 1;
  if ev.id is null then
    return null;
  end if;

  pr := (select coalesce(sum(sl.points * sl.multiplier), 0) from public.score_lines sl where sl.event_id = ev.id and sl.user_id = u);
  fa := (select fs.total from public.fantasy_scores fs where fs.event_id = ev.id and fs.user_id = u);

  lg := coalesce(
    (select league where public.is_league_member(league)),
    (select m.league_id from public.league_members m join public.leagues l on l.id = m.league_id and l.season_id = ev.season_id
     where m.user_id = u order by m.joined_at limit 1));
  if lg is not null then
    select t.rank into rank_now from public.league_table_upto(lg, ev.round) t where t.user_id = u;
    select t.rank into rank_prev from public.league_table_upto(lg, (ev.round - 1)::smallint) t where t.user_id = u;
  end if;

  return jsonb_build_object(
    'event_id', ev.id, 'round', ev.round, 'name', ev.name,
    'predict', pr, 'fantasy', fa,
    'provisional', exists (select 1 from public.results r where r.event_id = ev.id and r.kind = 'race' and not r.is_final),
    'league', case when lg is null then null else jsonb_build_object(
      'id', lg, 'name', (select l.name from public.leagues l where l.id = lg),
      'rank', rank_now, 'prev_rank', rank_prev,
      'members', (select count(*) from public.league_members m where m.league_id = lg)) end
  );
end $$;
revoke execute on function public.stage_summary(uuid) from public, anon;
grant execute on function public.stage_summary(uuid) to authenticated;

alter function public.home_screen(uuid) rename to home_screen_base;
create function public.home_screen(league uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$ select public.home_screen_base(league) || jsonb_build_object('summary', public.stage_summary(league)) $$;
grant execute on function public.home_screen(uuid) to authenticated;
