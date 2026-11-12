import { getSupabase } from '../supabase';
import type { Database } from '../database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export const profileKeys = {
  me: (userId: string) => ['profile', userId] as const,
  screen: (player?: string, season?: number) => ['screen', 'profile', player ?? 'me', season ?? 'current'] as const,
};

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export type TitleKey = 'sniper' | 'best_stage' | 'survivor';
export type TitleHolder = { user_id: string; nickname: string; avatar_color: string; value: number; event?: string };
export type LeagueTitles = Partial<Record<TitleKey, TitleHolder | null>>;

export const TITLE_NAMES: Record<TitleKey, string> = {
  sniper: 'Снайпер',
  best_stage: 'Лучший этап',
  survivor: 'Выживший',
};

export type ProfileScreen = {
  player: {
    id: string;
    nickname: string;
    avatar_color: string;
    created_at: string;
    nickname_changed_at: string | null;
    fav_driver: { id: string; code: string; name: string; number: number | null; team_name: string | null; team_code: string | null; color: string | null } | null;
    fav_team: { id: string; name: string; code: string; color: string } | null;
  } | null;
  is_me: boolean;
  options: {
    drivers: { id: string; code: string; name: string; team_name: string }[];
    teams: { id: string; code: string; name: string }[];
  } | null;
  season: number;
  seasons: number[];
  history: { event_id: number; round: number; name: string; points: number; exact: number; played: boolean }[];
  best_streak: number;
  titles: { league_id: string; league: string; title: TitleKey; value: number }[];
  accuracy: {
    qualy_hit: number; qualy_total: number;
    race_hit: number; race_total: number;
    bonus_hit: number; bonus_total: number;
  };
  best_drivers: { id: string; code: string; name: string; points: number; color: string | null; team_code: string | null; number: number | null }[];
  leagues: { id: string; name: string; member_count: number; rank: number | null }[];
  duel: { rival: { id: string; nickname: string; avatar_color: string }; wins: number; losses: number } | null;
  fantasy?: {
    team_name: string | null;
    league: { id: string; name: string; rank: number; members: number; points: number } | null;
    squad: {
      drivers: string[]; teams: string[]; drs: string | null; chip: string | null; cost: number; transfers: number; free_before: number;
      lineup: { id: string; code: string; name: string; number: number | null; color: string | null; team_code: string | null }[];
      cons: { id: string; code: string; name: string; color: string }[];
    } | null;
    chips_used: string[];
    history: { round: number; name: string; total: number }[];
    budget: number;
  } | null;
};

export async function profileScreen(player?: string, season?: number): Promise<ProfileScreen> {
  const { data, error } = await getSupabase().rpc('profile_screen', {
    ...(player ? { player } : {}),
    ...(season ? { season_year: season } : {}),
  });
  if (error) throw error;
  return data as unknown as ProfileScreen;
}

/** Правка своего профиля. Ограничения (ник раз в 30 дней, допустимые символы, справочники) проверяет база. */
export async function updateProfile(userId: string, patch: Database['public']['Tables']['profiles']['Update']): Promise<void> {
  const { error } = await getSupabase().from('profiles').update(patch).eq('id', userId);
  if (error) {
    if (error.hint === 'nick_cooldown') throw new Error('Ник можно менять раз в 30 дней.');
    if (error.code === '23514' && 'team_name' in patch) throw new Error('Название команды: от 2 до 24 символов, без пробелов по краям.');
    if (error.code === '23514') throw new Error('Ник: от 2 до 20 символов — буквы, цифры, пробел, точка, дефис, подчёркивание.');
    throw error;
  }
}
