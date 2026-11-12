import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { breakdownScreen, screenKeys, type BreakdownScreen, type Driver, type ScoreKind } from '@/lib/api/screens';
import { useServerNow } from '@/lib/time/useServerNow';
import { Avatar, DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import { avatarOf } from '@/lib/avatar';
import { t, type Key } from '@/i18n';
import { SESSION_NAMES } from '@/lib/time/format';

// Разбор этапа: каждое начисление — строка score_lines с причиной (docs/PRODUCT.md §2).
// Отдельного макета нет — собран из элементов Predict и Results.
const REASON_KEYS: Record<ScoreKind, Key> = {
  qualy_exact: 'bd.qualyExact',
  sprint_exact: 'bd.sprintExact',
  race_exact: 'predict.r.exact',
  race_off1: 'predict.r.off1',
  race_off2: 'predict.r.off2',
  race_in_top10: 'predict.r.inTop',
  race_podium: 'predict.r.podium',
  fastest_lap: 'predict.r.fl',
  first_dnf: 'predict.r.dnf',
  pole_wins: 'predict.r.poleWin',
  safety_car: 'predict.r.sc',
  dnf_many: 'bd.dnfCount',
};
/** Причина строки очков на языке сайта. */
const REASON = new Proxy({} as Record<ScoreKind, string>, { get: (_, k) => (typeof k === 'string' && k in REASON_KEYS ? t(REASON_KEYS[k as ScoreKind]) : undefined) });

const yn = (v: boolean | null | undefined) => (v == null ? '—' : v ? t('bd.yes') : t('bd.no'));

export default function BreakdownPage() {
  const { ev } = useParams();
  const [params] = useSearchParams();
  const player = params.get('player') ?? undefined;
  const navigate = useNavigate();
  const evId = ev ? Number(ev) : undefined;
  const q = useQuery({ queryKey: screenKeys.breakdown(evId, player), queryFn: () => breakdownScreen(evId, player) });
  const d = q.data;

  return (
    <>
      <PageTitle title={t('predict.title')} sub={t('bd.sub')} />
      <Toolbar>
        <PillLink to="/predict">{t('predict.sub')}</PillLink>
        <PillLink to="/breakdown">{t('bd.sub')}</PillLink>
        <PillLink to="/league">{t('common.friendsLeague')}</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="card"><Skeleton h={320} /></div>
        ) : q.error || !d?.event ? (
          <div className="empty-state"><h3>{t('bd.none')}</h3><p>{t('bd.noneText')}</p></div>
        ) : (
          <Body d={d} onEvent={(id) => navigate(`/breakdown/${id}${player ? `?player=${player}` : ''}`)} />
        )}
      </Content>
    </>
  );
}

function Body({ d, onEvent }: { d: BreakdownScreen; onEvent: (id: number) => void }) {
  const now = useServerNow();
  const byId = new Map(d.drivers.map((x) => [x.id, x]));
  const pos = new Map(d.race.map((r) => [r.driver_id, r]));
  const lines = d.lines;
  const total = lines.reduce((s, l) => s + l.points * l.multiplier, 0);
  const block = (b: 'qualy' | 'sprint' | 'race' | 'bonus') => lines.filter((l) => l.block === b).reduce((s, l) => s + l.points * l.multiplier, 0);
  const lineFor = (kind: ScoreKind | ScoreKind[], slot = 0) =>
    lines.find((l) => (Array.isArray(kind) ? kind.includes(l.kind) : l.kind === kind) && l.slot === slot);
  const p = d.prediction;
  const provisional = lines.some((l) => l.provisional);
  const boost = p?.boost_block ?? null;
  const name = (id: string | null | undefined) => (id === 'none' ? t('bd.nobody') : id ? byId.get(id)?.name ?? id : '—');

  const firstDnfActual = (() => {
    const dnfs = d.race.filter((r) => r.dnf);
    if (!d.race.length) return '—';
    if (!dnfs.length) return t('bd.nobody');
    const min = Math.min(...dnfs.map((r) => r.laps ?? 0));
    return dnfs.filter((r) => (r.laps ?? 0) === min).map((r) => name(r.driver_id)).join(', ');
  })();
  const dnfCount = d.race.filter((r) => r.dnf).length;
  const fastest = d.race.find((r) => r.fastest)?.driver_id;
  const pole = d.qualy[0];
  const winner = d.race.find((r) => r.position === 1)?.driver_id;

  return (
    <>
      <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {d.player && <Avatar {...avatarOf(d.player)} size={56} />}
          <div>
            <div className="eyebrow">{t('bd.roundPlayer', { round: d.event!.round, name: d.player?.nickname ?? '' })}</div>
            <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 10 }}>{d.event!.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {provisional && <span className="chip gold" title={t('common.provisionalHint')}>{t('common.provisional')}</span>}
          {boost && <span className="chip red">{t('bd.boost', { block: boost === 'qualy' ? t('bd.boostQualy') : boost === 'race' ? t('bd.boostRace') : t('bd.boostBonus') })}</span>}
          <div className="num" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>+{total}</div>
          {d.events.length > 1 && (
            <select className="in" style={{ height: 40, width: 'auto', padding: '0 40px 0 14px', backgroundPosition: 'calc(100% - 22px) 17px, calc(100% - 16px) 17px' }} value={d.event!.id} onChange={(e) => onEvent(Number(e.target.value))} aria-label={t('res.eventAria')}>
              {d.events.map((e) => <option key={e.id} value={e.id}>{e.round}. {e.name}</option>)}
            </select>
          )}
        </div>
      </section>

      {!p ? (
        <div className="empty-state">
          <h3>{t('bd.noPrediction')}</h3>
          <p>{t('bd.noPredictionText')} {d.event!.deadline && Date.parse(d.event!.deadline) > now ? t('bd.hiddenUntil') : ''}</p>
          <Link className="mini go" to="/predict">{t('bd.toPredict')}</Link>
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Block title={SESSION_NAMES.qualy!} points={block('qualy')} boosted={boost === 'qualy'} i={1}>
            {(p.qualy ?? []).map((id, k) => {
              const l = lineFor('qualy_exact', k + 1);
              const actual = d.qualy[k];
              return <Row key={k} label={[t('predict.slot.pole'), 'P2', 'P3'][k]!} driver={byId.get(id) ?? null} note={actual ? t('bd.fact', { name: name(actual) }) : t('bd.noResult')} line={l ? { text: REASON[l.kind], pts: l.points, mult: l.multiplier } : null} />;
            })}
          </Block>
          {p.sprint && (
            <Block title={SESSION_NAMES.sprint!} points={block('sprint')} boosted={false} i={1}>
              {p.sprint.map((id, k) => {
                const l = lineFor('sprint_exact', k + 1);
                const actual = d.sprint?.[k];
                return <Row key={k} label={['P1', 'P2', 'P3'][k]!} driver={byId.get(id) ?? null} note={actual ? t('bd.fact', { name: name(actual) }) : t('bd.noResult')} line={l ? { text: REASON[l.kind], pts: l.points, mult: l.multiplier } : null} />;
              })}
            </Block>
          )}
          <Block title={t('bd.raceTop10')} points={block('race')} boosted={boost === 'race'} i={2}>
            {(p.race ?? []).map((id, k) => {
              const l = lineFor(['race_exact', 'race_off1', 'race_off2', 'race_in_top10'], k + 1);
              const r = pos.get(id);
              const note = !d.race.length ? t('bd.noResult') : !r ? t('bd.notClassified') : r.dnf ? t('bd.dnfAt', { n: r.position }) : t('bd.finishAt', { n: r.position });
              return <Row key={k} label={`P${k + 1}`} driver={byId.get(id) ?? null} note={note} line={l ? { text: REASON[l.kind], pts: l.points, mult: l.multiplier } : null} />;
            })}
            {(() => {
              const l = lineFor('race_podium');
              return l ? <Row label="★" driver={null} note={t('bd.podiumAll')} line={{ text: REASON.race_podium, pts: l.points, mult: l.multiplier }} /> : null;
            })()}
          </Block>
          <Block title={t('bd.bonuses')} points={block('bonus')} boosted={boost === 'bonus'} i={3}>
            <Bonus label={t('predict.r.fl')} guess={name(p.fastest_lap)} fact={fastest ? name(fastest) : '—'} line={lineFor('fastest_lap')} />
            <Bonus label={t('predict.r.dnf')} guess={name(p.first_dnf)} fact={firstDnfActual} line={lineFor('first_dnf')} />
            <Bonus label={t('bd.poleWins')} guess={yn(p.pole_wins)} fact={pole && winner ? yn(pole === winner) : '—'} line={lineFor('pole_wins')} />
            <Bonus label="Safety car" guess={yn(p.safety_car)} fact={yn(d.safety_car)} line={lineFor('safety_car')} />
            <Bonus label={t('predict.r.dnf2')} guess={yn(p.dnf_many)} fact={d.race.length ? `${yn(dnfCount >= 2)} (${dnfCount})` : '—'} line={lineFor('dnf_many')} />
          </Block>
        </div>
      )}
    </>
  );
}

function Block({ title, points, boosted, i, children }: { title: string; points: number; boosted: boolean; i: number; children: ReactNode }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: i, flex: '1 1 360px', minWidth: 0, ...(boosted ? { borderColor: 'rgba(232,33,26,.5)' } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 className="h">{title}</h2>
        <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>+{points}{boosted ? <span className="chip red" style={{ marginLeft: 8 }}>×2</span> : null}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  );
}

function Row({ label, driver, note, line }: { label: string; driver: Driver | null; note: string; line: { text: string; pts: number; mult: number } | null }) {
  return (
    <div className="trow" style={{ padding: '8px 10px', gap: 10 }}>
      <span className="num mute" style={{ width: 40, fontSize: 13 }}>{label}</span>
      {driver && <DriverTile driver={driver} size={36} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{driver?.name ?? note}</div>
        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{line ? line.text : driver ? note : ''}{line && driver ? ` · ${note}` : ''}</div>
      </div>
      <b className="num" style={{ color: line ? 'var(--pos)' : 'var(--mute)', fontSize: 15 }}>{line ? `+${line.pts}${line.mult > 1 ? ' ×2' : ''}` : '0'}</b>
    </div>
  );
}

function Bonus({ label, guess, fact, line }: { label: string; guess: string; fact: string; line: { points: number; multiplier: number } | undefined }) {
  return (
    <div className="trow" style={{ padding: '10px 12px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{t('bd.guessFact', { guess, fact })}</div>
      </div>
      <b className="num" style={{ color: line ? 'var(--pos)' : 'var(--mute)', fontSize: 15 }}>{line ? `+${line.points}${line.multiplier > 1 ? ' ×2' : ''}` : '0'}</b>
    </div>
  );
}
