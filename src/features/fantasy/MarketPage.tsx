import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fantasyKeys, fantasySquadScreen, money, pts } from '@/lib/api/fantasy';
import { formatDateTime } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs, IconSwap } from './FantasyTabs';

type Sort = 'price' | 'season' | 'delta';
const COLS = '56px minmax(180px,1.3fr) 110px 120px 110px 100px 110px 150px';

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
  const lastRound = data?.event ? data.event.round - 1 : null;

  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Рынок" />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">Изменить состав</Link>} />
      <Content>
        {q.isLoading && <Skeleton h={300} />}
        {data && !data.event && (
          <div className="empty-state"><h3>Рынок закрыт</h3><p>Цены появятся перед ближайшим этапом с фэнтези.</p></div>
        )}
        {data?.event && (
          <>
            <section className="card rise" style={{ ['--i' as string]: 0, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                <Kpi label="Бюджет" value={money(used)} suffix={` / ${money(budget)}`} />
                <Kpi label="Свободно" value={money(budget - used)} color={used > budget ? 'var(--neg)' : undefined} />
                <Kpi label="Пилоты" value={String(squad?.drivers.length ?? 0)} suffix=" / 5" />
                <Kpi label="Конструкторы" value={String(squad?.teams.length ?? 0)} suffix=" / 2" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
                <div style={{ height: 8, borderRadius: 4, background: '#1e1e24', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${Math.min(100, (used / budget) * 100)}%`, background: 'var(--accent)' }} />
                </div>
                <div className="mute" style={{ fontSize: 13 }}>
                  Бесплатных замен: {data.base ? data.free_before : 'без ограничений (первая сборка)'} · каждая следующая −{data.rules.transfer_penalty} очков · закрытие — {formatDateTime(data.lock_at)}
                </div>
              </div>
            </section>

            <section className="card rise" style={{ ['--i' as string]: 1 }}>
              {outs.map((d) => (
                <div key={d.id} className="sbn" style={{ marginBottom: 18 }}>
                  <span className="ic"><IconSwap /></span>
                  <div style={{ flex: '1 1 280px' }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>В заявке этапа {data.event!.round} замена</div>
                    <div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                      {data.market.drivers.find((x) => x.id === d.sub)?.name} вместо {d.name} ({d.team_name}). Если не замените сами до закрытия, очки резервиста засчитаются автоматически. Замена бесплатная.
                    </div>
                  </div>
                  <Link className="mini go" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>Открыть состав</Link>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div className="seg" role="tablist" aria-label="Тип">
                  <button type="button" role="tab" className={kind === 'drivers' ? 'on' : ''} onClick={() => setKind('drivers')}>Пилоты</button>
                  <button type="button" role="tab" className={kind === 'teams' ? 'on' : ''} onClick={() => setKind('teams')}>Конструкторы</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mute" style={{ fontSize: 13 }}>Сортировка</span>
                  <div className="seg" role="tablist" aria-label="Сортировка">
                    <button type="button" role="tab" className={sort === 'price' ? 'on' : ''} onClick={() => setSort('price')}>Цена</button>
                    <button type="button" role="tab" className={sort === 'season' ? 'on' : ''} onClick={() => setSort('season')}>Очки сезона</button>
                    <button type="button" role="tab" className={sort === 'delta' ? 'on' : ''} onClick={() => setSort('delta')}>Рост цены</button>
                  </div>
                </div>
              </div>
              <div className="eyebrow" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '0 16px 10px' }}>
                <span /><span>{kind === 'drivers' ? 'Пилот' : 'Конструктор'}</span>
                <span style={{ textAlign: 'right' }}>Цена</span><span style={{ textAlign: 'right' }}>Изменение</span>
                <span style={{ textAlign: 'right' }}>Очки сезона</span><span style={{ textAlign: 'right' }}>{lastRound ? `Этап ${lastRound}` : 'Прошлый этап'}</span>
                <span style={{ textAlign: 'right' }}>В лиге</span><span />
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
                        {d ? d.team_name : 'Конструктор'}
                        {d?.out && <span className="tagw">не едет на этапе</span>}
                      </div>
                    </div>
                    <div className="num" style={{ textAlign: 'right', fontSize: 17, fontWeight: 600 }}>{money(r.price)}</div>
                    <div className={`num ${delta > 0 ? 'mv up' : delta < 0 ? 'mv dn' : 'mv eq'}`} style={{ textAlign: 'right', fontSize: 15 }}>
                      {delta > 0 ? `+${delta.toFixed(1)}` : delta < 0 ? delta.toFixed(1) : '—'}
                    </div>
                    <div className="num" style={{ textAlign: 'right', fontSize: 16 }}>{pts(r.season_pts)}</div>
                    <div className="num mute" style={{ textAlign: 'right', fontSize: 15 }}>{Number(r.last_pts) > 0 ? '+' : ''}{pts(r.last_pts)}</div>
                    <div className="mute" style={{ textAlign: 'right', fontSize: 14 }}>{r.owned == null ? '—' : `${r.owned} из ${data.market.league_size}`}</div>
                    <div style={{ textAlign: 'right' }}>
                      {mine ? <span className="chip green">В составе</span> : <Link className="mini" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>В состав</Link>}
                    </div>
                  </div>
                );
              })}
              <div className="mute" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
                Цены меняются после каждого этапа по очкам на миллион за последние 3 этапа: от −0.6 до +0.6 у недорогих, от −0.3 до +0.3 у дорогих (пилот от $18M, конструктор от $20M). «В лиге» — по составам прошлого закрытого этапа.
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
