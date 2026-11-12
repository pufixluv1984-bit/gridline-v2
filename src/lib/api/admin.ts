import { getSupabase } from '../supabase';

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
  if (error) throw new Error(error.code === '42501' ? 'Нет прав: вводить результат может только админ сайта.' : 'Не получилось сохранить результат.');
  return data as number;
}

/** Ручной ввод: был ли safety car в гонке (если OpenF1 не дал данных). */
export async function adminSetSafetyCar(ev: number, value: boolean) {
  const { data, error } = await getSupabase().rpc('admin_set_safety_car', { ev, value });
  if (error) throw new Error(error.code === '42501' ? 'Нет прав.' : 'Не получилось сохранить.');
  return data as number;
}
