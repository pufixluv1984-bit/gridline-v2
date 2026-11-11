-- 0006 · Расписание вызова sync-f1: каждые 10 минут (pg_cron + pg_net внутри Supabase).
-- Функция сама решает, что обновлять: расписание и заявку раз в 6 часов, результаты — после сессий.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-f1',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := c.value,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    from public.app_config c
    where c.key = 'sync_url' and c.value <> ''
  $job$
);
