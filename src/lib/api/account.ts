import { getSupabase } from '../supabase';
import { markSignedOutByUser } from './auth';

/**
 * Удаляет аккаунт вошедшего игрока (RPC delete_my_account, миграция 0002) и выходит на этом устройстве.
 * База откажет, если игрок владеет лигой с другими участниками.
 */
export async function deleteMyAccount(): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('delete_my_account');
  if (error) {
    if (error.hint === 'owns_leagues_with_members') {
      throw new Error('Ты владелец лиги, в которой есть другие игроки. Сначала передай её кому-то из них.');
    }
    throw new Error('Не получилось удалить аккаунт. Попробуй ещё раз.');
  }
  // Пользователя на сервере уже нет — чистим только локальную сессию.
  markSignedOutByUser();
  await sb.auth.signOut({ scope: 'local' });
}
