-- 0002 · Удаление своего аккаунта прямо с сайта (Настройки → Опасная зона).
-- Правила из макета Overlays («Удалить аккаунт?»):
--   * удаляет только себя (auth.uid()), вызвать может только вошедший;
--   * если игрок владеет лигой, где есть другие участники, — отказ: лигу сначала нужно передать;
--   * лиги, где игрок владелец и единственный участник, удаляются вместе с аккаунтом.
-- Удаление строки auth.users каскадом убирает profiles → leagues (владельца) → league_members.
-- ВАЖНО для следующих миграций: все таблицы с user_id (прогнозы, очки, составы) должны ссылаться
-- на profiles(id) с on delete cascade, иначе удаление аккаунта упадёт.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Нужно войти в аккаунт' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.leagues l
    where l.owner_id = uid
      and exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id <> uid)
  ) then
    raise exception 'Сначала передай лиги, где ты владелец'
      using errcode = 'P0001', hint = 'owns_leagues_with_members';
  end if;

  delete from auth.users where id = uid;
end $$;

comment on function public.delete_my_account() is
  'Игрок удаляет свой аккаунт. Отказ, если он владелец лиги с другими участниками.';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
