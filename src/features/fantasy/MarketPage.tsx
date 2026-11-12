import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fantasyKeys, fantasySquadScreen, money, pts } from '@/lib/api/fantasy';
import { formatDateTime } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs, IconSwap } from './FantasyTabs';
import { t as tr } from '@/i18n';

type Sort = 'price' | 'season' | 'delta';
const COLS = '56px minmax(180px,1.3fr) 110px 150px 110px 100px 110px 150px';

/** Макет Fantasy-Market: бюджет состава, цены с изменением и причиной, очки, владение в лиге. */
export default function MarketPage() {
  const q = useQuery({ queryKey: fantasyKeys.squad(), queryFn: () => fantasySquadScreen() });
  const [kind, setKind] = useState<'drivers' | 'teams'>('drivers');
  const [sort, setSort] = useState<Sort>('price');
  const data = q.data;
  const squad = useMemo(() => data?.squad ?? (data?.base ? { ...data.base, chip: null } : null), [data]);
  const inSquad = useMemo(() => new Set([...(squad?.drivers ?? []), ...(squad?.teams ?? [])]), [squad]);

  const rows = useMemo(() => {
    const list = kind === 'drivers' ? (data?.market.drivers ?? []) : (data?.market.teams ?? []);
    const key = (x: (typeof list)[number]) => (sort === 'price' ? Number(x.price) : sort === 'season' ? Number(x.season_pts) : Number(x.delta));
    return [...list].sort((a, b) => key(b) - key(a));
  }, [data, kind, sort]);

  const used = squad
    ? squad.drivers.reduce((a, id) => a + Number(data!.market.drivers.find((d) => d.id === id)?.price ?? 0), 0) +
      squad.teams.reduce((a, id) => a + Number(data!.market.teams.find((t) => t.id === id)?.price ?? 0), 0)
    : 0;
  const budget = data?.rules.budget ?? 100;
  const outs = data?.market.drivers.filter((d) => d.out && d.sub && squad?.drivers.includes(d.id)) ?? [];

  return (
    <>
      <PageTitle title={tr('fan.title')} sub={tr('fan.tab.market')} />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">{tr('fan.editSquad')}</Link>} />
      <Content>
        {q.isLoading && <Skeleton h={300} />}
        {data && !data.event && (
          <div className="empty-state"><h3>{tr('fan.mk.closed')}</h3><p>{tr('fan.mk.closedText')}</p></div>
        )}
        {data?.event && (
          <>
            <section className="card rise" style={{ ['--i' as string]: 0, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                <Kpi label={tr('fan.sq.budget')} value={money(used)} suffix={` / ${money(budget)}`} />
                <Kpi label={tr('fan.mk.free')} value={money(budget - used)} color={used > budget ? 'var(--neg)' : undefined} />
                <Kpi label={tr('fan.sq.drivers')} value={String(squad?.drivers.length ?? 0)} suffix=" / 5" />
                <Kpi label={tr('fan.sq.teams')} value={String(squad?.teams.length ?? 0)} suffix=" / 2" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
                <div style={{ height: 8, borderRadius: 4, background: '#1e1e24', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${Math.min(100, (used / budget) * 100)}%`, background: 'var(--accent)' }} />
                </div>
                <div className="mute" style={{ fontSize: 13 }}>
                  {tr('fan.mk.line', { free: data.base ? data.free_before : tr('fan.mk.unlimited'), p: data.rules.transfer_penalty, at: formatDateTime(data.lock_at) })}
                </div>
              </div>
            </section>

            <section className="card rise" style={{ ['--i' as string]: 1 }}>
              {outs.map((d) => (
                <div key={d.id} className="sbn" style={{ marginBottom: 18 }}>
                  <span className="ic"><IconSwap /></span>
                  <div style={{ flex: '1 1 280px' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{tr('fan.mk.subTitle', { round: data.event!.round })}</div>
                    <div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                      {tr('fan.mk.subText', { sub: data.market.drivers.find((x) => x.id === d.sub)?.name, name: d.name, team: d.team_name })}
                    </div>
                  </div>
                  <Link className="mini go" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>{tr('fan.mk.openSquad')}</Link>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div className="seg" role="tablist" aria-label={tr('fan.mk.type')}>
                  <button type="button" role="tab" className={kind === 'drivers' ? 'on' : ''} onClick={() => setKind('drivers')}>{tr('fan.sq.drivers')}</button>
                  <button type="button" role="tab" className={kind === 'teams' ? 'on' : ''} onClick={() => setKind('teams')}>{tr('fan.sq.teams')}</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mute" style={{ fontSize: 13 }}>{tr('fan.mk.sort')}</span>
                  <div className="seg" role="tablist" aria-label={tr('fan.mk.sort')}>
                    <button type="button" role="tab" className={sort === 'price' ? 'on' : ''} onClick={() => setSort('price')}>{tr('fan.sq.price')}</button>
                    <button type="button" role="tab" className={sort === 'season' ? 'on' : ''} onClick={() => setSort('season')}>{tr('fan.mk.seasonPts')}</button>
                    <button type="button" role="tab" className={sort === 'delta' ? 'on' : ''} onClick={() => setSort('delta')}>{tr('fan.mk.rise')}</button>
                  </div>
                </div>
              </div>
              <div className="eyebrow" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '0 16px 10px' }}>
                <span /><span>{kind === 'drivers' ? tr('fan.mk.driver') : tr('fan.sq.constructor')}</span>
                <span style={{ textAlign: 'right' }}>{tr('fan.sq.price')}</span><span style={{ textAlign: 'right' }}>{tr('fan.mk.change')}</span>
                <span style={{ textAlign: 'right' }}>{tr('fan.mk.seasonPts')}</span><span style={{ textAlign: 'right' }}>{tr('fan.mk.lastRound')}</span>
                <span style={{ textAlign: 'right' }}>{tr('fan.mk.inLeague')}</span><span />
              </div>
              {rows.map((r) => {
                const d = kind === 'drivers' ? data.market.drivers.find((x) => x.id === r.id) : null;
                const delta = Number(r.delta);
                const mine = inSquad.has(r.id);
                return (
                  <div key={r.id} className={`trow ${mine ? 'me' : ''}`} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14 }} title={r.reason ?? undefined}>
                    {d ? (
                      <DriverTile driver={{ code: d.code, number: d.number, color: d.color ?? '#3a3a42', team_code: d.team_code ?? '', name: d.name }} size={44} />
                    ) : (
                      <span style={{ width: 44, height: 44, borderRadius: 12, background: r.color ?? '#3a3a42', opacity: 0.85 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{r.name}</div>
                      <div className="mute" style={{ fontSize: 13, marginTop: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <i style={{ width: 8, height: 8, borderRadius: '50%', background: r.color ?? '#3a3a42', display: 'inline-block' }} />
                        {d ? d.team_name : tr('fan.sq.constructor')}
                        {d?.out && <span className="tagw">{tr('fan.mk.notRacing')}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>{money(r.price)}</div>
                      {r.target != null && (
                        <div className="num mute" style={{ fontSize: 12, marginTop: 3 }} title={tr('fan.mk.targetHint')}>
                          {tr('fan.mk.target', { m: money(r.target) })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <PriceSpark history={r.history} />
                      <span className={`num ${delta > 0 ? 'mv up' : delta < 0 ? 'mv dn' : 'mv eq'}`} style={{ fontSize: 15 }}>
                        {delta > 0 ? `+${delta.toFixed(1)}` : delta < 0 ? delta.toFixed(1) : '—'}
                      </span>
                    </div>
                    <div className="num" style={{ textAlign: 'right', fontSize: 16 }}>{pts(r.season_pts)}</div>
                    <div className="num mute" style={{ textAlign: 'right', fontSize: 15 }}>{Number(r.last_pts) > 0 ? '+' : ''}{pts(r.last_pts)}</div>
                    <div className="mute" style={{ textAlign: 'right', fontSize: 14 }}>{r.owned == null ? '—' : tr('fan.mk.ofLeague', { n: r.owned, size: data.market.league_size })}</div>
                    <div style={{ textAlign: 'right' }}>
                      {mine ? <span className="chip green">{tr('fan.mk.inSquad')}</span> : <Link className="mini" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>{tr('fan.mk.toSquad')}</Link>}
                    </div>
                  </div>
                );
              })}
              <div className="mute" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
                {tr('fan.mk.note')}
              </div>
            </section>
          </>
        )}
      </Content>
    </>
  );
}

function Kpi({ label, value, suffix, color }: { label: string; value: string; suffix?: string; color?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="num" style={{ fontSize: 36, fontWeight: 600, marginTop: 12, color }}>
        {value}
        {suffix && <span className="mute" style={{ fontSize: 18, fontWeight: 500 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/** Мини-график цены по этапам сезона (последние 12). Точные цифры — в подсказке и для экранного диктора. */
function PriceSpark({ history }: { history?: { round: number; price: number }[] }) {
  const pts = (history ?? []).slice(-12);
  if (pts.length < 2) return <span style={{ width: 64 }} aria-hidden="true" />;
  const w = 64;
  const h = 22;
  const ps = pts.map((x) => Number(x.price));
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const span = hi - lo || 1;
  const xy = ps.map((p, i) => [(i / (ps.length - 1)) * (w - 4) + 2, h - 3 - ((p - lo) / span) * (h - 6)] as const);
  const up = ps[ps.length - 1]! >= ps[0]!;
  const color = up ? 'var(--pos)' : 'var(--neg)';
  const last = xy[xy.length - 1]!;
  const label = tr('fan.mk.spark', { list: pts.map((x) => `${x.round}: $${Number(x.price).toFixed(1)}M`).join(', ') });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ flex: 'none' }}>
      <title>{label}</title>
      <polyline
        points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
    </svg>
  );
}
