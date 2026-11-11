-- pgTAP: чемпионат и погода (миграция 0009).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into season_entries (season_id, driver_id, team_id, number)
values ((select id from seasons where year = 2026), 'antonelli', 'mercedes', 12);
select sync_championship(2026::smallint, 'drivers',
  '[{"position": 1, "driver_id": "antonelli", "code": "ANT", "given_name": "Kimi", "family_name": "Antonelli", "points": "390", "wins": "9"},
    {"position": 2, "driver_id": "newbie", "code": "NEW", "given_name": "New", "family_name": "Driver", "points": "12.5", "wins": "0"}]');
select sync_championship(2026::smallint, 'teams',
  '[{"position": 1, "team_id": "mercedes", "points": "652", "wins": "11"}, {"position": 2, "team_id": "unknown_team", "points": "1"}]');

select is((select count(*)::int from championship where kind = 'drivers'), 2, 'пилоты загружены');
select is((select name_ru is null from drivers where id = 'newbie'), true, 'новый пилот добавлен без русского имени');
select is((select count(*)::int from championship where kind = 'teams'), 1, 'неизвестная команда пропущена');
select is(championship_top('drivers') -> 0 ->> 'team_code', 'MER', 'топ: команда пилота из заявки');
select is((championship_top('drivers') -> 1 ->> 'points')::numeric, 12.5, 'полуочки сохраняются');

insert into events (season_id, round, slug, name, circuit, country, lat, lon)
values ((select id from seasons where year = 2026), 21, 'las-vegas', 'Гран-при Лас-Вегаса', 'Las Vegas', 'США', 36.11, -115.17);
select sync_weather((select id from events where slug = 'las-vegas'),
  '[{"day": "2026-11-20", "t_max": 16.8, "wind_max": 32, "precip_prob": 27, "code": 2}, {"day": "2026-11-21", "t_max": 14}]');
select is(jsonb_array_length(weather_json((select id from events where slug = 'las-vegas'))), 2, 'погода по дням');

set local role anon;
select throws_ok($$ insert into championship (season_id, kind, position, points) values (1, 'drivers', 9, 1) $$, '42501', null, 'аноним не пишет чемпионат');
select is((select count(*)::int from event_weather), 2, 'погоду читают все');
reset role;

select * from finish();
rollback;
