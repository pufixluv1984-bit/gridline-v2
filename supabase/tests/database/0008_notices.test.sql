-- pgTAP: перенос сессии → предупреждение игрокам (миграция 0011).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select sync_schedule(2026::smallint, '[{"round": 21, "slug": "las-vegas", "name": "Гран-при Лас-Вегаса", "circuit": "Las Vegas Strip", "country": "США",
  "lat": 36.11, "lon": -115.17,
  "sessions": [{"kind": "qualy", "starts_at": "2026-11-21T04:00:00Z"}, {"kind": "race", "starts_at": "2026-11-22T04:00:00Z"}]}]');
select is((select count(*)::int from event_notices), 0, 'первая загрузка расписания — без предупреждений');

-- Квалификацию перенесли на час.
select sync_schedule(2026::smallint, '[{"round": 21, "slug": "las-vegas", "name": "Гран-при Лас-Вегаса", "circuit": "Las Vegas Strip", "country": "США",
  "lat": 36.11, "lon": -115.17,
  "sessions": [{"kind": "qualy", "starts_at": "2026-11-21T05:00:00Z"}, {"kind": "race", "starts_at": "2026-11-22T04:00:00Z"}]}]');
select is((select count(*)::int from event_notices), 1, 'перенос квалификации записан');
select is((select event_deadline(id) from events where slug = 'las-vegas'), '2026-11-21T05:00:00Z'::timestamptz, 'дедлайн сдвинулся вместе с квалификацией');
select is((notices_json((select id from events where slug = 'las-vegas')) -> 0 ->> 'session'), 'qualy', 'предупреждение о квалификации');

-- Повторная синхронизация без изменений — новых записей нет; вернули обратно — плашка исчезает.
select sync_schedule(2026::smallint, '[{"round": 21, "slug": "las-vegas", "name": "Гран-при Лас-Вегаса", "circuit": "Las Vegas Strip", "country": "США",
  "lat": 36.11, "lon": -115.17,
  "sessions": [{"kind": "qualy", "starts_at": "2026-11-21T05:00:00Z"}, {"kind": "race", "starts_at": "2026-11-22T04:00:00Z"}]}]');
select is((select count(*)::int from event_notices), 1, 'без изменений — без новых записей');
select sync_schedule(2026::smallint, '[{"round": 21, "slug": "las-vegas", "name": "Гран-при Лас-Вегаса", "circuit": "Las Vegas Strip", "country": "США",
  "lat": 36.11, "lon": -115.17,
  "sessions": [{"kind": "qualy", "starts_at": "2026-11-21T04:00:00Z"}, {"kind": "race", "starts_at": "2026-11-22T04:00:00Z"}]}]');
select is(jsonb_array_length(notices_json((select id from events where slug = 'las-vegas'))), 0, 'перенесли и вернули — предупреждения нет');

select * from finish();
rollback;
