# Чек-лист настройки (делает владелец, Claude Code подскажет по шагам)

## 1. GitHub
- [ ] Создать пустой репозиторий (имя, например, `gridline-v2`), публичный.
- [ ] Settings → Pages → Source: GitHub Actions.
- [ ] Старый репозиторий `gridline` не трогать до конца сезона 2026.

## 2. Supabase (бесплатный тариф)
- [ ] Создать **новый** проект (старый — для текущего сайта). На бесплатном плане допустимо 2 активных проекта.
- [ ] Подключить коннектор Supabase в настройках claude.ai (тогда Claude создаёт таблицы и политики сам) либо поставить Supabase CLI и войти в аккаунт.
- [ ] Authentication → URL Configuration: Site URL = адрес сайта на Pages, разрешённые редиректы = он же и `http://localhost:5173`.
- [ ] Выбрать способы входа (вопрос 1 в `PRODUCT.md`).

## 3. Вход через Google / Discord (если выбрано)
- [ ] Google Cloud Console → OAuth client (Web), redirect URI из Supabase (Authentication → Providers → Google). ID и secret вписать в Supabase.
- [ ] Discord Developer Portal → Application → OAuth2, redirect URI из Supabase. Client ID и secret вписать в Supabase.

## 3b. Почта для регистрации по паролю
- [ ] Подключить свой SMTP-сервис в Supabase (Authentication → SMTP), чтобы письма подтверждения и сброса пароля доходили без жёстких лимитов встроенной отправки. Claude Code подскажет сервис с бесплатным тарифом и шаги.
- [ ] Включить подтверждение почты.

## 4. Секреты GitHub (Settings → Secrets and variables → Actions)
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY` — только публичный (anon/publishable) ключ.
- [ ] `SUPABASE_DB_URL` — строка подключения для ночного бэкапа (по желанию, фаза 0).
- [ ] `BACKUP_PASSPHRASE` — длинная случайная фраза для шифрования бэкапа (репозиторий публичный, артефакты видны всем вошедшим в GitHub). Без неё бэкап не делается. Фразу сохранить в менеджере паролей: без неё дамп не расшифровать.
- Ключ `service_role` **не** добавлять в секреты, которые видит сборка фронтенда. Он нужен только внутри Supabase (Edge Functions).

## 5. Решения владельца
- [ ] Ответы на «Открытые вопросы» в `docs/PRODUCT.md`.
- [ ] Ссылка на автора в футере.
- [ ] Источник фото пилотов и машин.
