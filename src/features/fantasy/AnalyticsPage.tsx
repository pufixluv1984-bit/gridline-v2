import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { fantasyAnalytics, fantasyKeys, pts } from '@/lib/api/fantasy';
import { plural } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs } from './FantasyTabs';

/** Макет Fantasy-Analytics: лучший и средний этап, любимый ×2, штрафы, динамика очков лиги, эффективность пилотов. */
export default function AnalyticsPage() {
  const me = useAuth().session?.user.id;
  const q = useQuery({ queryKey: fantasyKeys.analytics(), queryFn: fantasyAnalytics });
  const [mode, setMode] = useState<'cum' | 'stage'>('cum');
  const data = q.data;
  const mine = useMemo(() => data?.mine ?? [], [data]);
  const best = mine.reduce<(typeof mine)[number] | null>((a, x) => (!a || Number(x.total) > Number(a.total) ? x : a), null);
  const avg = mine.length ? mine.reduce((a, x) => a + Number(x.total), 0) / mine.length : null;
  const drs = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mine) if (x.drs) m.set(x.drs, (m.get(x.drs) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [mine]);
  const drsDriver = drs ? data?.drivers?.find((d) => d.id === drs[0]) : null;
  const spent = mine.reduce((a, x) => a + Number(x.penalty), 0);

  const eff = useMemo(
    () =>
      [...(data?.drivers ?? [])]
        .map((d) => ({ ...d, v: Number(d.season_pts) / Number(d.price) }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 12),
    [data],
  );
  const effMax = Math.max(0.01, ...eff.map((x) => x.v));

  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Аналитика" />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">Изменить состав</Link>} />
      <Content>
        {q.isLoading && <Skeleton h={300} />}
        {data && (
          <>
            <div className="row">
              <Stat i={0} label="Лучший этап" value={best ? pts(best.total) : '—'} note={best ? `этап ${best.round} · ${best.name.replace('Гран-при ', '')}` : 'появится после первого этапа'} />
              <Stat i={1} label="Среднее за этап" value={avg === null ? '—' : pts(Math.round(avg * 10) / 10)} note={`за ${mine.length} ${plural(mine.length, 'этап', 'этапа', 'этапов')}`} />
              <Stat i={2} label="Чаще всего с ×2" value={drsDriver?.code ?? '—'} note={drs ? `${drs[1]} ${plural(drs[1], 'этап', 'этапа', 'этапов')} из ${mine.length}` : 'DRS ещё не ставился'} />
              <Stat i={3} label="Потрачено на трансферы" value={spent ? `−${spent}` : '0'} note={spent ? 'штрафы за лишние замены' : 'ни одной платной замены'} />
            </div>
            <Dynamics data={data.league} me={me} mode={mode} onMode={setMode} />
            <section className="card rise" style={{ ['--i' as string]: 5 }}>
              <h2 className="h">Эффективность пилотов</h2>
              <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>Очки сезона на $1M цены — кто выгоднее всего</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {eff.map((p) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 200px 1fr 80px', alignItems: 'center', gap: 14 }}>
                    <DriverTile driver={{ code: p.code, number: p.number, color: p.color ?? '#3a3a42', team_code: p.team_code ?? '', name: p.name }} size={40} />
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <div style={{ height: 8, borderRadius: 4, background: '#1e1e24', overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${Math.max(0, (p.v / effMax) * 100)}%`, background: p.color ?? 'var(--accent)' }} />
                    </div>
                    <b className="num" style={{ textAlign: 'right' }}>{p.v.toFixed(2)}</b>
                  </div>
                ))}
                {eff.every((x) => x.v === 0) && <div className="mute" style={{ fontSize: 14 }}>Появится после первого этапа с очками.</div>}
              </div>
            </section>
          </>
        )}
      </Content>
    </>
  );
}

function Stat({ i, label, value, note }: { i: number; label: string; value: string; note: string }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: i, flex: '1 1 220px' }}>
      <div className="eyebrow">{label}</div>
      <div className="num" style={{ fontSize: 44, fontWeight: 600, marginTop: 16, lineHeight: 1 }}>{value}</div>
      <div className="mute" style={{ marginTop: 12, fontSize: 14 }}>{note}</div>
    </section>
  );
}

/** Линии очков игроков лиги по этапам (как в макете: сетка, подписи этапов, своя линия толще). */
function Dynamics({ data, me, mode, onMode }: {
  data: { user_id: string; nickname: string; avatar_color: string; round: number; total: number }[];
  me: string | undefined;
  mode: 'cum' | 'stage';
  onMode: (m: 'cum' | 'stage') => void;
}) {
  const rounds = [...new Set(data.map((x) => x.round))].sort((a, b) => a - b);
  const users = [...new Map(data.map((x) => [x.user_id, { id: x.user_id, name: x.nickname, color: x.avatar_color }])).values()];
  const series = users.map((u) => {
    let acc = 0;
    return {
      ...u,
      vals: rounds.map((r) => {
        const v = Number(data.find((x) => x.user_id === u.id && x.round === r)?.total ?? 0);
        acc += v;
        return mode === 'cum' ? acc : v;
      }),
    };
  });
  const all = series.flatMap((x) => x.vals);
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const X = (i: number) => (rounds.length <= 1 ? 515 : 40 + (950 * i) / (rounds.length - 1));
  const Y = (v: number) => 290 - ((v - lo) / (hi - lo || 1)) * 270;
  const grid = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  return (
    <section className="card rise" style={{ ['--i' as string]: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="h">Динамика очков</h2>
          <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{mode === 'cum' ? 'Сумма очков фэнтези-лиги после каждого этапа' : 'Очки каждой команды за этап'}</div>
        </div>
        <div className="seg" role="tablist" aria-label="Режим">
          <button type="button" role="tab" className={mode === 'cum' ? 'on' : ''} onClick={() => onMode('cum')}>Накопительно</button>
          <button type="button" role="tab" className={mode === 'stage' ? 'on' : ''} onClick={() => onMode('stage')}>По этапам</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 18 }}>
        {series.map((l) => (
          <span key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <i style={{ width: 22, height: 4, borderRadius: 2, background: l.color, display: 'inline-block' }} />{l.name}
          </span>
        ))}
      </div>
      {rounds.length === 0 ? (
        <div className="mute" style={{ fontSize: 14, marginTop: 18 }}>График появится после первого этапа фэнтези-лиги.</div>
      ) : (
        <svg viewBox="0 0 1000 320" style={{ width: '100%', height: 'auto', marginTop: 12 }} role="img" aria-label="График очков">
          {grid.map((g) => (
            <g key={g}>
              <line x1="40" x2="990" y1={Y(g)} y2={Y(g)} stroke="rgba(255,255,255,.07)" />
              <text x="0" y={Y(g) + 4} fill="#9a9aa4" fontSize="12" fontFamily="Space Grotesk">{Math.round(g)}</text>
            </g>
          ))}
          {rounds.map((r, i) => (
            <text key={r} x={X(i)} y="312" fill="#9a9aa4" fontSize="12" fontFamily="Space Grotesk" textAnchor="middle">{r}</text>
          ))}
          {series.map((l) => (
            <g key={l.id}>
              <path d={l.vals.map((v, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(v)}`).join(' ')} fill="none" stroke={l.color}
                strokeWidth={l.id === me ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
              {l.vals.length === 1 && <circle cx={X(0)} cy={Y(l.vals[0]!)} r={l.id === me ? 6 : 4} fill={l.color} />}
            </g>
          ))}
        </svg>
      )}
    </section>
  );
}
