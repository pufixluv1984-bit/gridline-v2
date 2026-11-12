import { getSupabase } from '../supabase';
import type { LeagueTitles } from './profile';

// Типы ответов RPC экранов (миграция 0008). Один запрос на экран (правило 11).

export type SessionKind = 'fp1' | 'fp2' | 'fp3' | 'sprint_qualy' | 'sprint' | 'qualy' | 'race';

export type EventInfo = {
  id: number;
  round: number;
  name: string;
  slug: string;
  country: string;
  circuit: string;
  is_sprint: boolean;
  status: 'scheduled' | 'cancelled' | 'void';
  deadline: string | null;
  season_rounds: number;
  sessions: { kind: SessionKind; starts_at: string }[];
};

export type Driver = {
  id: string;
  code: string;
  name: string;
  number: number | null;
  active: boolean;
  team_id: string;
  team_code: string;
  team_name: string;
  color: string;
};

export type LeagueRow = {
  user_id: string;
  nickname: string;
  avatar_color: string;
  role: 'owner' | 'member';
  points: number;
  exact_hits: number;
  events_won: number;
  last_points: number;
  provisional: boolean;
  rank: number;
};

export type Submission = { user_id: string; nickname: string; avatar_color: string; submitted: boolean };

export type SavedPredictionRow = {
  qualy: string[];
  race: string[];
  fastest_lap: string | null;
  first_dnf?: string | null;
  pole_wins?: boolean | null;
  safety_car?: boolean | null;
  dnf_many?: boolean | null;
  boost_block?: 'qualy' | 'race' | 'bonus' | null;
};

export type ScoreKind =
  | 'qualy_exact' | 'race_exact' | 'race_off1' | 'race_off2' | 'race_in_top10' | 'race_podium'
  | 'fastest_lap' | 'first_dnf' | 'pole_wins' | 'safety_car' | 'dnf_many';

export type BreakdownScreen = {
  event: EventInfo | null;
  player: { id: string; nickname: string; avatar_color: string } | null;
  prediction: (SavedPredictionRow & { updated_at: string }) | null;
  lines: { block: 'qualy' | 'race' | 'bonus'; kind: ScoreKind; slot: number; driver_id: string | null; points: number; multiplier: number; provisional: boolean }[];
  qualy: string[];
  race: { driver_id: string; position: number; dnf: boolean; laps: number | null; fastest: boolean }[];
  safety_car: boolean | null;
  drivers: Driver[];
  events: { id: number; round: number; name: string }[];
};

export type PredictScreen = {
  event: EventInfo | null;
  drivers: Driver[];
  prediction: (SavedPredictionRow & { updated_at: string }) | null;
  /** Бустер уже стоит на другом этапе этого окна (5 этапов) — здесь его поставить нельзя. */
  boost_used?: { round: number; name: string } | null;
  notices?: { session: string; old_at: string; new_at: string }[];
  last: { name: string; total: number; qualy: number | null; race: number | null; bonus: number | null } | null;
  league: { id: string; name: string } | null;
  submissions: Submission[];
};

export type ChampRow = {
  position: number;
  points: number;
  wins: number;
  code: string | null;
  name: string | null;
  number: number | null;
  team_name: string | null;
  team_code: string | null;
  color: string | null;
};

export type WeatherDay = {
  day: string;
  t_max: number | null;
  t_min: number | null;
  wind_max: number | null;
  precip_prob: number | null;
  code: number | null;
};

export type HomeScreen = {
  event: EventInfo | null;
  notices?: { session: string; old_at: string; new_at: string }[];
  // Поля из миграции 0009; до её применения их нет в ответе.
  track?: string | null;
  weather?: WeatherDay[];
  championship?: { drivers: ChampRow[]; teams: ChampRow[] };
  submitted: boolean;
  season_done: number;
  last_race: {
    event: string;
    round: number;
    podium: { position: number; code: string; name: string; team_name: string; team_code: string; color: string }[] | null;
  } | null;
  next_events: { round: number; name: string; race_at: string }[];
  leagues: { id: string; name: string; member_count: number }[];
  league_id: string | null;
  table: LeagueRow[];
  submissions: Submission[];
};

export type LeagueScreen = {
  league: {
    id: string;
    name: string;
    invite_code: string;
    max_members: number;
    mode: 'predict' | 'fantasy' | 'both';
    owner_id: string;
    bonus_config: Record<string, boolean>;
    start_event: { round: number; name: string } | null;
    member_count: number;
  };
  table: LeagueRow[];
  per_event: { user_id: string; round: number; points: number }[];
  /** Места до последнего этапа лиги (для стрелок сдвига); пусто, пока этапов меньше двух. */
  prev_ranks?: { user_id: string; rank: number }[];
  rounds?: { round: number; name: string }[];
  all_time?: { user_id: string; points: number; exact_hits: number }[];
  titles?: LeagueTitles;
  members: { user_id: string; nickname: string; avatar_color: string; role: 'owner' | 'member'; joined_at: string }[];
  event: EventInfo | null;
  submissions: Submission[];
};

export type ResultRow = {
  kind: 'fp1' | 'fp2' | 'fp3' | 'qualy' | 'race' | 'sprint' | 'sprint_qualy';
  best_ms?: number | null;
  gap_ms?: number | null;
  position: number;
  position_text: string | null;
  grid: number | null;
  laps: number | null;
  status: string | null;
  fastest_lap_rank: number | null;
  is_final: boolean;
  source: 'api' | 'manual';
  code: string;
  name: string;
  team_name: string | null;
  team_code: string | null;
  color: string | null;
};

export type ResultsScreen = {
  event: EventInfo | null;
  events: { id: number; round: number; name: string }[];
  results: ResultRow[];
};

export type ScheduleScreen = { current_event_id: number | null; events: EventInfo[] };

export const screenKeys = {
  predict: (ev?: number, league?: string | null) => ['screen', 'predict', ev ?? 'current', league ?? 'default'] as const,
  home: (league?: string | null) => ['screen', 'home', league ?? 'default'] as const,
  league: (id: string) => ['screen', 'league', id] as const,
  results: (ev?: number) => ['screen', 'results', ev ?? 'last'] as const,
  schedule: () => ['screen', 'schedule'] as const,
  breakdown: (ev?: number, player?: string) => ['screen', 'breakdown', ev ?? 'last', player ?? 'me'] as const,
};

async function call<T>(fn: Parameters<ReturnType<typeof getSupabase>['rpc']>[0], args?: object): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args as never);
  if (error) throw error;
  return data as T;
}

export const predictScreen = (ev?: number, league?: string | null) =>
  call<PredictScreen>('predict_screen', { ...(ev ? { ev } : {}), ...(league ? { league } : {}) });
export const homeScreen = (league?: string | null) => call<HomeScreen>('home_screen', league ? { league } : {});
export const leagueScreen = (league: string) => call<LeagueScreen>('league_screen', { league });
export const resultsScreen = (ev?: number) => call<ResultsScreen>('results_screen', ev ? { ev } : {});
export const scheduleScreen = () => call<ScheduleScreen>('schedule_screen');
export const breakdownScreen = (ev?: number, player?: string) =>
  call<BreakdownScreen>('breakdown_screen', { ...(ev ? { ev } : {}), ...(player ? { player } : {}) });

/** Когда синхронизация с Jolpica последний раз прошла успешно (для подвала). */
export const dataUpdatedAt = () => call<string | null>('data_updated_at');
