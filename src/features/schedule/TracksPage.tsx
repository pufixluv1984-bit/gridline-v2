import { TRACKS } from '@/lib/tracks';
import { TrackMap } from '@/ui/TrackMap';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import s from './Tracks.module.css';

/** Макет Tracks: сетка схем трасс. Каждая схема подгружается отдельным файлом. */
export default function TracksPage() {
  return (
    <>
      <PageTitle title="Календарь" sub="Трассы" />
      <Toolbar>
        <PillLink to="/schedule">Расписание</PillLink>
        <PillLink to="/tracks">Трассы</PillLink>
        <PillLink to="/results">Результаты</PillLink>
      </Toolbar>
      <Content>
        <div className={s.grid}>
          {TRACKS.map((t, i) => (
            <article key={t.id} className={`${s.card} rise`} style={{ ['--i' as string]: Math.min(i, 12) }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span className="h" style={{ fontSize: 17 }}>{t.name}</span>
                <span className="mute" style={{ fontSize: 12 }}>{t.country}</span>
              </div>
              <TrackMap slug={t.id} label={t.name} i={i} />
            </article>
          ))}
        </div>
      </Content>
    </>
  );
}
