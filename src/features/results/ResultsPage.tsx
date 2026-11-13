import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resultsScreen, screenKeys, type ResultRow } from '@/lib/api/screens';
import { lapTime, SESSION_NAMES } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import { t as tr } from '@/i18n';
import { Select } from '@/ui/Select';

const GRID = '60px 56px minmax(200px,1.2fr) minmax(160px,1fr) 170px';
const MEDAL = ['var(--gold)', '#c9c9d0', '#d08a4a'];

/** Итог пилота вместо отрыва по времени (времена в базе не храним). */
type Kind = 'race' | 'qualy' | 'fp3' | 'fp2' | 'fp1';
const KINDS: { k: Kind; t: string; empty: string }[] = [
  { k: 'race', get t() { return SESSION_NAMES.race!; }, get empty() { return tr('res.noRace'); } },
  { k: 'qualy', get t() { return SESSION_NAMES.qualy!; }, get empty() { return tr('res.noQualy'); } },
  { k: 'fp3', get t() { return SESSION_NAMES.fp3!; }, get empty() { return tr('res.noFp', { n: 3 }); } },
  { k: 'fp2', get t() { return SESSION_NAMES.fp2!; }, get empty() { return tr('res.noFp', { n: 2 }); } },
  { k: 'fp1', get t() { return SESSION_NAMES.fp1!; }, get empty() { return tr('res.noFp', { n: 1 }); } },
];

function outcome(r: ResultRow): string {
  if (r.kind === 'fp1' || r.kind === 'fp2' || r.kind === 'fp3') {
    if (r.best_ms == null) return tr('res.noTime');
    return r.position === 1 ? lapTime(r.best_ms) : r.gap_ms != null ? `+${(r.gap_ms / 1000).toFixed(3)}` : lapTime(r.best_ms);
  }
  if (r.kind === 'qualy') return r.position <= 10 ? 'Q3' : r.position <= 16 ? 'Q2' : 'Q1';
  const t = r.position_text ?? '';
  if (t === 'R') return tr('res.dnf');
  if (t === 'D') return tr('res.dsq');
  if (t === 'W' || r.status === 'Did not start') return tr('res.dns');
  const lapped = r.status?.match(/^\+(\d+) Laps?$/);
  if (lapped) return tr('res.lapped', { n: Number(lapped[1]) });
  return tr('res.finished');
}

const driverOf = (r: ResultRow) => ({ code: r.code, number: null, color: r.color ?? '#9a9aa4', team_code: r.team_code ?? '', name: r.name });

/** Макет Results: подиум и классификация. Можно переключить гонку и квалификацию, выбрать прошлый этап. */
export default function ResultsPage() {
  const { ev } = useParams();
  const navigate = useNavigate();
  const evId = ev ? Number(ev) : undefined;
  const q = useQuery({ queryKey: screenKeys.results(evId), queryFn: () => resultsScreen(evId), staleTime: 5 * 60_000 });
  const [kind, setKind] = useState<Kind>('race');

  const data = q.data;
  const rows = (data?.results ?? []).filter((r) => r.kind === kind);
  const has = (k: Kind) => (data?.results ?? []).some((r) => r.kind === k);
  const kindInfo = KINDS.find((x) => x.k === kind)!;
  const podium = rows.slice(0, 3);
  const fastest = (data?.results ?? []).find((r) => r.kind === 'race' && r.fastest_lap_rank === 1);
  const provisional = rows.some((r) => !r.is_final);
  const manual = rows.some((r) => r.source === 'manual');

  return (
    <>
      <PageTitle title={tr('common.calendar')} sub={tr('common.results')} />
      <Toolbar>
        <PillLink to="/schedule">{tr('common.schedule')}</PillLink>
        <PillLink to="/tracks">{tr('common.tracks')}</PillLink>
        <PillLink to="/results">{tr('common.results')}</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="card"><Skeleton h={300} /></div>
        ) : !data?.event ? (
          <div className="empty-state"><h3>{tr('res.none')}</h3><p>{tr('res.noneText')}</p></div>
        ) : (
          <>
            <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">{tr('res.roundKind', { round: data.event.round, kind: kindInfo.t.toLowerCase() })}</div>
                <div className="num" style={{ fontSize: 34, fontWeight: 600, marginTop: 12, letterSpacing: '-.01em' }}>{data.event.name}</div>
                <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>{data.event.circuit} · {data.event.country}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {kind === 'race' && podium[0] && <span className="chip red">{tr('res.win', { name: podium[0].name.split(' ').slice(-1)[0]! })}</span>}
                {kind === 'race' && fastest && <span className="chip">{tr('res.fl', { name: fastest.name.split(' ').slice(-1)[0]! })}</span>}
                {provisional && <span className="chip gold" title={tr('common.provisionalHint')}>{tr('common.provisional')}</span>}
                {manual && <span className="chip">{tr('res.manual')}</span>}
                <Select size="compact" value={data.event.id} onChange={(id) => navigate(`/results/${id}`)} aria-label={tr('res.eventAria')}
                  options={data.events.map((e) => ({ value: e.id, label: `${e.round}. ${e.name}` }))} />
              </div>
            </section>

            <div className="seg" role="tablist" aria-label={tr('res.sessionAria')} style={{ alignSelf: 'flex-start' }}>
              {KINDS.filter((x) => x.k === 'race' || x.k === 'qualy' || has(x.k)).map((x) => (
                <button key={x.k} role="tab" type="button" className={kind === x.k ? 'on' : ''} aria-selected={kind === x.k} disabled={!has(x.k)} onClick={() => setKind(x.k)}>
                  {x.t}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="empty-state"><h3>{kindInfo.empty}</h3><p>{tr('res.soon')}</p></div>
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
                  <h2 className="h">{tr('res.classification')}</h2>
                  <div className="mute" style={{ fontSize: 14, margin: '6px 0 16px' }}>{tr('res.source')}</div>
                  <div role="table" aria-label={tr('res.classification')}>
                    <div role="row" className="eyebrow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '0 16px 10px' }}>
                      <span role="columnheader">{tr('res.pos')}</span><span role="columnheader" /><span role="columnheader">{tr('res.driver')}</span><span role="columnheader">{tr('res.team')}</span>
                      <span role="columnheader" style={{ textAlign: 'right' }}>{kind.startsWith('fp') ? tr('res.bestGap') : tr('res.result')}</span>
                    </div>
                    {rows.map((r) => (
                      <div role="row" key={r.code} className="trow" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14 }}>
                        <div role="cell" className="num" style={{ fontSize: 20, fontWeight: 600 }}>{r.position}</div>
                        <div role="cell"><DriverTile driver={driverOf(r)} size={40} /></div>
                        <div role="cell" style={{ fontSize: 16, fontWeight: 600 }}>
                          {r.name}
                          {r.fastest_lap_rank === 1 && kind === 'race' && <span className="chip" style={{ marginLeft: 10 }}>{tr('common.fastestLap')}</span>}
                        </div>
                        <div role="cell" className="mute" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i style={{ width: 8, height: 8, borderRadius: '50%', background: r.color ?? '#555', display: 'inline-block' }} />
                          {r.team_name}
                        </div>
                        <div role="cell" className="num" style={{ textAlign: 'right', fontSize: 15 }}>{outcome(r)}</div>
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
