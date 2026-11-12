import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { scheduleScreen, screenKeys, type EventInfo, nextDeadline } from '@/lib/api/screens';
import { SESSION_NAMES, formatDateTime, formatRange } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { Countdown, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import p from '@/ui/Page.module.css';
import { t } from '@/i18n';

const GRID = '70px minmax(200px,1.2fr) minmax(160px,1fr) 170px 150px';

function status(e: EventInfo, now: number, currentId: number | null) {
  const race = e.sessions.find((s) => s.kind === 'race');
  if (e.status === 'cancelled') return { t: t('sched.cancelled'), cls: '' };
  if (e.id === currentId) return { t: nextDeadline(e, now) ? t('sched.open') : t('sched.live'), cls: 'red' };
  if (race && Date.parse(race.starts_at) < now) return { t: t('sched.done'), cls: 'green' };
  return { t: t('sched.ahead'), cls: '' };
}

/** Макет Schedule: следующий этап с таймером и таблица этапов сезона. Сезон 2027 — когда появится в Jolpica. */
export default function SchedulePage() {
  const q = useQuery({ queryKey: screenKeys.schedule(), queryFn: scheduleScreen, staleTime: 10 * 60_000 });
  const now = useServerNow();
  const events = q.data?.events ?? [];
  const cur = events.find((e) => e.id === q.data?.current_event_id) ?? null;
  const next = nextDeadline(cur, now);
  const isOpen = !!next;

  return (
    <>
      <PageTitle title={t('common.calendar')} sub={t('common.schedule')} />
      <Toolbar>
        <PillLink to="/schedule">{t('common.schedule')}</PillLink>
        <PillLink to="/tracks">{t('common.tracks')}</PillLink>
        <PillLink to="/results">{t('common.results')}</PillLink>
      </Toolbar>
      <Content>
        {cur && (
          <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between', padding: '28px 32px' }}>
            <div style={{ flex: '1 1 440px' }}>
              <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className={isOpen ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: isOpen ? 'var(--accent)' : '#3a3a42', display: 'inline-block' }} />
                {t('sched.nextRound', { round: cur.round })}
              </div>
              <div className="num" style={{ fontSize: 44, fontWeight: 600, margin: '14px 0 6px', letterSpacing: '-.02em' }}>{cur.name}</div>
              <div className="mute" style={{ fontSize: 15 }}>
                {cur.country} · {cur.sessions.length ? formatRange(cur.sessions[0]!.starts_at, cur.sessions[cur.sessions.length - 1]!.starts_at) : ''}
                {cur.deadline ? t('sched.qualyAt', { at: formatDateTime(cur.deadline) }) : ''}
              </div>
              {next && <div style={{ marginTop: 24 }}><Countdown to={next.at} /></div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                <Link className={p.btn} to="/predict">{isOpen ? t('common.makePrediction') : t('common.myPrediction')}</Link>
              </div>
            </div>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cur.sessions.map((s) => (
                <div key={s.kind} className="trow" style={{ opacity: Date.parse(s.starts_at) < now ? 0.5 : 1 }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{SESSION_NAMES[s.kind]}</span>
                  {s.kind === 'qualy' && <span className="chip red">{t('common.deadline')}</span>}
                  <span className="num mute">{formatDateTime(s.starts_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card rise" style={{ ['--i' as string]: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div className="seg" role="tablist" aria-label={t('sched.seasonAria')}>
              <button role="tab" type="button" className="on" aria-selected="true">{t('common.season', { year: 2026 })}</button>
              <button role="tab" type="button" disabled title={t('sched.next2027')}>{t('common.season', { year: 2027 })}</button>
            </div>
            <div className="mute" style={{ fontSize: 13 }}>{events.length ? t('sched.count', { n: events.length }) : ''}</div>
          </div>
          <div role="table" aria-label={t('sched.tableAria')}>
            <div role="row" className="eyebrow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '0 16px 10px' }}>
              <span role="columnheader">{t('sched.round')}</span><span role="columnheader">{t('sched.gp')}</span><span role="columnheader">{t('sched.circuit')}</span>
              <span role="columnheader">{t('sched.dates')}</span><span role="columnheader" style={{ textAlign: 'right' }}>{t('sched.status')}</span>
            </div>
            {events.map((e) => {
              const st = status(e, now, q.data?.current_event_id ?? null);
              const first = e.sessions[0]?.starts_at;
              const last = e.sessions[e.sessions.length - 1]?.starts_at;
              const done = st.cls === 'green';
              return (
                <div role="row" key={e.id} className={`trow ${e.id === cur?.id ? 'lead' : ''}`} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, opacity: done ? 0.6 : 1 }}>
                  <div role="cell" className="num" style={{ fontSize: 20, fontWeight: 600, color: e.id === cur?.id ? 'var(--accent)' : undefined }}>{e.round}</div>
                  <div role="cell" style={{ fontSize: 16, fontWeight: 600 }}>
                    {done ? <Link to={`/results/${e.id}`}>{e.name}</Link> : e.name}
                    {e.is_sprint && <span className="chip" style={{ marginLeft: 10 }}>{t('common.sprint')}</span>}
                  </div>
                  <div role="cell" className="mute" style={{ fontSize: 15 }}>{e.circuit}</div>
                  <div role="cell" className="num" style={{ fontSize: 15 }}>{first && last ? formatRange(first, last) : '—'}</div>
                  <div role="cell" style={{ textAlign: 'right' }}><span className={`chip ${st.cls}`}>{st.t}</span></div>
                </div>
              );
            })}
            {q.isLoading && <Skeleton h={400} />}
          </div>
        </section>
      </Content>
    </>
  );
}
