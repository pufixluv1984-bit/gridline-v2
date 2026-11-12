import { TRACKS } from '@/lib/tracks';
import { TrackMap } from '@/ui/TrackMap';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import s from './Tracks.module.css';
import { t } from '@/i18n';

/** Макет Tracks: сетка схем трасс. Каждая схема подгружается отдельным файлом. */
export default function TracksPage() {
  return (
    <>
      <PageTitle title={t('common.calendar')} sub={t('common.tracks')} />
      <Toolbar>
        <PillLink to="/schedule">{t('common.schedule')}</PillLink>
        <PillLink to="/tracks">{t('common.tracks')}</PillLink>
        <PillLink to="/results">{t('common.results')}</PillLink>
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
