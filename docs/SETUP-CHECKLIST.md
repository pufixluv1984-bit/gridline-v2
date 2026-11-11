# Чек-лист настройки (делает владелец, Claude Code подскажет по шагам)

## 1. GitHub
- [x] Создать пустой репозиторий (имя, например, `gridline-v2`), публичный.
- [x] Settings → Pages → Source: GitHub Actions.
- [x] Старый репозиторий `gridline` не трогать до конца сезона 2026.

## 2. Supabase (бесплатный тариф)
- [x] Создать **новый** проект (старый — для текущего сайта). На бесплатном плане допустимо 2 активных проекта.
- [x] Подключить коннектор Supabase в настройках claude.ai (тогда Claude создаёт таблицы и политики сам) либо поставить Supabase CLI и войти в аккаунт.
- [x] Authentication → URL Configuration: Site URL = адрес сайта на Pages, разрешённые редиректы = он же и `http://localhost:5173`.
- [x] Способы входа: только Google и Discord (`PRODUCT.md`, §7). Провайдер Email выключить.

## 3. Вход через Google / Discord
- [x] Google Cloud Console → OAuth client (Web), redirect URI из Supabase (Authentication → Providers → Google). ID и secret вписать в Supabase.
- [x] Discord Developer Portal → Application → OAuth2, redirect URI из Supabase. Client ID и secret вписать в Supabase.

## 4. Секреты GitHub (Settings → Secrets and variables → Actions)
- [x] `VITE_SUPABASE_URL`
- [x] `VITE_SUPABASE_ANON_KEY` — только публичный (anon/publishable) ключ.
- [x] `SUPABASE_DB_URL` — строка подключения для ночного бэкапа (по желанию, фаза 0).
- [x] `BACKUP_PASSPHRASE` — длинная случайная фраза для шифрования бэкапа (репозиторий публичный, артефакты видны всем вошедшим в GitHub). Без неё бэкап не делается. Фразу сохранить в менеджере паролей: без неё дамп не расшифровать.
- Ключ `service_role` **не** добавлять в секреты, которые видит сборка фронтенда. Он нужен только внутри Supabase (Edge Functions).

## 5. Решения владельца
- [ ] Ответы на «Открытые вопросы» в `docs/PRODUCT.md`.
- [ ] Ссылка на автора в футере.
- [ ] Источник фото пилотов и машин.
