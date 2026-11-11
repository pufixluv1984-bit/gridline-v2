import { getSupabase } from '../supabase';
import type { Database } from '../database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export const profileKeys = {
  me: (userId: string) => ['profile', userId] as const,
};

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
