import { getSupabase } from '../supabase';
import type { EventInfo } from './screens';

export type ChipId = 'wildcard' | 'limitless' | 'final_fix' | 'autopilot' | 'no_negative' | 'extra_drs';

/** Чипы (FANTASY-FORMULA.md §5). Коды — как в макете Fantasy-Squad. */
export const CHIPS: { id: ChipId; code: string; name: string; desc: string; notFirst: boolean }[] = [
  { id: 'wildcard', code: 'WC', name: 'Wildcard', desc: 'Любые замены без штрафа, бюджет остаётся.', notFirst: true },
  { id: 'limitless', code: 'LL', name: 'Limitless', desc: 'Один этап без бюджета. После него состав возвращается.', notFirst: true },
  { id: 'final_fix', code: 'FF', name: 'Final Fix', desc: 'Одна замена пилота после закрытия составов и до старта гонки.', notFirst: true },
  { id: 'autopilot', code: 'AP', name: 'Autopilot', desc: 'DRS-буст сам переходит к лучшему пилоту состава.', notFirst: false },
  { id: 'no_negative', code: 'NN', name: 'No Negative', desc: 'Отрицательные очки пилотов и конструкторов не засчитываются.', notFirst: false },
  { id: 'extra_drs', code: 'X3', name: 'Extra DRS', desc: 'Пилот с DRS-бустом получает ×3 вместо ×2.', notFirst: false },
];
export const chipOf = (id: string | null | undefined) => CHIPS.find((c) => c.id === id);

export type MarketDriver = {
  id: string;
  code: string;
  name: string;
  number: number | null;
  team_id: string | null;
  team_code: string | null;
  team_name: string | null;
  color: string | null;
  price: number;
  delta: number;
  reason: string | null;
  /** Справедливая цена (модель v2, FANTASY-FORMULA §4.1); null — старая модель или старт сезона. */
  target?: number | null;
  /** Цена по этапам сезона до текущего. */
  history?: { round: number; price: number }[];
  pts3: number;
  season_pts: number;
  last_pts: number;
  out: boolean;
  sub: string | null;
  owned: number | null;
};
export type MarketTeam = {
  id: string;
  code: string;
  name: string;
  color: string;
  price: number;
  delta: number;
  reason: string | null;
  /** Справедливая цена (модель v2, FANTASY-FORMULA §4.1); null — старая модель или старт сезона. */
  target?: number | null;
  /** Цена по этапам сезона до текущего. */
  history?: { round: number; price: number }[];
  pts3: number;
  season_pts: number;
  last_pts: number;
  owned: number | null;
};
export type Market = { league_size: number; drivers: MarketDriver[]; teams: MarketTeam[] };

export type Squad = {
  drivers: string[];
  teams: string[];
  drs: string | null;
  chip: ChipId | null;
  cost: number;
  transfers: number;
  penalty: number;
  auto: boolean;
  final_fix: { out: string; in: string } | null;
  updated_at: string;
};

export type SquadScreen = {
  event: EventInfo | null;
  lock_at: string;
  race_at: string | null;
  locked: boolean;
  is_start: boolean;
  league_id: string | null;
  team_name: string | null;
  rules: { budget: number; transfer_penalty: number; free_max: number };
  free_before: number;
  base: { drivers: string[]; teams: string[]; drs: string | null } | null;
  prev_chip: ChipId | null;
  squad: Squad | null;
  chips_used: { chip: ChipId; round: number; event: string }[];
  market: Market;
};

export type ScoreDetail = {
  slot: 'driver' | 'team';
  asset: string;
  actual?: string | null;
  points: number;
  mult: number;
  lines: Record<string, number>;
};

export type FantasyRow = {
  user_id: string;
  nickname: string;
  avatar_color: string; avatar_path?: string | null; avatar_text?: string | null;
  team_name: string | null;
  points: number;
  events_won: number;
  last_points: number;
  rank: number;
};

export type LeaderboardScreen = {
  league: { id: string; name: string; mode: string; member_count: number } | null;
  leagues?: { id: string; name: string }[];
  event: EventInfo | null;
  lock_at: string | null;
  weather?: { day: string; t_max: number; t_min: number; wind_max: number; precip_prob: number; code: number }[];
  last_event?: EventInfo | null;
  table?: FantasyRow[];
  squads?: {
    user_id: string;
    drivers: string[];
    teams: string[];
    drs: string | null;
    chip: ChipId | null;
    cost: number;
    cost_next: number | null;
    transfers: number;
    penalty: number;
    auto: boolean;
    total: number | null;
    details: ScoreDetail[] | null;
    provisional: boolean | null;
  }[];
  per_event?: { user_id: string; round: number; total: number }[];
  assets?: { drivers: Record<string, { code: string; name: string; number: number | null; color: string; team_code: string }> };
  teams?: Record<string, { code: string; name: string; color: string }>;
};

export type ResultsAsset = {
  id: string;
  code: string;
  name: string;
  number?: number | null;
  team_code?: string | null;
  team_name?: string | null;
  color: string | null;
  points: number;
  lines: Record<string, number>;
  price?: number | null;
};

export type FantasyResultsScreen = {
  event: EventInfo | null;
  events?: { id: number; round: number; name: string }[];
  winner?: { code: string; name: string } | null;
  drivers?: ResultsAsset[];
  teams?: ResultsAsset[];
  mine?: { total: number; penalty: number; drs: string | null; multiplier: number; details: ScoreDetail[]; provisional: boolean; chip: ChipId | null } | null;
  league?: { user_id: string; nickname: string; avatar_color: string; avatar_path?: string | null; avatar_text?: string | null; team_name: string | null; total: number; drs: string | null; chip: ChipId | null }[];
};

export type AnalyticsScreen = {
  mine: { round: number; name: string; total: number; penalty: number; drs: string | null; chip: ChipId | null }[];
  league: { user_id: string; nickname: string; avatar_color: string; avatar_path?: string | null; avatar_text?: string | null; round: number; total: number }[];
  drivers: MarketDriver[] | null;
};

export const fantasyKeys = {
  squad: (ev?: number) => ['screen', 'fantasy', 'squad', ev ?? 'current'] as const,
  leaderboard: (league?: string | null) => ['screen', 'fantasy', 'leaderboard', league ?? 'default'] as const,
  results: (ev?: number) => ['screen', 'fantasy', 'results', ev ?? 'last'] as const,
  analytics: () => ['screen', 'fantasy', 'analytics'] as const,
};

async function call<T>(fn: string, args: object = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

export const fantasySquadScreen = (ev?: number) => call<SquadScreen>('fantasy_squad_screen', ev ? { ev } : {});
export const fantasyLeaderboard = (league?: string | null) => call<LeaderboardScreen>('fantasy_leaderboard_screen', league ? { league } : {});
export const fantasyResults = (ev?: number) => call<FantasyResultsScreen>('fantasy_results_screen', ev ? { ev } : {});
export const fantasyAnalytics = () => call<AnalyticsScreen>('fantasy_analytics_screen');

/** Сохранить состав. Бюджет, лимиты, блокировку, трансферы и чипы проверяет база (FANTASY-FORMULA §3, §5). */
export async function saveSquad(ev: number, s: { drivers: string[]; teams: string[]; drs: string | null; chip: ChipId | null }) {
  const { data, error } = await getSupabase().rpc('fantasy_save_squad' as never, { ev, drivers: s.drivers, teams: s.teams, drs: s.drs, chip: s.chip } as never);
  if (error) throw new Error(error.message);
  return data as unknown as { cost: number; transfers: number; free: number; penalty: number };
}

export async function finalFix(ev: number, outDriver: string, inDriver: string) {
  const { error } = await getSupabase().rpc('fantasy_final_fix' as never, { ev, out_driver: outDriver, in_driver: inDriver } as never);
  if (error) throw new Error(error.message);
}

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(1)}M`);
export const pts = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 }));
