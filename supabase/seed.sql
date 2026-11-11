-- Локальные данные для разработки (supabase db reset). На боевую базу не попадает.
insert into public.seasons (year, is_current) values (2026, true) on conflict (year) do nothing;
-- Локальная база не должна вызывать боевую функцию sync-f1 по расписанию.
update public.app_config set value = '' where key = 'sync_url';
