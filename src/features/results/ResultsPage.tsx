import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resultsScreen, screenKeys, type ResultRow } from '@/lib/api/screens';
import { plural } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';

const GRID = '60px 56px minmax(200px,1.2fr) minmax(160px,1fr) 170px';
const MEDAL = ['var(--gold)', '#c9c9d0', '#d08a4a'];

/** Итог пилота вместо отрыва по времени (времена в базе не храним). */
function outcome(r: ResultRow): string {
  if (r.kind === 'qualy') return r.position <= 10 ? 'Q3' : r.position <= 16 ? 'Q2' : 'Q1';
  const t = r.position_text ?? '';
  if (t === 'R') return 'Сход';
  if (t === 'D') return 'Дисквалификация';
  if (t === 'W' || r.status === 'Did not start') return 'Не стартовал';
  const lapped = r.status?.match(/^\+(\d+) Laps?$/);
  if (lapped) return `+${lapped[1]} ${plural(Number(lapped[1]), 'круг', 'круга', 'кругов')}`;
  return 'Финиш';
}

const driverOf = (r: ResultRow) => ({ code: r.code, number: null, color: r.color ?? '#9a9aa4', team_code: r.team_code ?? '', name: r.name });

/** Макет Results: подиум и классификация. Можно переключить гонку и квалификацию, выбрать прошлый этап. */
export default function ResultsPage() {
  const { ev } = useParams();
  const navigate = useNavigate();
  const evId = ev ? Number(ev) : undefined;
  const q = useQuery({ queryKey: screenKeys.results(evId), queryFn: () => resultsScreen(evId), staleTime: 5 * 60_000 });
  const [kind, setKind] = useState<'race' | 'qualy'>('race');

  const data = q.data;
  const rows = (data?.results ?? []).filter((r) => r.kind === kind);
  const has = (k: 'race' | 'qualy') => (data?.results ?? []).some((r) => r.kind === k);
  const podium = rows.slice(0, 3);
  const fastest = (data?.results ?? []).find((r) => r.kind === 'race' && r.fastest_lap_rank === 1);
  const provisional = rows.some((r) => !r.is_final);
  const manual = rows.some((r) => r.source === 'manual');

  return (
    <>
      <PageTitle title="Календарь" sub="Результаты" />
      <Toolbar>
        <PillLink to="/schedule">Расписание</PillLink>
        <PillLink to="/tracks">Трассы</PillLink>
        <PillLink to="/results">Результаты</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="card"><Skeleton h={300} /></div>
        ) : !data?.event ? (
          <div className="empty-state"><h3>Результатов пока нет</h3><p>Они появятся примерно через час после финиша первой гонки.</p></div>
        ) : (
          <>
            <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">Этап {data.event.round} · {kind === 'race' ? 'гонка' : 'квалификация'}</div>
                <div className="num" style={{ fontSize: 34, fontWeight: 600, marginTop: 12, letterSpacing: '-.01em' }}>{data.event.name}</div>
                <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>{data.event.circuit} · {data.event.country}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {kind === 'race' && podium[0] && <span className="chip red">Победа: {podium[0].name.split(' ').slice(-1)[0]}</span>}
                {kind === 'race' && fastest && <span className="chip">Быстрый круг: {fastest.name.split(' ').slice(-1)[0]}</span>}
                {provisional && <span className="chip gold" title="48 часов после гонки возможны штрафы стюардов">Предварительно</span>}
                {manual && <span className="chip">Введено вручную</span>}
                <select className="in" style={{ height: 40, width: 'auto', padding: '0 40px 0 14px', backgroundPosition: 'calc(100% - 22px) 17px, calc(100% - 16px) 17px' }} value={data.event.id} onChange={(e) => navigate(`/results/${e.target.value}`)} aria-label="Этап">
                  {data.events.map((e) => <option key={e.id} value={e.id}>{e.round}. {e.name}</option>)}
                </select>
              </div>
            </section>

            <div className="seg" role="tablist" aria-label="Сессия" style={{ alignSelf: 'flex-start' }}>
              <button role="tab" type="button" className={kind === 'race' ? 'on' : ''} aria-selected={kind === 'race'} disabled={!has('race')} onClick={() => setKind('race')}>Гонка</button>
              <button role="tab" type="button" className={kind === 'qualy' ? 'on' : ''} aria-selected={kind === 'qualy'} disabled={!has('qualy')} onClick={() => setKind('qualy')}>Квалификация</button>
            </div>

            {rows.length === 0 ? (
              <div className="empty-state"><h3>{kind === 'race' ? 'Гонки ещё не было' : 'Квалификации ещё не было'}</h3><p>Результат появится примерно через час после сессии.</p></div>
            ) : (
              <>
                <div className="row">
                  {podium.map((r, i) => (
                    <section key={r.code} className="card rise" style={{ ['--i' as string]: 1 + i, flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, paddingTop: 28, background: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${r.color ?? '#555'} 30%, transparent), transparent 70%), linear-gradient(180deg,#121216,#0d0d10)` }}>
                      <div className="num" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1, color: MEDAL[i] }}>{r.position}</div>
                      <DriverTile driver={driverOf(r)} size={132} />
                      <div><div style={{ fontSize: 20, fontWeight: 600 }}>{r.name}</div><div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{r.team_name}</div></div>
                      <span className="chip">{outcome(r)}</span>
                    </section>
                  ))}
                </div>
                <section className="card rise" style={{ ['--i' as string]: 4 }}>
                  <h2 className="h">Классификация</h2>
                  <div className="mute" style={{ fontSize: 14, margin: '6px 0 16px' }}>Данные Jolpica F1 API</div>
                  <div role="table" aria-label="Классификация">
                    <div role="row" className="eyebrow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '0 16px 10px' }}>
                      <span role="columnheader">Место</span><span role="columnheader" /><span role="columnheader">Пилот</span><span role="columnheader">Команда</span>
                      <span role="columnheader" style={{ textAlign: 'right' }}>Итог</span>
                    </div>
                    {rows.map((r) => (
                      <div role="row" key={r.code} className="trow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14 }}>
                        <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>{r.position}</div>
                        <DriverTile driver={driverOf(r)} size={40} />
                        <div style={{ fontSize: 16, fontWeight: 600 }}>
                          {r.name}
                          {r.fastest_lap_rank === 1 && kind === 'race' && <span className="chip" style={{ marginLeft: 10 }}>Быстрый круг</span>}
                        </div>
                        <div className="mute" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i style={{ width: 8, height: 8, borderRadius: '50%', background: r.color ?? '#555', display: 'inline-block' }} />
                          {r.team_name}
                        </div>
                        <div className="num" style={{ textAlign: 'right', fontSize: 15 }}>{outcome(r)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </Content>
    </>
  );
}
