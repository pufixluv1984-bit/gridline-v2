-- pgTAP: профиль, серии, звания сезона, сдвиг мест в лиге (миграция 0012).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c2000000-0000-0000-0000-00000000000a', 'a@test.local', '{"nickname":"VOVA"}'),
  ('c2000000-0000-0000-0000-00000000000b', 'b@test.local', '{"nickname":"T-SHY"}'),
  ('c2000000-0000-0000-0000-00000000000c', 'c@test.local', '{"nickname":"KOLYA"}'),
  ('c2000000-0000-0000-0000-00000000000d', 'd@test.local', '{"nickname":"STRANGER"}');
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2026), 21, 'r21', 'Этап 21', 'Трасса', 'Страна'),
  ((select id from seasons where year = 2026), 22, 'r22', 'Этап 22', 'Трасса', 'Страна'),
  ((select id from seasons where year = 2026), 23, 'r23', 'Этап 23', 'Трасса', 'Страна'),
  ((select id from seasons where year = 2026), 24, 'r24', 'Этап 24', 'Трасса', 'Страна');
insert into sessions (event_id, kind, starts_at)
select id, 'qualy'::session_kind, now() - interval '1 day' * (25 - round) from events where slug like 'r2_';
insert into leagues (id, name, season_id, owner_id) values
  ('c3000000-0000-0000-0000-000000000001', 'Друзья', (select id from seasons where year = 2026), 'c2000000-0000-0000-0000-00000000000a');
insert into league_members (league_id, user_id) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-00000000000b'),
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-00000000000c');
update league_members set joined_at = now() - interval '30 days' where league_id = 'c3000000-0000-0000-0000-000000000001';
-- KOLYA вступил после дедлайна этапа 21: этот этап у него в лиге не считается.
update league_members set joined_at = now() - interval '3 days 12 hours'
where user_id = 'c2000000-0000-0000-0000-00000000000c';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create function pg_temp.ev(s text) returns bigint language sql as $$ select id from events where slug = s $$;
create function pg_temp.pts(u text, ev text, kind text, p int, slot int default 0) returns void language sql as $$
  insert into score_lines (user_id, event_id, block, kind, slot, points, provisional)
  values (('c2000000-0000-0000-0000-00000000000' || u)::uuid, pg_temp.ev(ev),
          case when kind like 'qualy%' then 'qualy' else 'race' end, kind, slot, p, false)
$$;

-- Этапы 21–24. VOVA: 10, 0, 8, 6 (серия 2). T-SHY: 5, 7, 4, 20 (серия 4, лучший этап 20).
-- KOLYA: (21 — 30 очков, но до вступления), 0, 0, 3. Точные: VOVA 3, T-SHY 1.
select pg_temp.pts('a', 'r21', 'qualy_exact', 6, 1), pg_temp.pts('a', 'r21', 'qualy_exact', 4, 2),
       pg_temp.pts('a', 'r23', 'race_exact', 8, 1), pg_temp.pts('a', 'r24', 'race_off1', 6, 2);
select pg_temp.pts('b', 'r21', 'race_off2', 5, 1), pg_temp.pts('b', 'r22', 'race_exact', 7, 1),
       pg_temp.pts('b', 'r23', 'race_off1', 4, 1), pg_temp.pts('b', 'r24', 'race_podium', 20, 0);
select pg_temp.pts('c', 'r21', 'race_podium', 30, 0), pg_temp.pts('c', 'r24', 'race_in_top10', 3, 1);
-- Точное у VOVA за этап 24 вдобавок — для «Снайпера».
select pg_temp.pts('a', 'r24', 'qualy_exact', 0, 3);

-- ── Ник и любимые ───────────────────────────────────────────────────────
select pg_temp.login('c2000000-0000-0000-0000-00000000000a');
select lives_ok($$ update profiles set nickname = 'VOVA2' where id = auth.uid() $$, 'первая смена ника — сразу');
select throws_ok($$ update profiles set nickname = 'VOVA3' where id = auth.uid() $$,
  '23514', 'Ник можно менять раз в 30 дней', 'вторая смена ника раньше 30 дней — отказ');
select lives_ok($$ update profiles set avatar_color = '#e8211a' where id = auth.uid() $$, 'цвет аватара менять можно всегда');
select lives_ok($$ update profiles set fav_driver = 'norris', fav_team = 'mclaren' where id = auth.uid() $$,
  'любимые пилот и команда сохраняются');
select throws_ok($$ update profiles set fav_driver = 'senna' where id = auth.uid() $$, '23503', null,
  'любимый пилот — только из справочника');

-- ── Серии и профиль ─────────────────────────────────────────────────────
select is(best_streak(auth.uid(), (select id from seasons where year = 2026)), 2, 'VOVA: серия с очками 2 (ноль на этапе 22)');
select is(best_streak('c2000000-0000-0000-0000-00000000000b', (select id from seasons where year = 2026)), 4,
  'T-SHY: серия 4 этапа подряд');
select is(jsonb_array_length(profile_screen() -> 'history'), 4, 'история: 4 этапа с результатами');
select is((profile_screen() -> 'history' -> 0 ->> 'points')::int, 10, 'очки этапа 21 в истории');
select is((profile_screen() -> 'player' -> 'fav_driver' ->> 'id'), 'norris', 'любимый пилот в профиле');
select is((profile_screen() -> 'accuracy' ->> 'qualy_hit')::int, 3, 'точных в квалификации: 3');
select is((profile_screen() -> 'leagues' -> 0 ->> 'rank')::int, 2, 'место в лиге в профиле');
select is((profile_screen('c2000000-0000-0000-0000-00000000000b') -> 'player' ->> 'nickname'), 'T-SHY',
  'профиль соседа по лиге открывается');
select is((profile_screen('c2000000-0000-0000-0000-00000000000d') -> 'player'), 'null'::jsonb,
  'профиль чужого игрока (не из лиги) — пусто');
reset role;

-- ── Звания и таблица лиги ───────────────────────────────────────────────
select pg_temp.login('c2000000-0000-0000-0000-00000000000b');
select is((league_titles('c3000000-0000-0000-0000-000000000001') -> 'sniper' ->> 'nickname'), 'VOVA2',
  '«Снайпер» — больше всех точных');
select is((league_titles('c3000000-0000-0000-0000-000000000001') -> 'best_stage' ->> 'value')::int, 20,
  '«Лучший этап» — 20 очков; очки KOLYA до вступления не считаются');
select is((league_titles('c3000000-0000-0000-0000-000000000001') -> 'survivor' ->> 'nickname'), 'T-SHY',
  '«Выживший» — самая длинная серия');
select is((select (x ->> 'rank')::int from jsonb_array_elements(league_screen('c3000000-0000-0000-0000-000000000001') -> 'prev_ranks') x
           where x ->> 'user_id' = 'c2000000-0000-0000-0000-00000000000b'), 2,
  'до этапа 24 T-SHY был вторым (сейчас первый)');
select is((select count(*)::int from jsonb_array_elements(league_screen('c3000000-0000-0000-0000-000000000001') -> 'per_event') x
           where x ->> 'user_id' = 'c2000000-0000-0000-0000-00000000000c'), 3,
  'у вступившего позже — только этапы после вступления');
select throws_ok($$ select league_titles('c3000000-0000-0000-0000-000000000002') $$, '42501', null,
  'звания чужой лиги не отдаются');
reset role;

select * from finish();
rollback;
