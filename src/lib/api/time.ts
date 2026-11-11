import { getSupabase } from '../supabase';

/** Серверное время (RPC server_now). Дедлайны и таймеры считаем от него, не от часов устройства. */
export async function fetchServerNow(): Promise<number> {
  const { data, error } = await getSupabase().rpc('server_now');
  if (error) throw error;
  return Date.parse(data);
}
