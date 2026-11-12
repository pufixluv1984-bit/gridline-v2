import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { weatherIcon, weekday } from '@/features/home/weather';
import { chipOf, CHIPS, fantasyKeys, fantasyLeaderboard, money, pts, type LeaderboardScreen } from '@/lib/api/fantasy';
import { hasTrack } from '@/lib/tracks';
import { useServerNow } from '@/lib/time/useServerNow';
import { Avatar, Countdown, DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import { TrackMap } from '@/ui/TrackMap';
import pg from '@/ui/Page.module.css';
import { FantasyTabs } from './FantasyTabs';
import s from './Fantasy.module.css';
import { lineText } from './lines';

/** Макет Fantasy-Leaderboard: ближайший этап, лидер, лучший этап, таблица лиги с составами и разбором. */
export default function LeaderboardPage() {
  const [league, setLeague] = useState<string | null>(null);
  const q = useQuery({ queryKey: fantasyKeys.leaderboard(league), queryFn: () => fantasyLeaderboard(league) });
  const data = q.data;

  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Лидерборд" />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">Изменить состав</Link>} />
      <Content>
        {q.isLoading && <Skeleton h={300} />}
        {data && <NextEvent data={data} />}
        {data && !data.league && (
          <div className="empty-state">
            <h3>Нет лиги с фэнтези</h3>
            <p>Состав можно собрать и без лиги, а чтобы соревноваться — создай лобби в режиме «Фэнтези» или «Оба» и позови друзей.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link className="mini go" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>Собрать состав</Link>
              <Link className="mini" to="/lobby/create" style={{ display: 'inline-flex', alignItems: 'center' }}>Создать лобби</Link>
            </div>
          </div>
        )}
        {data?.league && <Table data={data} onLeague={setLeague} />}
      </Content>
    </>
  );
}

function NextEvent({ data }: { data: LeaderboardScreen }) {
  const now = useServerNow();
  const ev = data.event;
  if (!ev) return null;
  const open = !!data.lock_at && Date.parse(data.lock_at) > now;
  return (
    <section className="card rise" style={{ ['--i' as string]: 0 }}>
      <div className={s.ctx}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="eyebrow">Этап {ev.round}{ev.season_rounds ? ` из ${ev.season_rounds}` : ''}</span>
            <span className={`chip ${open ? 'green' : ''}`}>{open ? 'Составы открыты' : 'Составы закрыты'}</span>
          </div>
          <div className="h" style={{ fontSize: 26, letterSpacing: '-.02em' }}>{ev.name}</div>
          {open && data.lock_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="eyebrow">Дедлайн составов</span>
              <Countdown to={data.lock_at} small />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }} aria-label="Прогноз погоды на уик-энд">
          {(data.weather ?? []).slice(0, 3).map((w) => (
            <div key={w.day} className={s.wx}>
              <span aria-hidden="true">{weatherIcon(w.code)}</span>
              <div>
                <div className="eyebrow">{weekday(w.day)}</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 5 }}>
                  {Math.round(w.t_max)}°<span className="mute" style={{ fontSize: 11, marginLeft: 6 }}>{Math.round(w.wind_max)} км/ч</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', maxWidth: 250 }}>
          {hasTrack(ev.slug) && <TrackMap slug={ev.slug} label={ev.name} />}
        </div>
      </div>
    </section>
  );
}

function Table({ data, onLeague }: { data: LeaderboardScreen; onLeague: (id: string) => void }) {
  const me = useAuth().session?.user.id;
  const [view, setView] = useState<'total' | 'stage'>('total');
  const [chip, setChip] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const table = useMemo(() => data.table ?? [], [data]);
  const squads = useMemo(() => new Map((data.squads ?? []).map((x) => [x.user_id, x])), [data]);
  const lastRound = data.last_event?.round;
  const drv = data.assets?.drivers ?? {};
  const teams = data.teams ?? {};

  // Сдвиг места за этап: место по сумме без последнего этапа.
  const prevRank = useMemo(() => {
    const before = new Map<string, number>();
    for (const r of table) {
      const last = (data.per_event ?? []).find((x) => x.user_id === r.user_id && x.round === lastRound)?.total ?? 0;
      before.set(r.user_id, Number(r.points) - Number(last));
    }
    const sorted = [...before.entries()].sort((a, b) => b[1] - a[1]);
    return new Map(sorted.map(([u], i) => [u, i + 1]));
  }, [table, data, lastRound]);

  const rows = useMemo(() => {
    let list = table.map((r) => ({ r, sq: squads.get(r.user_id), main: view === 'total' ? Number(r.points) : Number(squads.get(r.user_id)?.total ?? 0) }));
    if (chip) list = list.filter((x) => x.sq?.chip === chip);
    list.sort((a, b) => b.main - a.main || a.r.rank - b.r.rank);
    return list;
  }, [table, squads, view, chip]);
  const leader = rows[0]?.main ?? 0;
  const lead = table[0];
  const best = [...(data.squads ?? [])].sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))[0];
  const bestRow = best && table.find((t) => t.user_id === best.user_id);
  const played = (data.squads ?? []).filter((x) => x.chip);
  const name = (r: { team_name: string | null; nickname: string }) => r.team_name || r.nickname;

  return (
    <>
      <div className="row">
        <div className={`card rise ${s.stat}`} style={{ ['--i' as string]: 1 }}>
          <span className="eyebrow">Лидер лиги</span>
          {lead && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar nickname={lead.nickname} color={lead.avatar_color} />
              <div style={{ minWidth: 0 }}><div className="h">{name(lead)}</div><div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{lead.nickname}</div></div>
              <div className="num" style={{ marginLeft: 'auto', fontSize: 26, fontWeight: 600 }}>{pts(lead.points)}</div>
            </div>
          )}
        </div>
        <div className={`card rise ${s.stat}`} style={{ ['--i' as string]: 2 }}>
          <span className="eyebrow">Лучший этап {lastRound ?? ''}</span>
          {bestRow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar nickname={bestRow.nickname} color={bestRow.avatar_color} />
              <div style={{ minWidth: 0 }}><div className="h">{name(bestRow)}</div><div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{bestRow.nickname}</div></div>
              <div className="num" style={{ marginLeft: 'auto', fontSize: 26, fontWeight: 600 }}>+{pts(best!.total)}</div>
            </div>
          ) : <span className="mute">Очков ещё нет</span>}
        </div>
        <div className={`card rise ${s.stat}`} style={{ ['--i' as string]: 3 }}>
          <span className="eyebrow">Чипов сыграно на этапе</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 26, fontWeight: 600 }}>{played.length}</span>
            <span className="mute" style={{ fontSize: 13 }}>из {table.length} команд</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{played.map((x) => <span key={x.user_id} className="code act">{chipOf(x.chip)?.code}</span>)}</span>
          </div>
        </div>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 4, padding: '22px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="h">{data.league!.name}</span>
            {(data.leagues?.length ?? 0) > 1 && (
              <select className="mini" value={data.league!.id} onChange={(e) => onLeague(e.target.value)} aria-label="Лига">
                {data.leagues!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <div className="seg" role="tablist" aria-label="Зачёт">
              <button type="button" role="tab" className={view === 'total' ? 'on' : ''} onClick={() => setView('total')}>Общий зачёт</button>
              <button type="button" role="tab" className={view === 'stage' ? 'on' : ''} disabled={!lastRound} onClick={() => setView('stage')}>Этап {lastRound ?? ''}</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} aria-label="Фильтр по чипу">
            <span className="eyebrow" style={{ marginRight: 4 }}>Чип на этапе</span>
            <button type="button" className={`${s.fchip} ${chip === null ? s.on : ''}`} onClick={() => setChip(null)}>Все<em>{table.length}</em></button>
            {CHIPS.filter((c) => played.some((x) => x.chip === c.id)).map((c) => (
              <button key={c.id} type="button" className={`${s.fchip} ${chip === c.id ? s.on : ''}`} aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>
                {c.code}<em>{played.filter((x) => x.chip === c.id).length}</em>
              </button>
            ))}
          </div>
        </div>

        <div className={s.lbHead} aria-hidden="true">
          <span>#</span><span>Команда</span><span>Состав этапа {lastRound ?? ''}</span>
          <span className={s.hc}>Чип</span><span className={`${s.rt} ${s.hc}`}>Этап {lastRound ?? ''}</span>
          <span className={s.rt}>{view === 'total' ? 'Всего' : 'Очки'}</span><span className={`${s.rt} ${s.hc}`}>Цена</span><span />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-live="polite">
          {rows.map(({ r, sq, main }, i) => {
            const rank = view === 'total' && !chip ? r.rank : i + 1;
            const mv = view === 'total' && !chip && lastRound ? (prevRank.get(r.user_id) ?? rank) - rank : null;
            const isOpen = open === r.user_id;
            const delta = sq?.cost_next != null ? Number(sq.cost_next) - Number(sq.cost) : null;
            return (
              <div key={r.user_id} className={`${s.lbItem} ${isOpen ? s.open : ''} ${r.user_id === me ? s.me : ''}`}>
                <button type="button" className={s.lbRow} onClick={() => setOpen(isOpen ? null : r.user_id)} aria-expanded={isOpen}>
                  <div className={s.rk}>
                    <b style={{ color: rank === 1 && main > 0 ? 'var(--gold)' : undefined }}>{rank}</b>
                    {mv !== null && <span className={`mv ${mv > 0 ? 'up' : mv < 0 ? 'dn' : 'eq'}`}>{mv > 0 ? `▲ ${mv}` : mv < 0 ? `▼ ${-mv}` : '—'}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <Avatar nickname={r.nickname} color={r.avatar_color} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(r)}</div>
                      <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{r.nickname}</div>
                    </div>
                  </div>
                  <div className={s.lineup}>
                    {sq ? (
                      <>
                        {sq.drivers.map((id) => {
                          const d = drv[id];
                          const boosted = sq.drs === id;
                          return (
                            <span key={id} className={boosted ? s.boostPh : ''} style={{ position: 'relative' }} title={d?.name ?? id}>
                              <DriverTile driver={{ code: d?.code ?? '?', number: d?.number ?? null, color: d?.color ?? '#3a3a42', team_code: d?.team_code ?? '', name: d?.name }} size={40} />
                              {boosted && <i className={s.b2}>×{sq.chip === 'extra_drs' ? 3 : 2}</i>}
                            </span>
                          );
                        })}
                        {sq.teams.map((t) => (
                          <span key={t} className={s.cc} title={teams[t]?.name}><i style={{ background: teams[t]?.color }} />{teams[t]?.code}</span>
                        ))}
                      </>
                    ) : <span className="mute" style={{ fontSize: 13 }}>Состав появится после закрытия этапа</span>}
                  </div>
                  <div className={s.hc}>{sq?.chip ? <span className="chip red" title={chipOf(sq.chip)?.name}>{chipOf(sq.chip)?.code}</span> : <span className="mute">—</span>}</div>
                  <div className={`${s.rt} ${s.hc} num`} style={{ fontSize: 18, fontWeight: 600 }}>
                    {sq?.total != null ? pts(sq.total) : '—'}
                    {sq?.penalty ? <div className="mute" style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }}>−{sq.penalty} замены</div> : null}
                  </div>
                  <div className={`${s.rt} num`} style={{ fontSize: 20, fontWeight: 600 }}>
                    {pts(main)}
                    <div className="mute" style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }}>{main === leader ? 'лидер' : `−${pts(leader - main)}`}</div>
                  </div>
                  <div className={`${s.rt} ${s.hc} num`} style={{ fontSize: 15, fontWeight: 600 }}>
                    {sq ? money(sq.cost) : '—'}
                    {delta !== null && <div className={`mv ${delta > 0 ? 'up' : delta < 0 ? 'dn' : 'eq'}`} style={{ marginTop: 3 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</div>}
                  </div>
                  <span className={s.chv} aria-hidden="true">▾</span>
                </button>
                {isOpen && sq && (
                  <div className={s.det}>
                    <div className={s.dgrid}>
                      {(sq.details ?? []).filter((x) => x.slot === 'driver').map((x) => {
                        const d = drv[x.actual ?? x.asset] ?? drv[x.asset];
                        return (
                          <div key={x.asset} className={`${s.dcard} ${x.mult > 1 ? s.boost : ''}`}>
                            <DriverTile driver={{ code: d?.code ?? '?', number: d?.number ?? null, color: d?.color ?? '#3a3a42', team_code: d?.team_code ?? '', name: d?.name }} size={118} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d?.name}</div>
                                {x.actual && x.actual !== x.asset && <div className="tagw" style={{ marginTop: 3 }}>вместо {drv[x.asset]?.name}</div>}
                              </div>
                              <span className="code">{d?.code}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                              <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{pts(x.points * x.mult)}</span>
                              <span className="mute" style={{ fontSize: 12 }}>{x.mult > 1 ? `${pts(x.points)} ×${x.mult}` : ''}</span>
                            </div>
                            <div className="mute" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{lineText(x.lines)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {(sq.details ?? []).filter((x) => x.slot === 'team').map((x) => (
                        <div key={x.asset} className="tile">
                          <div className="mute" style={{ fontSize: 13 }}>{teams[x.asset]?.name} · конструктор</div>
                          <b>{pts(x.points)}</b>
                          <div className="mute" style={{ fontSize: 12, marginTop: 6 }}>{lineText(x.lines)}</div>
                        </div>
                      ))}
                      <div className="tile"><div className="mute" style={{ fontSize: 13 }}>Замены на этапе</div><b>{sq.transfers}</b></div>
                      <div className="tile"><div className="mute" style={{ fontSize: 13 }}>Остаток бюджета</div><b>{money(100 - Number(sq.cost))}</b></div>
                      <div className="tile"><div className="mute" style={{ fontSize: 13 }}>Штраф за замены</div><b>{sq.penalty ? `−${sq.penalty}` : '0'}</b></div>
                      <div className="tile"><div className="mute" style={{ fontSize: 13 }}>Чип</div><b>{chipOf(sq.chip)?.name ?? '—'}</b></div>
                    </div>
                    {sq.provisional && <div className="mute" style={{ fontSize: 12.5 }}>Очки предварительные: возможны штрафы после финиша (48 часов).</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
