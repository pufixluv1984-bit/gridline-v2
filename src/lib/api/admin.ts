import { getSupabase } from '../supabase';
import { t } from '@/i18n';

export async function isSiteAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_site_admin');
  if (error) return false;
  return data === true;
}

/** Ручной ввод результата (только админ сайта; проверяет база). Возвращает число строк очков. */
export async function adminSetResult(ev: number, session: 'qualy' | 'race', driverIds: string[], fastestLap: string | null) {
  const { data, error } = await getSupabase().rpc('admin_set_result', {
    ev,
    session,
    driver_ids: driverIds,
    ...(fastestLap ? { fastest_lap: fastestLap } : {}),
  });
  if (error) throw new Error(error.code === '42501' ? t('admin.noRights') : t('admin.saveFailed'));
  return data as number;
}

/** Ручной ввод: был ли safety car в гонке (если OpenF1 не дал данных). */
export async function adminSetSafetyCar(ev: number, value: boolean) {
  const { data, error } = await getSupabase().rpc('admin_set_safety_car', { ev, value });
  if (error) throw new Error(error.code === '42501' ? t('admin.noRightsShort') : t('admin.saveFailedShort'));
  return data as number;
}

export type ClientError = {
  id: number;
  at: string;
  kind: 'crash' | 'error' | 'rejection';
  message: string;
  stack: string | null;
  path: string | null;
  release: string | null;
  agent: string | null;
  nickname: string | null;
};

/** Журнал ошибок сайта: последние 100 сбоев (только админ сайта; проверяет база). */
export async function clientErrors(): Promise<ClientError[]> {
  const { data, error } = await getSupabase().rpc('client_errors_screen' as never);
  if (error) throw error;
  return (data ?? []) as unknown as ClientError[];
}
