-- pgTAP: живые цены фэнтези, модель v2 (миграция 0022, docs/FANTASY-FORMULA.md §4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into season_entries (season_id, driver_id, team_id, number)
select (select id from seasons where is_current), d, t, n from (values
  ('norris', 'mclaren', 4), ('piastri', 'mclaren', 81), ('russell', 'mercedes', 63), ('antonelli', 'mercedes', 12),
  ('albon', 'williams', 23), ('sainz', 'williams', 55)) v(d, t, n);
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where is_current), 24, 'v2-1', 'Этап 24', 'Трасса', 'Страна'),
  ((select id from seasons where is_current), 25, 'v2-2', 'Этап 25', 'Трасса', 'Страна');
create function pg_temp.ev(s text) returns bigint language sql as $$ select id from events where slug = s $$;
insert into sessions (event_id, kind, starts_at) values
  (pg_temp.ev('v2-1'), 'fp1', now() - interval '3 days'), (pg_temp.ev('v2-1'), 'qualy', now() - interval '2 days'),
  (pg_temp.ev('v2-1'), 'race', now() - interval '1 day'), (pg_temp.ev('v2-2'), 'fp1', now() + interval '6 days');
insert into fantasy_seasons (season_id, start_event_id) values ((select id from seasons where is_current), pg_temp.ev('v2-1'));
insert into fantasy_prices (event_id, kind, asset_id, price) values
  (pg_temp.ev('v2-1'), 'driver', 'norris', 25.0), (pg_temp.ev('v2-1'), 'driver', 'piastri', 22.0),
  (pg_temp.ev('v2-1'), 'driver', 'russell', 18.0), (pg_temp.ev('v2-1'), 'driver', 'antonelli', 8.0),
  (pg_temp.ev('v2-1'), 'driver', 'albon', 7.0), (pg_temp.ev('v2-1'), 'driver', 'sainz', 9.0),
  (pg_temp.ev('v2-1'), 'team', 'mclaren', 25.0), (pg_temp.ev('v2-1'), 'team', 'mercedes', 15.0), (pg_temp.ev('v2-1'), 'team', 'williams', 9.0);

-- Антонелли (дешёвый) выигрывает квалификацию и гонку, Пиастри (дорогой) сходит.
insert into results (event_id, kind, driver_id, team_id, position, position_text, grid, laps, status, fastest_lap_rank, is_final, q_reached) values
  (pg_temp.ev('v2-1'), 'qualy', 'antonelli', 'mercedes', 1, '1', null, null, null, null, true, 3),
  (pg_temp.ev('v2-1'), 'qualy', 'russell', 'mercedes', 2, '2', null, null, null, null, true, 3),
  (pg_temp.ev('v2-1'), 'qualy', 'norris', 'mclaren', 3, '3', null, null, null, null, true, 3),
  (pg_temp.ev('v2-1'), 'qualy', 'sainz', 'williams', 4, '4', null, null, null, null, true, 3),
  (pg_temp.ev('v2-1'), 'qualy', 'albon', 'williams', 5, '5', null, null, null, null, true, 2),
  (pg_temp.ev('v2-1'), 'qualy', 'piastri', 'mclaren', 6, '6', null, null, null, null, true, 1),
  (pg_temp.ev('v2-1'), 'race', 'antonelli', 'mercedes', 1, '1', 1, 57, 'Finished', 1, true, null),
  (pg_temp.ev('v2-1'), 'race', 'russell', 'mercedes', 2, '2', 2, 57, 'Finished', 3, true, null),
  (pg_temp.ev('v2-1'), 'race', 'norris', 'mclaren', 3, '3', 3, 57, 'Finished', 2, true, null),
  (pg_temp.ev('v2-1'), 'race', 'albon', 'williams', 4, '4', 5, 57, 'Finished', 4, true, null),
  (pg_temp.ev('v2-1'), 'race', 'sainz', 'williams', 5, '5', 4, 57, 'Finished', 5, true, null),
  (pg_temp.ev('v2-1'), 'race', 'piastri', 'mclaren', 6, 'R', 6, 10, 'Accident', null, true, null);

-- ── Очки за любой этап совпадают с основным подсчётом ────────────────────
select recompute_fantasy_scores(pg_temp.ev('v2-1'));
select set_eq(
  $$ select kind, asset_id, line, points from fantasy_asset_lines(pg_temp.ev('v2-1')) $$,
  $$ select kind, asset_id, line, points from fantasy_points where event_id = pg_temp.ev('v2-1') $$,
  'fantasy_asset_lines даёт ровно те же строки, что recompute_fantasy_scores');

-- ── Модель ──────────────────────────────────────────────────────────────
select is((select count(*)::int from fantasy_price_model(pg_temp.ev('v2-1'))), 9, 'цена считается для каждого актива с ценой');
select ok((select bool_and(abs(delta) <= 0.8) from fantasy_price_model(pg_temp.ev('v2-1'))), 'за этап цена меняется не больше ±0.8');
select ok((select delta > 0 from fantasy_price_model(pg_temp.ev('v2-1')) where asset_id = 'antonelli'), 'дешёвый победитель дорожает');
select ok((select delta < 0 from fantasy_price_model(pg_temp.ev('v2-1')) where asset_id = 'piastri'), 'дорогой со сходом дешевеет');
select ok((select bool_and(target between 4.5 and 28.0) from fantasy_price_model(pg_temp.ev('v2-1')) where kind = 'driver'),
  'справедливая цена пилота в пределах $4.5–28.0M');
select ok((select target = 28.0 from fantasy_price_model(pg_temp.ev('v2-1')) where asset_id = 'antonelli'),
  'у лучшего по рейтингу справедливая цена — верх диапазона');

-- ── Пересчёт после этапа ────────────────────────────────────────────────
select is(fantasy_update_prices(pg_temp.ev('v2-1')), 9, 'v2 записала цены на следующий этап');
select ok((select bool_and(target is not null and reason like 'справедливая $%') from fantasy_prices where event_id = pg_temp.ev('v2-2')),
  'у цен следующего этапа есть справедливая цена и причина');
select is(fantasy_update_prices(pg_temp.ev('v2-1')), 0, 'повторный пересчёт не дублирует (идемпотентно)');

update fantasy_rules set value = '"v1"' where key = 'price_model';
update fantasy_events set prices_done = false where event_id = pg_temp.ev('v2-1');
select fantasy_update_prices(pg_temp.ev('v2-1'));
select ok((select bool_and(reason like 'очки на миллион%') from fantasy_prices where event_id = pg_temp.ev('v2-2')),
  'price_model = v1 возвращает старую модель');

-- ── Новичок: 85% цены напарника ─────────────────────────────────────────
insert into championship (season_id, kind, position, driver_id, team_id, points) values
  ((select id from seasons where is_current), 'drivers', 1, 'norris', null, 300);
insert into seasons (year) values (2099);
insert into events (season_id, round, slug, name, circuit, country) values
  ((select id from seasons where year = 2099), 1, 'v2-99', 'Этап 1', 'Трасса', 'Страна');
insert into season_entries (season_id, driver_id, team_id, number) values
  ((select id from seasons where year = 2099), 'norris', 'mclaren', 4),
  ((select id from seasons where year = 2099), 'piastri', 'mclaren', 81);
select fantasy_seed_prices_from(pg_temp.ev('v2-99'), (select id from seasons where is_current));
select is((select price from fantasy_prices where event_id = pg_temp.ev('v2-99') and asset_id = 'piastri'),
  round(0.85 * (select price from fantasy_prices where event_id = pg_temp.ev('v2-99') and asset_id = 'norris'), 1),
  'новичок стартует с 85% цены напарника, а не с нижней цены');

select * from finish();
rollback;
