import { getSupabase } from '../supabase';
import { regionName } from '@/i18n/region';
import type { Locale } from '@/i18n/locale';

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

export type DriversScreen = { season: number; drivers: CatalogDriver[]; prices?: Record<string, number> };

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
    bio_uk?: string | null;
    bio_url_uk?: string | null;
    bio_en?: string | null;
    bio_url_en?: string | null;
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

/** ISO-код страны по национальности из Jolpica; название страны даёт Intl на языке сайта. */
const COUNTRY: Record<string, string> = {
  American: 'US', Argentine: 'AR', Argentinian: 'AR', Australian: 'AU', Austrian: 'AT', Belgian: 'BE', Brazilian: 'BR',
  British: 'GB', Canadian: 'CA', Chinese: 'CN', Danish: 'DK', Dutch: 'NL', Finnish: 'FI', French: 'FR', German: 'DE',
  Indian: 'IN', Italian: 'IT', Japanese: 'JP', Mexican: 'MX', Monegasque: 'MC', 'New Zealander': 'NZ', Polish: 'PL',
  Russian: 'RU', Spanish: 'ES', Swedish: 'SE', Swiss: 'CH', Thai: 'TH', Venezuelan: 'VE', Estonian: 'EE', Israeli: 'IL',
};
export function countryOf(nationality: string | null | undefined): string | null {
  if (!nationality) return null;
  const code = COUNTRY[nationality];
  return code ? regionName(code) : nationality;
}

type Career = NonNullable<DriverScreen['career']>;
const BIO_ORDER: Record<Locale, Locale[]> = { uk: ['uk', 'en', 'ru'], ru: ['ru', 'en', 'uk'], en: ['en', 'ru', 'uk'] };

/** Биография на языке сайта; если статьи на нём нет — на ближайшем из остальных. */
export function careerBio(c: Career | null | undefined, l: Locale): { text: string; url: string | null; lang: Locale } | null {
  if (!c) return null;
  for (const x of BIO_ORDER[l]) {
    const text = x === 'ru' ? c.bio : x === 'uk' ? c.bio_uk : c.bio_en;
    const url = x === 'ru' ? c.bio_url : x === 'uk' ? c.bio_url_uk : c.bio_url_en;
    if (text) return { text, url: url ?? null, lang: x };
  }
  return null;
}
