import { currentLocale } from '@/i18n';
import { regionName } from '@/i18n/region';
import tracks from './tracks.json';

type TrackRow = { id: string; name: string; name_uk: string; name_en: string; cc: string };
export type TrackInfo = { id: string; name: string; country: string };

/** Трассы из макета Tracks (выгружены scripts/extract-tracks.mjs в public/assets/tracks/); название и страна на языке сайта. */
export const TRACKS: TrackInfo[] = (tracks as TrackRow[]).map((r) => ({
  id: r.id,
  get name() {
    const l = currentLocale();
    return l === 'uk' ? r.name_uk : l === 'en' ? r.name_en : r.name;
  },
  get country() {
    return regionName(r.cc);
  },
}));

const KNOWN = new Set(TRACKS.map((t) => t.id));

/** Есть ли схема трассы для slug этапа. */
export const hasTrack = (slug: string | null | undefined): slug is string => !!slug && KNOWN.has(slug);
