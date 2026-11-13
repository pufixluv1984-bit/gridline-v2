import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { savePrediction } from '@/lib/api/predictions';
import { predictScreen, screenKeys, type Driver, type PredictScreen } from '@/lib/api/screens';
import { getCurrentLeague } from '@/lib/currentLeague';
import { formatDateTime, SESSION_NAMES } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { Avatar, Countdown, DriverTile, Skeleton } from '@/ui/game';
import { IconTarget } from '@/ui/icons';
import { Content, PageTitle, PillLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import p from '@/ui/Page.module.css';
import {
  canMove,
  move,
  FIRST_DNF, NONE, SLOTS, blockState, clear, emptyExtras, emptyPicks, extrasFrom, filledIn, fromPrediction, isComplete, pick, sameExtras,
  samePicks, toPrediction, usedInBlock, type Block, type BoostBlock, type Extras, type Picks,
} from './picks';
import { BoostPicker, YesNo } from './Bonus';
import { useDragPick } from './useDragPick';
import { Notices, Toast } from '@/ui/Toast';
import { Modal } from '@/ui/Modal';
import m from '@/ui/Modal.module.css';
import { avatarOf } from '@/lib/avatar';
import { t, tn, type Key } from '@/i18n';
import { useLeaveGuard } from '@/ui/useLeaveGuard';

// Таблицы правил — ключи словаря и очки; текст берётся на языке сайта при отрисовке.
const RACE_RULES: [Key, string][] = [
  ['predict.r.exact', '+10'],
  ['predict.r.off1', '+5'],
  ['predict.r.off2', '+3'],
  ['predict.r.inTop', '+1'],
  ['predict.r.podium', '+10'],
];
const QUALY_RULES: [Key, string][] = [
  ['predict.r.pole', '+6'],
  ['predict.r.p2', '+4'],
  ['predict.r.p3', '+4'],
];

const BONUS_RULES: [Key, Key, string][] = [
  ['predict.r.fl', 'predict.r.flD', '+6'],
  ['predict.r.dnf', 'predict.r.dnfD', '+10'],
  ['predict.r.poleWin', 'predict.r.poleWinD', '+3'],
  ['predict.r.sc', 'predict.r.scD', '+3'],
  ['predict.r.dnf2', 'predict.r.dnf2D', '+3'],
];

const lastName = (d: Driver) => d.name.split(' ').slice(-1)[0] ?? d.name;
const BLOCK_NAMES: Record<Block, string> = {
  get qualy() { return t('predict.b.qualy'); },
  get sprint() { return t('predict.b.sprint'); },
  get race() { return t('predict.b.race'); },
  get bonus() { return t('predict.b.race'); },
};
const SPRINT_RULES: [Key, string][] = [
  ['predict.r.sprintWin', '+6'],
  ['predict.r.sprintP23', '+4 / +4'],
];

/**
 * Экран «Прогноз этапа» (макет Predict). Правила начисления — из docs/PRODUCT.md §2:
 * квалификация топ-3, топ-10 гонки, бонусы (быстрый круг, первый сход, победа с поула, safety car,
 * сходов 2+) и бустер ×2 на один блок — один на каждые 5 этапов.
 */
export default function PredictPage() {
  const league = getCurrentLeague();
  const qc = useQueryClient();
  const key = screenKeys.predict(undefined, league);
  const q = useQuery({ queryKey: key, queryFn: () => predictScreen(undefined, league) });
  const now = useServerNow();

  const data = q.data;
  const saved = useMemo(() => fromPrediction(data?.prediction ?? null), [data?.prediction]);
  const savedExtras = useMemo(() => extrasFrom(data?.prediction ?? null), [data?.prediction]);
  const [picks, setPicks] = useState<Picks>(emptyPicks);
  const [extras, setExtras] = useState<Extras>(emptyExtras);
  const [active, setActive] = useState(0);
  const [syncedFrom, setSyncedFrom] = useState<Picks | null>(null);
  const [toast, setToast] = useState<'saved' | 'failed' | null>(null);

  const setExtra = <K extends keyof Extras>(k: K, v: Extras[K]) => setExtras((e) => ({ ...e, [k]: v }));

  const ev = data?.event ?? null;
  // Дедлайны блоков (фаза 5). По-старому (до Лас-Вегаса 2026) все блоки закрываются с квалификацией.
  const split = !!ev?.split_deadlines;
  const hasSprint = split && !!ev?.is_sprint;
  const deadlineOf = (b: Block): string | null =>
    !ev
      ? null
      : !split
        ? ev.deadline
        : b === 'qualy'
          ? (ev.deadlines?.qualy ?? ev.deadline)
          : b === 'sprint'
            ? (ev.deadlines?.sprint ?? null)
            : (ev.deadlines?.race ?? ev.deadline);
  const closed = (b: Block) => {
    const d = deadlineOf(b);
    return !d || Date.parse(d) <= now;
  };
  const slotOpen = (i: number) => {
    const b = SLOTS[i]!.block;
    return (b !== 'sprint' || hasSprint) && !closed(b);
  };
  const blocks: ('qualy' | 'race' | 'sprint')[] = hasSprint ? ['qualy', 'sprint', 'race'] : ['qualy', 'race'];
  const open = !!ev && blocks.some((b) => !closed(b));
  const nextDeadline = ev?.next_deadline ?? (open ? ev?.deadline : null) ?? null;
  const nextBlock = split && nextDeadline ? (blocks.find((b) => deadlineOf(b) === nextDeadline) ?? null) : null;

  // Подставляем сохранённый прогноз, когда он пришёл с сервера (состояние из пропсов — прямо в рендере).
  if (syncedFrom !== saved) {
    setSyncedFrom(saved);
    setPicks(saved);
    setExtras(savedExtras);
    const firstEmpty = saved.findIndex((x, i) => !x && slotOpen(i));
    setActive(firstEmpty >= 0 ? firstEmpty : Math.max(0, SLOTS.findIndex((x) => slotOpen(x.index))));
  }
  // Окно «Прогноз закрыт» (макет Overlays): блок закрылся, пока экран открыт.
  const closedSig = ev ? `${ev.id}:${blocks.map((b) => (closed(b) ? 1 : 0)).join('')}` : '';
  const [sig, setSig] = useState(closedSig);
  const [justClosed, setJustClosed] = useState<'qualy' | 'race' | 'sprint' | 'all' | null>(null);
  if (sig !== closedSig) {
    const [prevEv, prevBits = ''] = sig.split(':');
    const bits = closedSig.split(':')[1] ?? '';
    if (prevEv === String(ev?.id) && prevBits.length === bits.length) {
      const idx = [...bits].findIndex((c, i) => c === '1' && prevBits[i] === '0');
      if (idx >= 0) setJustClosed(bits.includes('0') ? blocks[idx]! : 'all');
    }
    setSig(closedSig);
  }
  const byId = useMemo(() => new Map((data?.drivers ?? []).map((d) => [d.id, d])), [data?.drivers]);
  const grid = (data?.drivers ?? []).filter((d) => d.active);
  const dirty = !samePicks(picks, saved) || !sameExtras(extras, savedExtras);
  // Отправить можно: по-старому — квалификация и топ-10 целиком; по блокам — открытые блоки либо пустые, либо целиком.
  const partial = blocks.filter((b) => !closed(b) && blockState(picks, b) === 'partial');
  const complete = split ? partial.length === 0 && blocks.some((b) => blockState(picks, b) === 'full') : isComplete(picks);

  // Что отправляем: закрытые блоки — как сохранено (база их не даст изменить), открытые — текущие, если целиком.
  const payload = () => {
    const t = toPrediction(picks);
    const sp = data?.prediction ?? null;
    const blockVal = (b: 'qualy' | 'race' | 'sprint', cur: string[]) =>
      closed(b) ? ((sp?.[b] as string[] | null | undefined) ?? null) : blockState(picks, b) === 'full' ? cur : null;
    const raceClosed = closed('race');
    return {
      qualy: blockVal('qualy', t.qualy),
      race: blockVal('race', t.race),
      sprint: hasSprint ? blockVal('sprint', t.sprint) : null,
      fastestLap: raceClosed ? (sp?.fastest_lap ?? null) : t.fastestLap,
      firstDnf: raceClosed ? (sp?.first_dnf ?? null) : t.firstDnf,
      poleWins: raceClosed ? (sp?.pole_wins ?? null) : extras.poleWins,
      safetyCar: raceClosed ? (sp?.safety_car ?? null) : extras.safetyCar,
      dnfMany: raceClosed ? (sp?.dnf_many ?? null) : extras.dnfMany,
      boost: sp?.boost_block && closed(sp.boost_block) ? sp.boost_block : extras.boost,
    };
  };

  const save = useMutation({
    mutationFn: () => savePrediction({ eventId: ev!.id, ...payload() }),
    // Оптимистично: сразу считаем прогноз отправленным, при отказе базы откатываем.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PredictScreen>(key);
      if (prev) {
        const t = payload();
        qc.setQueryData<PredictScreen>(key, {
          ...prev,
          prediction: {
            qualy: t.qualy,
            race: t.race,
            sprint: t.sprint,
            fastest_lap: t.fastestLap,
            first_dnf: t.firstDnf,
            pole_wins: t.poleWins,
            safety_car: t.safetyCar,
            dnf_many: t.dnfMany,
            boost_block: t.boost,
            updated_at: new Date().toISOString(),
          },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      setToast('failed');
    },
    onSuccess: () => setToast('saved'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['screen'] });
    },
  });

  // Неотправленные изменения: предупредить перед уходом со страницы или закрытием вкладки.
  const leaveGuard = useLeaveGuard(open && dirty && !save.isPending, t('leave.predict'));

  const choose = (driverId: string) => {
    if (!slotOpen(active)) return;
    const r = pick(picks, active, driverId, slotOpen);
    setPicks(r.picks);
    setActive(r.next);
  };
  const tapSlot = (i: number) => {
    if (!slotOpen(i)) return;
    if (active === i && picks[i]) setPicks(clear(picks, i));
    else setActive(i);
  };

  // Перетаскивание мышью: пилот из слота в слот того же блока (обмен или переезд) или из списка пилотов в любой слот.
  const dnd = useDragPick({
    canDrop: (src, to) => slotOpen(to) && ('slot' in src ? slotOpen(src.slot) && canMove(picks, src.slot, to) : true),
    onDrop: (src, to) => {
      if ('slot' in src) {
        setPicks((cur) => move(cur, src.slot, to));
      } else {
        const r = pick(picks, to, src.driver, slotOpen);
        setPicks(r.picks);
        setActive(r.next);
      }
    },
  });
  const slotProps = (i: number) => {
    const movable = slotOpen(i) && !!picks[i] && picks[i] !== NONE && SLOTS[i]!.block !== 'bonus';
    return {
      'data-slot': i,
      onClick: () => {
        if (!dnd.wasDrag()) tapSlot(i);
      },
      onMouseDown: movable ? dnd.start({ slot: i }) : undefined,
      disabled: !slotOpen(i),
      'aria-pressed': active === i,
      title: movable ? t('predict.dragHint') : undefined,
    };
  };

  // Пока тащим над слотом, сетка уже показывает результат: пилот на новом месте, сосед — на освободившемся.
  const shown: Picks =
    dnd.drag && dnd.over !== null
      ? 'slot' in dnd.drag
        ? move(picks, dnd.drag.slot, dnd.over)
        : pick(picks, dnd.over, dnd.drag.driver, slotOpen).picks
      : picks;
  const slotView = (i: number) => {
    const d = shown[i] && shown[i] !== NONE ? byId.get(shown[i]!) ?? null : null;
    const none = shown[i] === NONE;
    const from = dnd.drag && 'slot' in dnd.drag && dnd.drag.slot === i;
    const state = dnd.over === i ? ' drop' : from && (dnd.over === null || !shown[i]) ? ' dragging' : '';
    return { d, none, cls: `slot ${!slotOpen(i) ? '' : active === i && !dnd.drag ? 'act' : d || none ? '' : 'empty'}${state}` };
  };
  const boostCls = (b: BoostBlock) => (extras.boost === b ? { borderColor: 'rgba(232,33,26,.5)', boxShadow: '0 0 34px rgba(232,33,26,.14)' } : undefined);

  const sendHint = !open
    ? t('predict.hint.closed')
    : split && partial.length
      ? t('predict.hint.partial', { blocks: partial.map((b) => BLOCK_NAMES[b].toLowerCase()).join(', ') })
      : !complete
      ? split
        ? t('predict.hint.oneBlock')
        : t('predict.hint.left', { n: 13 - picks.slice(0, 13).filter(Boolean).length })
      : save.isSuccess && !dirty
        ? split ? t('predict.hint.acceptedSplit') : t('predict.hint.accepted')
        : data?.prediction && !dirty
          ? split ? t('predict.hint.sentSplit') : t('predict.hint.sent')
          : t('predict.hint.skip');

  return (
    <>
      <PageTitle title={t('predict.title')} sub={t('predict.sub')} />
      <Toolbar>
        <a className={p.btn} href="#send" onClick={(e) => { e.preventDefault(); document.getElementById('send')?.scrollIntoView({ behavior: 'smooth' }); }}>
          <IconTarget size={20} />
          {t('predict.send')}
        </a>
        <ToolbarDivider />
        <PillLink to="/predict">{t('predict.sub')}</PillLink>
        <PillLink to="/league">{t('common.friendsLeague')}</PillLink>
        <PillLink to="/rules">{t('predict.scoring')}</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="card"><Skeleton h={420} /></div>
        ) : q.error ? (
          <div className="empty-state"><h3>{t('predict.loadFail')}</h3><p>{t('predict.loadFailText')}</p></div>
        ) : !ev ? (
          <div className="empty-state"><h3>{t('predict.seasonOver')}</h3><p>{t('predict.seasonOverText')}</p></div>
        ) : (
          <>
          <Notices notices={data?.notices} />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <section className="card rise" style={{ flex: '2 1 760px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="eyebrow">{t('predict.roundName', { round: ev.round, name: ev.name })}</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 12, letterSpacing: '-.01em' }}>{t('predict.yours')}</div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>
                    {!open
                      ? split ? t('predict.closedRace') : t('predict.closedQualy')
                      : split && nextBlock
                        ? t('predict.blockUntil', { block: BLOCK_NAMES[nextBlock], at: formatDateTime(nextDeadline!), session: (SESSION_NAMES[nextBlock] ?? '').toLowerCase() })
                        : t('predict.until', { at: formatDateTime(ev.deadline!) })}
                  </div>
                </div>
                {open && nextDeadline ? <Countdown to={nextDeadline} small seconds={false} /> : <span className="chip red">{t('predict.closedChip')}</span>}
              </div>

              <BlockHead title={t('predict.qualyTop3')} chip={t('predict.ofN', { n: filledIn(picks, 'qualy'), total: 3 })} full={filledIn(picks, 'qualy') === 3} until={split ? deadlineOf('qualy') : null} closed={closed('qualy')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                {SLOTS.slice(0, 3).map((s) => {
                  const v = slotView(s.index);
                  return (
                    <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} {...slotProps(s.index)}>
                      <span className="num" style={{ width: 44, fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{s.label}</span>
                      <DriverTile driver={v.d} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? lastName(v.d) : t('predict.pick')}</div>
                        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : s.points}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {hasSprint && (
                <>
                  <BlockHead title={t('predict.sprintTop3')} chip={t('predict.ofN', { n: filledIn(picks, 'sprint'), total: 3 })} full={filledIn(picks, 'sprint') === 3} until={deadlineOf('sprint')} closed={closed('sprint')} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                    {SLOTS.slice(15, 18).map((s) => {
                      const v = slotView(s.index);
                      return (
                        <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} {...slotProps(s.index)}>
                          <span className="num" style={{ width: 56, fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{s.label}</span>
                          <DriverTile driver={v.d} size={40} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? lastName(v.d) : t('predict.pick')}</div>
                            <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : s.points}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <BlockHead title={t('predict.top10')} chip={t('predict.ofN', { n: filledIn(picks, 'race'), total: 10 })} full={filledIn(picks, 'race') === 10} until={split ? deadlineOf('race') : null} closed={closed('race')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                {SLOTS.slice(3, 13).map((s) => {
                  const v = slotView(s.index);
                  return (
                    <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} {...slotProps(s.index)}>
                      <span className="num" style={{ width: 36, fontSize: 18, fontWeight: 600, color: s.pos <= 3 ? 'var(--gold)' : 'var(--mute)' }}>P{s.pos}</span>
                      <DriverTile driver={v.d} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? v.d.name : t('predict.pickDriver')}</div>
                        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : active === s.index && slotOpen(s.index) ? t('predict.picking') : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '30px 0 14px' }}>
                <span className="eyebrow">{t('predict.bonus')}</span>
                <span className="chip green">{t('predict.auto')}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
                {[13, 14].map((i) => {
                  const s = SLOTS[i]!;
                  const v = slotView(i);
                  return (
                    <button key={i} type="button" className={v.cls} style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 12px', gap: 10, ...boostCls('bonus') }} {...slotProps(i)}>
                      <div className="eyebrow">{s.label}</div>
                      {v.none ? (
                        <div className="ph" style={{ width: 72, height: 72, borderRadius: 22, ['--c' as string]: '#7fe0a0' }}><span className="npc" style={{ fontSize: 15 }}>{t('predict.nobody')}</span></div>
                      ) : (
                        <DriverTile driver={v.d} size={72} />
                      )}
                      <div style={{ fontWeight: 600, fontSize: 14, minHeight: 18 }}>{v.none ? t('predict.nobodyDnf') : v.d ? lastName(v.d) : t('predict.pick')}</div>
                      <div className="mute" style={{ fontSize: 12 }}>{i === 13 ? t('predict.race') : t('predict.laps')} · <b style={{ color: 'var(--pos)' }}>{s.points}</b></div>
                    </button>
                  );
                })}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <YesNo label={t('predict.poleWins')} points="+3" value={extras.poleWins} onChange={(v) => setExtra('poleWins', v)} disabled={closed('race')} />
                  <YesNo label={t('predict.scYes')} points="+3" value={extras.safetyCar} onChange={(v) => setExtra('safetyCar', v)} disabled={closed('race')} />
                  <YesNo label={t('predict.dnfMany')} points="+3" value={extras.dnfMany} onChange={(v) => setExtra('dnfMany', v)} disabled={closed('race')} />
                </div>
              </div>

              <div style={{ margin: '28px 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="eyebrow">{t('predict.booster')}</span>
                <span className="chip">{t('predict.boosterWindow')}</span>
              </div>
              <BoostPicker value={extras.boost} onChange={(v) => setExtra('boost', v)} disabled={!open} usedElsewhere={data?.boost_used ?? null} closed={(b) => closed(b)} />

              {slotOpen(active) && (
                <>
                  <div style={{ margin: '28px 0 14px' }}>
                    <span className="eyebrow">{t('predict.pickFor')} <b style={{ color: '#fff' }}>{SLOTS[active]!.block === 'race' ? t('predict.pickRace', { n: SLOTS[active]!.pos }) : SLOTS[active]!.block === 'qualy' ? t('predict.pickQualy', { slot: SLOTS[active]!.label }) : SLOTS[active]!.block === 'sprint' ? t('predict.pickSprint', { slot: SLOTS[active]!.label }) : SLOTS[active]!.label}</b></span>
                  </div>
                  {active === FIRST_DNF && (
                    <button type="button" className={`slot ${picks[FIRST_DNF] === NONE ? 'act' : ''}`} style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontWeight: 600 }} onClick={() => choose(NONE)}>
                      {t('predict.nobodyDnf')}
                    </button>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10 }}>
                    {grid.map((d) => {
                      const used = usedInBlock(picks, active, d.id);
                      const here = picks[active] === d.id;
                      return (
                        <button key={d.id} type="button" className={`slot ${here ? 'act' : ''}`} style={{ flexDirection: 'column', textAlign: 'center', padding: '12px 8px', gap: 6 }} onClick={() => { if (!dnd.wasDrag()) choose(d.id); }} title={d.name}
                          onMouseDown={dnd.start({ driver: d.id })}>
                          <DriverTile driver={d} size={52} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</div>
                          <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: '#ffb800', minHeight: 12 }}>
                            {here ? t('predict.chosen') : used ? t('predict.inBlock') : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mute" style={{ fontSize: 12, margin: '10px 2px 0' }}>
                    {t('predict.lineupNote')}
                  </div>
                </>
              )}

              <div id="send" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 28 }}>
                {open && (
                  <button type="button" className={p.btn} style={complete ? undefined : { opacity: 0.45, cursor: 'not-allowed' }} disabled={!complete || save.isPending || (!dirty && !!data?.prediction)} onClick={() => save.mutate()}>
                    {save.isPending ? t('predict.sending') : data?.prediction && !dirty ? t('predict.sent') : data?.prediction ? t('predict.saveChanges') : t('predict.send')}
                  </button>
                )}
                <span className="mute" style={{ fontSize: 14 }} aria-live="polite">{sendHint}</span>
              </div>
              {save.error && <div className="alert bad" role="alert" style={{ marginTop: 14 }}>{save.error.message}</div>}
            </section>

            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <section className="card rise" style={{ ['--i' as string]: 1 }}>
                <h2 className="h">{t('predict.whoSent')}</h2>
                {data?.league ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {data.submissions.map((s) => (
                      <div key={s.user_id} className="lrow">
                        <Avatar {...avatarOf(s)} />
                        <div style={{ flex: 1, fontWeight: 600 }}>{s.nickname}</div>
                        <span className={`chip ${s.submitted ? 'green' : ''}`}>{s.submitted ? t('predict.sentChip') : t('predict.waitChip')}</span>
                      </div>
                    ))}
                    <div className="mute" style={{ fontSize: 12 }}>{t('predict.leagueHidden', { name: data.league.name, until: split ? t('predict.untilRace') : t('predict.untilClose') })}</div>
                  </div>
                ) : (
                  <div className="mute" style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
                    {tn('predict.noLeague', { create: <Link to="/lobby/create" style={{ color: '#fff', fontWeight: 600 }}>{t('predict.noLeagueCreate')}</Link> })}
                  </div>
                )}
              </section>
              <section className="card rise" style={{ ['--i' as string]: 2 }} id="rules">
                <h2 className="h">{t('predict.ptsQualy')}</h2>
                <div style={{ marginTop: 10 }}>{QUALY_RULES.map(([n, v]) => <div key={n} className="kv"><span>{t(n)}</span><b className="num">{v}</b></div>)}</div>
              </section>
              {hasSprint && (
                <section className="card rise" style={{ ['--i' as string]: 2 }}>
                  <h2 className="h">{t('predict.ptsSprint')}</h2>
                  <div style={{ marginTop: 10 }}>{SPRINT_RULES.map(([n, v]) => <div key={n} className="kv"><span>{t(n)}</span><b className="num">{v}</b></div>)}</div>
                  <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{t('predict.noSprintBoost')}</div>
                </section>
              )}
              <section className="card rise" style={{ ['--i' as string]: 3 }}>
                <h2 className="h">{t('predict.ptsTop10')}</h2>
                <div style={{ marginTop: 10 }}>{RACE_RULES.map(([n, v]) => <div key={n} className="kv"><span>{t(n)}</span><b className="num">{v}</b></div>)}</div>
                <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{t('predict.top10Note')}</div>
              </section>
              <section className="card rise" style={{ ['--i' as string]: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 className="h">{t('predict.bonus')}</h2><span className="chip green">{t('predict.autoChip')}</span></div>
                <div style={{ marginTop: 10 }}>
                  {BONUS_RULES.map(([n, d, v]) => (
                    <div key={n} className="kv">
                      <span>{t(n)}<span className="mute" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{t(d)}</span></span>
                      <b className="num" style={{ color: 'var(--pos)' }}>{v}</b>
                    </div>
                  ))}
                </div>
                <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{t('predict.boosterNote')}</div>
              </section>
              {data?.last && (
                <section className="card rise" style={{ ['--i' as string]: 5 }}>
                  <h2 className="h">{t('predict.lastRace', { name: data.last.name })}</h2>
                  <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>{t('predict.vsResult')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                    <div className="num" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>+{data.last.total}</div>
                    <div className="mute" style={{ fontSize: 14, lineHeight: 1.5 }}>
                      {t('predict.lastQualy', { n: data.last.qualy ?? 0 })}<br />
                      {t('predict.lastRaceBonus', { race: data.last.race ?? 0, bonus: data.last.bonus ?? 0 })}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
          </>
        )}
        <div className="mute" style={{ fontSize: 12, padding: '4px 6px 0', lineHeight: 1.6 }}>
          {split
            ? t('predict.footSplit')
            : t('predict.footOld')}{' '}
          {t('predict.footRules')}
        </div>
      </Content>
      {justClosed && (
        <Modal
          title={justClosed === 'all' ? t('predict.closedAll') : t('predict.closedBlock', { block: BLOCK_NAMES[justClosed] })}
          icon={
            <span className="bigico grn" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="3" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          }
          onClose={() => setJustClosed(null)}
          actions={<button type="button" className="mini go" onClick={() => setJustClosed(null)}>{t('predict.seeMine')}</button>}
        >
          <p className={m.text}>
            {justClosed === 'all'
              ? t('predict.startedAll', { session: split ? SESSION_NAMES.race! : SESSION_NAMES.qualy! })
              : justClosed === 'qualy'
                ? t('predict.startedQualy')
                : t('predict.startedSprint')}
          </p>
        </Modal>
      )}
      {toast === 'saved' && <Toast tone="g" title={t('predict.saved')} text={split ? t('predict.savedSplit') : t('predict.savedOld')} onDone={() => setToast(null)} />}
      {toast === 'failed' && <Toast tone="r" title={t('predict.saveFail')} text={t('predict.saveFailText')} onDone={() => setToast(null)} />}
      {leaveGuard}
    </>
  );
}

function BlockHead({ title, chip, full, until = null, closed = false }: { title: string; chip: string; full: boolean; until?: string | null; closed?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '28px 0 14px' }}>
      <span className="eyebrow">
        {title}
        {until && <span className="mute" style={{ marginLeft: 10, textTransform: 'none', letterSpacing: 0 }}>{closed ? t('predict.blockClosed') : t('predict.blockTill', { at: formatDateTime(until) })}</span>}
      </span>
      <span className={`chip ${closed && until ? 'red' : full ? 'green' : ''}`}>{closed && until ? t('predict.closedShort') : chip}</span>
    </div>
  );
}
