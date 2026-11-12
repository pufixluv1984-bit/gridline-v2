import { getSupabase } from '../supabase';
import { markSignedOutByUser } from './auth';
import { removeAllAvatarFiles } from './avatar';
import { t } from '@/i18n';

/**
 * Удаляет аккаунт вошедшего игрока (RPC delete_my_account, миграция 0002) и выходит на этом устройстве.
 * База откажет, если игрок владеет лигой с другими участниками.
 */
export async function deleteMyAccount(): Promise<void> {
  const sb = getSupabase();
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  const { error } = await sb.rpc('delete_my_account');
  if (error) {
    if (error.hint === 'owns_leagues_with_members') {
      throw new Error(t('settings.deleteOwnsLeagues'));
    }
    throw new Error(t('settings.deleteFailed'));
  }
  // Файлы фото удаляются через Storage API (из SQL их удалять нельзя) — токен сессии ещё действует.
  if (uid) await removeAllAvatarFiles(uid);
  // Пользователя на сервере уже нет — чистим только локальную сессию.
  markSignedOutByUser();
  await sb.auth.signOut({ scope: 'local' });
}
