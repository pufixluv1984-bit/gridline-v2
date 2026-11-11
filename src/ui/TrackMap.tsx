import { useQuery } from '@tanstack/react-query';
import { hasTrack } from '@/lib/tracks';
import s from './TrackMap.module.css';

// Схема трассы из макета Tracks: каждая трасса — отдельный SVG в public/assets/tracks/,
// грузится только при показе (правило 11). Из файла берём лишь атрибуты d путей и рисуем сами,
// чтобы стилизовать контур и «бегущую точку» как в макете (без вставки чужой разметки).
type Paths = { track: string; bgA?: string; bgB?: string };

async function loadTrack(slug: string): Promise<Paths> {
  const res = await fetch(`${import.meta.env.BASE_URL}assets/tracks/${slug}.svg`);
  if (!res.ok) throw new Error(`track ${slug}: ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const d = (sel: string) => doc.querySelector(sel)?.getAttribute('d') ?? undefined;
  const track = d('path[data-track]');
  if (!track) throw new Error(`track ${slug}: нет контура`);
  return { track, bgA: d('path[data-bg="a"]'), bgB: d('path[data-bg="b"]') };
}

export function TrackMap({ slug, label, i = 0, className = '' }: { slug: string; label: string; i?: number; className?: string }) {
  const q = useQuery({ queryKey: ['track', slug], queryFn: () => loadTrack(slug), staleTime: Infinity, enabled: hasTrack(slug) });
  return (
    <svg className={`${s.svg} ${className}`} viewBox="0 0 360 230" role="img" aria-label={`Схема трассы: ${label}`}>
      {q.data?.bgB && <path d={q.data.bgB} fill="#fff" fillOpacity=".075" />}
      {q.data?.bgA && <path d={q.data.bgA} fill="#fff" fillOpacity=".045" />}
      {q.data && (
        <>
          <path className={s.trk} d={q.data.track} />
          <path className={`${s.trk} ${s.flow}`} pathLength={1000} d={q.data.track} style={{ ['--i' as string]: i }} />
        </>
      )}
    </svg>
  );
}
