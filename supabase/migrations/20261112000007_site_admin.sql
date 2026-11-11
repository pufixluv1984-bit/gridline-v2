-- 0007 · Админ сайта (ручной ввод результатов) — владелец, решение от 11.11.2026.
-- Только id аккаунта, без почты и других личных данных. Если аккаунта нет (локальная база), ничего не происходит.
insert into public.site_admins (user_id)
select id from public.profiles where id = '1ca1cc31-409a-496a-a79a-d12af03a79da'
on conflict (user_id) do nothing;
