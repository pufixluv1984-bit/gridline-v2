import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { chipOf, fantasyKeys, fantasyResults, pts, type ScoreDetail } from '@/lib/api/fantasy';
import { formatRange } from '@/lib/time/format';
import { Avatar, DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs } from './FantasyTabs';
import { lineText } from './lines';
import s from './Fantasy.module.css';
import { avatarOf } from '@/lib/avatar';

/** Макет Fantasy-Results: итог этапа, мой состав по слотам, команды лиги, лучшие пилоты этапа. */
export default function ResultsPage() {
  const [ev, setEv] = useState<number | undefined>(undefined);
  const me = useAuth().session?.user.id;
  const q = useQuery({ queryKey: fantasyKeys.results(ev), queryFn: () => fantasyResults(ev) });
  const data = q.data;
  const e = data?.event;
  const drivers = new Map((data?.drivers ?? []).map((d) => [d.id, d]));
  const teams = new Map((data?.teams ?? []).map((t) => [t.id, t]));
  const top = (data?.drivers ?? []).slice(0, 10);
  const max = Math.max(1, ...top.map((d) => Number(d.points)));
  const best = data?.league?.[0];

  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Результаты этапа" />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">Изменить состав</Link>} />
      <Content>
        {q.isLoading && <Skeleton h={300} />}
        {data && !e && <div className="empty-state"><h3>Результатов пока нет</h3><p>Очки фэнтези появятся примерно через час после финиша гонки.</p></div>}
        {e && (
          <>
            <section className="card rise" style={{ ['--i' as string]: 0, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="eyebrow">Этап {e.round} · {data?.mine?.provisional ? 'очки предварительные' : 'завершён'}</div>
                <div className="num" style={{ fontSize: 34, fontWeight: 600, marginTop: 12, letterSpacing: '-.01em' }}>{e.name}</div>
                <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>{e.circuit}{e.sessions.length ? ` · ${formatRange(e.sessions[0]!.starts_at, e.sessions.at(-1)!.starts_at)}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {best && <span className="chip red">Лучший состав: {best.team_name || best.nickname} · {pts(best.total)}</span>}
                {data?.winner && <span className="chip">Победитель гонки: {data.winner.name}</span>}
                {(data?.events?.length ?? 0) > 1 && (
                  <select className="mini" value={e.id} onChange={(x) => setEv(Number(x.target.value))} aria-label="Этап">
                    {data!.events!.map((x) => <option key={x.id} value={x.id}>Этап {x.round} · {x.name.replace('Гран-при ', '')}</option>)}
                  </select>
                )}
              </div>
            </section>

            <div className="row">
              {data?.mine && (
                <section className="card rise" style={{ ['--i' as string]: 1, flex: '1 1 560px' }}>
                  <SquadCard title="Мой состав" total={data.mine.total} penalty={data.mine.penalty} chip={data.mine.chip} details={data.mine.details} drivers={drivers} teams={teams} />
                </section>
              )}
              <section className="card rise" style={{ ['--i' as string]: 2, flex: '1 1 480px' }}>
                <h2 className="h">Команды лиги</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
                  {(data?.league ?? []).map((r, i) => (
                    <div key={r.user_id} className={`trow ${r.user_id === me ? 'me' : ''}`}>
                      <span className="num" style={{ fontSize: 22, fontWeight: 600, width: 30, color: i === 0 ? 'var(--gold)' : undefined }}>{i + 1}</span>
                      <Avatar {...avatarOf(r)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{r.team_name || r.nickname}</div>
                        <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                          {r.nickname}{r.drs ? ` · ×2 ${drivers.get(r.drs)?.code ?? ''}` : ''}{r.chip ? ` · ${chipOf(r.chip)?.name}` : ''}
                        </div>
                      </div>
                      <b className="num" style={{ fontSize: 20 }}>{pts(r.total)}</b>
                    </div>
                  ))}
                  {data?.league?.length === 0 && <div className="mute" style={{ fontSize: 14 }}>Нет лиги с фэнтези — здесь появятся составы друзей.</div>}
                </div>
              </section>
            </div>

            <section className="card rise" style={{ ['--i' as string]: 3 }}>
              <h2 className="h">Лучшие пилоты этапа</h2>
              <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>Очки за этап без множителей</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {top.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 200px 1fr 64px', alignItems: 'center', gap: 14 }} title={lineText(p.lines)}>
                    <DriverTile driver={{ code: p.code, number: p.number ?? null, color: p.color ?? '#3a3a42', team_code: p.team_code ?? '', name: p.name }} size={40} />
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <div style={{ height: 8, borderRadius: 4, background: '#1e1e24', overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${Math.max(0, (Number(p.points) / max) * 100)}%`, background: p.color ?? 'var(--accent)' }} />
                    </div>
                    <b className="num" style={{ textAlign: 'right' }}>{pts(p.points)}</b>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </Content>
    </>
  );
}

function SquadCard({ title, total, penalty, chip, details, drivers, teams }: {
  title: string;
  total: number;
  penalty: number;
  chip: string | null;
  details: ScoreDetail[];
  drivers: Map<string, { name: string; code: string; number?: number | null; color: string | null; team_code?: string | null }>;
  teams: Map<string, { name: string; code: string; color: string | null }>;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
          <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{chip ? `Чип: ${chipOf(chip)?.name}` : 'Без чипа'}</div>
        </div>
        <div className={s.rt}>
          <div className="num" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1 }}>{Number(total) >= 0 ? '+' : ''}{pts(total)}</div>
          <div className="mute" style={{ fontSize: 12, marginTop: 6 }}>{penalty ? `штраф за замены −${penalty}` : 'без штрафов'}</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {details.map((x) => {
          if (x.slot === 'team') {
            const t = teams.get(x.asset);
            return (
              <div key={x.asset} className="kv" style={{ padding: '9px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={s.cc}><i style={{ background: t?.color ?? '#3a3a42' }} />{t?.code ?? x.asset}</span>
                  <span>{t?.name ?? x.asset}<span className="mute" style={{ fontSize: 12, marginLeft: 8 }}>{lineText(x.lines)}</span></span>
                </span>
                <b className="num">{pts(x.points)}</b>
              </div>
            );
          }
          const d = drivers.get(x.actual ?? x.asset) ?? drivers.get(x.asset);
          return (
            <div key={x.asset} className="kv" style={{ padding: '9px 0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className={x.mult > 1 ? s.boostPh : ''} style={{ position: 'relative' }}>
                  <DriverTile driver={{ code: d?.code ?? '?', number: d?.number ?? null, color: d?.color ?? '#3a3a42', team_code: d?.team_code ?? '', name: d?.name }} size={40} />
                  {x.mult > 1 && <i className={s.b2}>×{x.mult}</i>}
                </span>
                <span style={{ minWidth: 0 }}>
                  {d?.name ?? x.asset}
                  {x.actual && x.actual !== x.asset && <span className="tagw" style={{ marginLeft: 8 }}>вместо {drivers.get(x.asset)?.name ?? x.asset}</span>}
                  <span className="mute" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{lineText(x.lines) || 'без очков'}</span>
                </span>
              </span>
              <b className="num">{pts(x.points * x.mult)}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
