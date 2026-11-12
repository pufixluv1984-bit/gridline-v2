import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import type { LeagueScreen } from '@/lib/api/screens';
import { plural } from '@/lib/time/format';
import { Avatar, Skeleton } from '@/ui/game';
import { avatarOf } from '@/lib/avatar';

type Period = 'season' | 'stage' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'season', label: 'Сезон' },
  { id: 'stage', label: 'Этап' },
  { id: 'all', label: 'Всё время' },
];
const COLS = '70px minmax(200px,1.2fr) 110px 140px 140px 120px';

/** Равные очки делят место (как rank() в базе). */
function ranked<T extends { main: number }>(xs: T[]): (T & { rank: number })[] {
  const sorted = [...xs].sort((a, b) => b.main - a.main);
  let rank = 0;
  return sorted.map((x, i) => {
    if (i === 0 || sorted[i - 1]!.main !== x.main) rank = i + 1;
    return { ...x, rank };
  });
}

/**
 * Таблица лиги (макет League) и PRODUCT §6: сдвиг места за этап, форма за 5 этапов,
 * виды «Сезон / Этап / Всё время», звания сезона.
 */
export function StandingsCard({ data, me }: { data: LeagueScreen | undefined; me: string | undefined }) {
  const [period, setPeriod] = useState<Period>('season');
  const [card, setCard] = useState<string | null>(null);
  const table = useMemo(() => data?.table ?? [], [data]);
  const rounds = useMemo(() => data?.rounds ?? [], [data]);
  const lastRound = rounds.at(-1);
  const formRounds = rounds.slice(-5);

  const byUser = useMemo(() => {
    const m = new Map<string, Map<number, number>>();
    for (const x of data?.per_event ?? []) {
      if (!m.has(x.user_id)) m.set(x.user_id, new Map());
      m.get(x.user_id)!.set(x.round, x.points);
    }
    return m;
  }, [data]);
  const formMax = Math.max(
    1,
    ...(data?.per_event ?? []).filter((x) => formRounds.some((r) => r.round === x.round)).map((x) => x.points),
  );

  const rows = useMemo(() => {
    const prev = new Map((data?.prev_ranks ?? []).map((x) => [x.user_id, x.rank]));
    const all = new Map((data?.all_time ?? []).map((x) => [x.user_id, x]));
    const base = table.map((r) => {
      if (period === 'stage') {
        const stage = lastRound ? (byUser.get(r.user_id)?.get(lastRound.round) ?? 0) : 0;
        return { r, main: stage, second: r.points, mv: null as number | null };
      }
      if (period === 'all') {
        const a = all.get(r.user_id);
        return { r, main: a?.points ?? r.points, second: a?.exact_hits ?? r.exact_hits, mv: null };
      }
      const before = prev.get(r.user_id);
      return { r, main: r.points, second: r.last_points, mv: before ? before - r.rank : null };
    });
    if (period === 'season') return base.map((x) => ({ ...x, rank: x.r.rank }));
    return ranked(base);
  }, [table, period, byUser, lastRound, data]);

  const leader = rows[0]?.main ?? 0;
  const headers: Record<Period, [string, string]> = {
    season: ['Очки сезона', 'Последний этап'],
    stage: [lastRound ? `Этап ${lastRound.round}` : 'Этап', 'Очки сезона'],
    all: ['За всё время', 'Точных'],
  };
  const titles = data?.titles;
  const titleTiles = [
    { key: 'sniper', name: 'Снайпер', t: titles?.sniper, unit: (v: number) => `${v} ${plural(v, 'точное попадание', 'точных попадания', 'точных попаданий')}` },
    { key: 'best_stage', name: 'Лучший этап', t: titles?.best_stage, unit: (v: number) => `${v} ${plural(v, 'очко', 'очка', 'очков')}` },
    { key: 'survivor', name: 'Выживший', t: titles?.survivor, unit: (v: number) => `${v} ${plural(v, 'этап', 'этапа', 'этапов')} подряд с очками` },
  ];

  return (
    <section className="card rise" style={{ ['--i' as string]: 1 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="seg" role="tablist" aria-label="Игра">
            {data?.league.mode && data.league.mode !== 'predict' ? (
              <Link role="tab" to="/fantasy" style={{ height: 36, padding: '0 16px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', color: 'var(--mute)', fontSize: 14, fontWeight: 500 }}>Фэнтези</Link>
            ) : (
              <button role="tab" type="button" disabled title="В этой лиге только прогнозы">Фэнтези</button>
            )}
            <button role="tab" type="button" className="on" aria-selected="true">Прогнозы</button>
          </div>
          <div className="seg" role="tablist" aria-label="Период">
            {PERIODS.map((x) => (
              <button
                key={x.id}
                role="tab"
                type="button"
                className={period === x.id ? 'on' : ''}
                aria-selected={period === x.id}
                onClick={() => setPeriod(x.id)}
                disabled={x.id === 'stage' && !lastRound}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mute" style={{ fontSize: 13 }}>
          {period === 'season' && 'При равенстве: точные попадания → выигранные этапы → последний этап'}
          {period === 'stage' && lastRound && `Только последний этап: ${lastRound.name}`}
          {period === 'all' && 'Все этапы всех сезонов, бонусы — по правилам этой лиги'}
        </div>
      </div>
      <div role="table" aria-label="Таблица лиги">
        <div role="row" className="eyebrow" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '0 16px 10px' }}>
          <span role="columnheader">Место</span>
          <span role="columnheader">Игрок</span>
          <span role="columnheader">Форма</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>{headers[period][0]}</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>{headers[period][1]}</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>Отрыв</span>
        </div>
        {rows.map(({ r, main, second, mv, rank }) => (
          <div role="row" key={r.user_id} className={`trow ${r.user_id === me ? 'me' : ''}`} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: rank === 1 && main > 0 ? 'var(--gold)' : undefined }}>{rank}</span>
              {mv !== null && (
                <span className={`mv ${mv > 0 ? 'up' : mv < 0 ? 'dn' : 'eq'}`} title="Сдвиг за последний этап">
                  {mv > 0 ? `▲ ${mv}` : mv < 0 ? `▼ ${-mv}` : '—'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button type="button" onClick={() => setCard(r.user_id)} aria-label={`Карточка игрока ${r.nickname}`}
                style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', borderRadius: '50%' }}>
                <Avatar {...avatarOf(r)} />
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  <Link to={r.user_id === me ? '/profile' : `/profile/${r.user_id}`}>{r.nickname}</Link>
                  {r.points > 0 && (
                    <Link to={`/breakdown?player=${r.user_id}`} className="mute" style={{ fontSize: 12, fontWeight: 500, marginLeft: 10, textDecoration: 'underline' }}>
                      разбор
                    </Link>
                  )}
                </div>
                <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                  точных {r.exact_hits} · этапов выиграно {r.events_won}
                  {r.provisional ? ' · предварительно' : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 30 }} title="Форма за 5 этапов">
              {formRounds.map((fr, i) => {
                const v = byUser.get(r.user_id)?.get(fr.round);
                return (
                  <i
                    key={fr.round}
                    title={`${fr.name}: ${v === undefined ? 'не в лиге' : v}`}
                    style={{
                      display: 'block',
                      width: 10,
                      minHeight: 3,
                      height: `${Math.round(((v ?? 0) / formMax) * 100)}%`,
                      borderRadius: 3,
                      background: v === undefined ? 'transparent' : i === formRounds.length - 1 ? 'var(--accent)' : '#3a3a44',
                      border: v === undefined ? '1px dashed rgba(255,255,255,.18)' : 0,
                    }}
                  />
                );
              })}
            </div>
            <div className="num" style={{ textAlign: 'right', fontSize: 20, fontWeight: 600 }}>{main}</div>
            <div className="num mute" style={{ textAlign: 'right', fontSize: 16 }}>{period === 'season' ? `+${second}` : second}</div>
            <div className="num" style={{ textAlign: 'right', fontSize: 15 }}>{main === leader ? '—' : `−${leader - main}`}</div>
          </div>
        ))}
        {!data && <Skeleton h={120} />}
        {data && table.every((r) => r.points === 0) && (
          <div className="mute" style={{ fontSize: 14, padding: '14px 16px 0' }}>Очки появятся после первого этапа лиги — примерно через час после финиша гонки.</div>
        )}
      </div>
      {titleTiles.some((x) => x.t) && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div className="eyebrow">Звания сезона</div>
          <div className="row" style={{ marginTop: 12, gap: 12 }}>
            {titleTiles.map((x) => (
              <div key={x.key} className="tile">
                <div className="mute" style={{ fontSize: 13 }}>{x.name}</div>
                {x.t ? (
                  <>
                    <b style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar {...avatarOf(x.t)} size={28} />
                      {x.t.nickname}
                    </b>
                    <div className="mute" style={{ fontSize: 13, marginTop: 6 }}>
                      {x.unit(x.t.value)}
                      {x.t.event ? ` · ${x.t.event}` : ''}
                    </div>
                  </>
                ) : (
                  <b className="mute">—</b>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {card && data && <PlayerCard data={data} userId={card} me={me} byUser={byUser} onClose={() => setCard(null)} />}
    </section>
  );
}

/** Макет Overlays, карточка игрока: место, очки, лучший этап, очный счёт по этапам с тобой. */
function PlayerCard({ data, userId, me, byUser, onClose }: {
  data: LeagueScreen;
  userId: string;
  me: string | undefined;
  byUser: Map<string, Map<number, number>>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const r = data.table.find((x) => x.user_id === userId);
  const mine = data.table.find((x) => x.user_id === me);
  if (!r) return null;
  const theirs = byUser.get(userId) ?? new Map<number, number>();
  const mineMap = (me && byUser.get(me)) || new Map<number, number>();
  const best = Math.max(0, ...theirs.values());
  let a = 0;
  let c = 0;
  for (const round of new Set([...theirs.keys(), ...mineMap.keys()])) {
    const x = mineMap.get(round) ?? 0;
    const y = theirs.get(round) ?? 0;
    if (x > y) a++;
    else if (y > x) c++;
  }
  const total = a + c || 1;
  const self = userId === me;
  return (
    <Modal
      title={r.nickname}
      icon={<Avatar {...avatarOf(r)} size={64} />}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onClose}>Закрыть</button>
          <button type="button" className={`${b.cta} ${b.sm}`} onClick={() => navigate(self ? '/profile' : `/profile/${userId}`)}>Профиль</button>
        </>
      }
    >
      <div className="mute" style={{ fontSize: 13, marginTop: -8 }}>{r.rank} место в лиге · точных {r.exact_hits}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="tile"><span className="eyebrow">Очки</span><b>{r.points}</b></div>
        <div className="tile"><span className="eyebrow">Лучший этап</span><b>{best}</b></div>
        <div className="tile"><span className="eyebrow">Этапов выиграно</span><b>{r.events_won}</b></div>
      </div>
      {!self && mine && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><b>Ты</b><b>{r.nickname}</b></div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#1e1e24', gap: 3 }}>
            <i style={{ display: 'block', width: `${(a / total) * 100}%`, background: mine.avatar_color }} />
            <i style={{ display: 'block', width: `${(c / total) * 100}%`, background: r.avatar_color }} />
          </div>
          <div className="help">Очный счёт по этапам: {a} — {c}</div>
        </div>
      )}
    </Modal>
  );
}
