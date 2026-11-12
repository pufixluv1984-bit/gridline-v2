import { getSupabase } from '../supabase';
import { t } from '@/i18n';

export type LeaguePreview =
  | { error: 'not_found' }
  | {
      error?: undefined;
      id: string;
      name: string;
      mode: string;
      max_members: number;
      owner_nickname: string;
      start_event: { round: number; name: string } | null;
      member_count: number;
      already_member: boolean;
      members: { nickname: string; avatar_color: string; avatar_path?: string | null; avatar_text?: string | null }[];
    };

/** Ошибки RPC лиг → понятный текст (hint задаёт база). */
function friendly(error: { hint?: string | null; code?: string; message?: string }): Error {
  switch (error.hint) {
    case 'rate_limited':
      return new Error(t('league.err.attempts'));
    case 'league_full':
      return new Error(t('league.err.full'));
    case 'owner_must_transfer':
      return new Error(t('league.err.ownerLeave'));
    case 'not_member':
      return new Error(t('league.err.newOwner'));
  }
  if (error.code === '23514') return new Error(t('league.err.name'));
  if (error.code === '42501') return new Error(t('league.err.rights'));
  return new Error(t('league.err.generic'));
}

export async function createLeague(input: { name: string; mode?: 'predict' | 'fantasy' | 'both'; maxMembers: number; startEventId: number | null; seasonId: number }) {
  const { data, error } = await getSupabase()
    .from('leagues')
    .insert({
      name: input.name.trim(),
      season_id: input.seasonId,
      max_members: input.maxMembers,
      start_event_id: input.startEventId,
      mode: input.mode ?? 'predict',
      bonus_config: { fastest_lap: true },
    })
    .select('id')
    .single();
  if (error) throw friendly(error);
  return data.id;
}

export async function currentSeasonId(): Promise<number> {
  const { data, error } = await getSupabase().from('seasons').select('id').eq('is_current', true).single();
  if (error) throw friendly(error);
  return data.id;
}

export async function leaguePreview(code: string): Promise<LeaguePreview> {
  const { data, error } = await getSupabase().rpc('league_preview', { code });
  if (error) throw friendly(error);
  return data as LeaguePreview;
}

/** Возвращает id лиги или null, если кода нет. */
export async function joinLeague(code: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('join_league', { code });
  if (error) throw friendly(error);
  return data;
}

export async function leaveLeague(league: string) {
  const { error } = await getSupabase().rpc('leave_league', { league });
  if (error) throw friendly(error);
}

export async function kickMember(league: string, member: string) {
  const { error } = await getSupabase().rpc('kick_member', { league, member });
  if (error) throw friendly(error);
}

export async function transferLeague(league: string, newOwner: string) {
  const { error } = await getSupabase().rpc('transfer_league', { league, new_owner: newOwner });
  if (error) throw friendly(error);
}

export async function resetInviteCode(league: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('reset_invite_code', { league });
  if (error) throw friendly(error);
  return data;
}

export async function deleteLeague(league: string) {
  const { error } = await getSupabase().from('leagues').delete().eq('id', league);
  if (error) throw friendly(error);
}

/** Какие бонусы считаются в лиге (только владелец; отсутствующий ключ = включено). */
export const BONUS_KEYS = ['fastest_lap', 'first_dnf', 'pole_wins', 'safety_car', 'dnf_many', 'boost'] as const;
export type BonusKey = (typeof BONUS_KEYS)[number];

export async function updateLeagueBonuses(league: string, config: Record<BonusKey, boolean>) {
  const { error } = await getSupabase().from('leagues').update({ bonus_config: config }).eq('id', league);
  if (error) throw friendly(error);
}

/** Перенести лигу прошлого сезона в текущий (только хозяин). Возвращает id новой лиги. */
export async function carryOverLeague(league: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('league_carry_over' as never, { league } as never);
  if (error) throw new Error(error.code === '42501' ? t('league.err.carry') : error.message);
  return data as unknown as string;
}
