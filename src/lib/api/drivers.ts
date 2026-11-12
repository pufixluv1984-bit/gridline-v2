import { getSupabase } from '../supabase';

export type CatalogDriver = {
  id: string;
  code: string;
  name: string;
  number: number | null;
  team_id: string;
  team_code: string;
  team_name: string;
  color: string;
  points: number;
  position: number | null;
  wins: number;
  titles: number;
  career_points: number;
  career_wins: number | null;
};

export type DriversScreen = { season: number; drivers: CatalogDriver[] };

export type CareerSeason = {
  year: number;
  position: number | null;
  points: number;
  wins: number;
  final: boolean;
  teams: { id: string; name: string }[];
};

export type DriverScreen = {
  driver: {
    id: string;
    code: string;
    name: string;
    number: number | null;
    active: boolean;
    team_id: string | null;
    team_code: string | null;
    team_name: string | null;
    color: string | null;
  } | null;
  season: number;
  championship: { position: number; points: number; wins: number } | null;
  career: {
    born: string | null;
    nationality: string | null;
    debut_year: number | null;
    debut_race: string | null;
    first_win_year: number | null;
    first_win_race: string | null;
    starts: number;
    wins: number;
    poles: number;
    podiums: number;
    fastest_laps: number;
    seasons: CareerSeason[];
    titles: number[];
    bio: string | null;
    bio_url: string | null;
    updated_at: string;
  } | null;
  teams: Record<string, { code: string; name: string; color: string }>;
};

export const driverKeys = {
  catalog: () => ['screen', 'drivers'] as const,
  one: (id: string) => ['screen', 'driver', id] as const,
};

export async function driversScreen(): Promise<DriversScreen> {
  const { data, error } = await getSupabase().rpc('drivers_screen');
  if (error) throw error;
  return data as unknown as DriversScreen;
}

export async function driverScreen(driver: string): Promise<DriverScreen> {
  const { data, error } = await getSupabase().rpc('driver_screen', { driver });
  if (error) throw error;
  return data as unknown as DriverScreen;
}

/** Страна по национальности из Jolpica (для подписи в профиле пилота). */
const COUNTRY: Record<string, string> = {
  American: 'США', Argentine: 'Аргентина', Argentinian: 'Аргентина', Australian: 'Австралия', Austrian: 'Австрия',
  Belgian: 'Бельгия', Brazilian: 'Бразилия', British: 'Великобритания', Canadian: 'Канада', Chinese: 'Китай',
  Danish: 'Дания', Dutch: 'Нидерланды', Finnish: 'Финляндия', French: 'Франция', German: 'Германия',
  Indian: 'Индия', Italian: 'Италия', Japanese: 'Япония', Mexican: 'Мексика', Monegasque: 'Монако',
  'New Zealander': 'Новая Зеландия', Polish: 'Польша', Russian: 'Россия', Spanish: 'Испания', Swedish: 'Швеция',
  Swiss: 'Швейцария', Thai: 'Таиланд', Venezuelan: 'Венесуэла', Estonian: 'Эстония', Israeli: 'Израиль',
};
export const countryOf = (nationality: string | null | undefined) => (nationality ? (COUNTRY[nationality] ?? nationality) : null);
