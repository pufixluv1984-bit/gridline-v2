import tracks from './tracks.json';

export type TrackInfo = { id: string; name: string; country: string };

/** Трассы из макета Tracks (выгружены scripts/extract-tracks.mjs в public/assets/tracks/). */
export const TRACKS = tracks as TrackInfo[];

const KNOWN = new Set(TRACKS.map((t) => t.id));

/** Есть ли схема трассы для slug этапа. */
export const hasTrack = (slug: string | null | undefined): slug is string => !!slug && KNOWN.has(slug);
