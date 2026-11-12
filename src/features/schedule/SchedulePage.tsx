import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { scheduleScreen, screenKeys, type EventInfo, nextDeadline } from '@/lib/api/screens';
import { SESSION_NAMES, formatDateTime, formatRange } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { Countdown, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import p from '@/ui/Page.module.css';

const GRID = '70px minmax(200px,1.2fr) minmax(160px,1fr) 170px 150px';

function status(e: EventInfo, now: number, currentId: number | null) {
  const race = e.sessions.find((s) => s.kind === 'race');
  if (e.status === 'cancelled') return { t: 'Отменён', cls: '' };
  if (e.id === currentId) return { t: nextDeadline(e, now) ? 'Приём открыт' : 'Идёт уик-энд', cls: 'red' };
  if (race && Date.parse(race.starts_at) < now) return { t: 'Завершён', cls: 'green' };
  return { t: 'Впереди', cls: '' };
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
      <PageTitle title="Календарь" sub="Расписание" />
      <Toolbar>
        <PillLink to="/schedule">Расписание</PillLink>
        <PillLink to="/tracks">Трассы</PillLink>
        <PillLink to="/results">Результаты</PillLink>
      </Toolbar>
      <Content>
        {cur && (
          <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between', padding: '28px 32px' }}>
            <div style={{ flex: '1 1 440px' }}>
              <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className={isOpen ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: isOpen ? 'var(--accent)' : '#3a3a42', display: 'inline-block' }} />
                Следующий этап · {cur.round}
              </div>
              <div className="num" style={{ fontSize: 44, fontWeight: 600, margin: '14px 0 6px', letterSpacing: '-.02em' }}>{cur.name}</div>
              <div className="mute" style={{ fontSize: 15 }}>
                {cur.country} · {cur.sessions.length ? formatRange(cur.sessions[0]!.starts_at, cur.sessions[cur.sessions.length - 1]!.starts_at) : ''}
                {cur.deadline ? ` · квалификация ${formatDateTime(cur.deadline)}` : ''}
              </div>
              {next && <div style={{ marginTop: 24 }}><Countdown to={next.at} /></div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                <Link className={p.btn} to="/predict">{isOpen ? 'Сделать прогноз' : 'Мой прогноз'}</Link>
              </div>
            </div>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cur.sessions.map((s) => (
                <div key={s.kind} className="trow" style={{ opacity: Date.parse(s.starts_at) < now ? 0.5 : 1 }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{SESSION_NAMES[s.kind]}</span>
                  {s.kind === 'qualy' && <span className="chip red">Дедлайн</span>}
                  <span className="num mute">{formatDateTime(s.starts_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card rise" style={{ ['--i' as string]: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div className="seg" role="tablist" aria-label="Сезон">
              <button role="tab" type="button" className="on" aria-selected="true">Сезон 2026</button>
              <button role="tab" type="button" disabled title="Календарь 2027 появится, когда его опубликует Jolpica">Сезон 2027</button>
            </div>
            <div className="mute" style={{ fontSize: 13 }}>{events.length ? `${events.length} этапов · время по твоему поясу` : ''}</div>
          </div>
          <div role="table" aria-label="Этапы сезона">
            <div role="row" className="eyebrow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '0 16px 10px' }}>
              <span role="columnheader">Этап</span><span role="columnheader">Гран-при</span><span role="columnheader">Трасса</span>
              <span role="columnheader">Даты</span><span role="columnheader" style={{ textAlign: 'right' }}>Статус</span>
            </div>
            {events.map((e) => {
              const st = status(e, now, q.data?.current_event_id ?? null);
              const first = e.sessions[0]?.starts_at;
              const last = e.sessions[e.sessions.length - 1]?.starts_at;
              const done = st.t === 'Завершён';
              return (
                <div role="row" key={e.id} className={`trow ${e.id === cur?.id ? 'lead' : ''}`} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, opacity: done ? 0.6 : 1 }}>
                  <div role="cell" className="num" style={{ fontSize: 20, fontWeight: 600, color: e.id === cur?.id ? 'var(--accent)' : undefined }}>{e.round}</div>
                  <div role="cell" style={{ fontSize: 16, fontWeight: 600 }}>
                    {done ? <Link to={`/results/${e.id}`}>{e.name}</Link> : e.name}
                    {e.is_sprint && <span className="chip" style={{ marginLeft: 10 }}>Спринт</span>}
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
