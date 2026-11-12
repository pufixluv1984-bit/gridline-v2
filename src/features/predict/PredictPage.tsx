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
  FIRST_DNF, NONE, SLOTS, blockState, clear, emptyExtras, emptyPicks, extrasFrom, filledIn, fromPrediction, isComplete, pick, sameExtras,
  samePicks, toPrediction, usedInBlock, type Block, type BoostBlock, type Extras, type Picks,
} from './picks';
import { BoostPicker, YesNo } from './Bonus';
import { Notices, Toast } from '@/ui/Toast';
import { Modal } from '@/ui/Modal';
import m from '@/ui/Modal.module.css';
import { avatarOf } from '@/lib/avatar';

const RACE_RULES = [
  ['Точное место', '+10'],
  ['Мимо на 1 место', '+5'],
  ['Мимо на 2 места', '+3'],
  ['В топ-10, но дальше', '+1'],
  ['Подиум в точном порядке', '+10'],
];
const QUALY_RULES = [
  ['Поул точно', '+6'],
  ['P2 точно', '+4'],
  ['P3 точно', '+4'],
];

const BONUS_RULES = [
  ['Быстрый круг', 'Лучший круг гонки', '+6'],
  ['Первый сход', 'Меньше всех кругов среди сошедших; сходов нет — «Никто»', '+10'],
  ['Победа с поула', 'Выиграет ли гонку пилот с поула', '+3'],
  ['Safety car', 'Будет ли выезд машины безопасности (VSC не считается)', '+3'],
  ['Сходов 2 и больше', 'Или меньше двух', '+3'],
];

const lastName = (d: Driver) => d.name.split(' ').slice(-1)[0] ?? d.name;
const BLOCK_NAMES: Record<Block, string> = { qualy: 'Квалификация', sprint: 'Спринт', race: 'Гонка и бонусы', bonus: 'Гонка и бонусы' };
const SPRINT_RULES = [
  ['Победитель спринта точно', '+6'],
  ['P2 и P3 точно', '+4 и +4'],
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

  const slotView = (i: number) => {
    const d = picks[i] && picks[i] !== NONE ? byId.get(picks[i]!) ?? null : null;
    const none = picks[i] === NONE;
    return { d, none, cls: `slot ${!slotOpen(i) ? '' : active === i ? 'act' : d || none ? '' : 'empty'}` };
  };
  const boostCls = (b: BoostBlock) => (extras.boost === b ? { borderColor: 'rgba(232,33,26,.5)', boxShadow: '0 0 34px rgba(232,33,26,.14)' } : undefined);

  const sendHint = !open
    ? 'Приём закрыт — прогноз зафиксирован'
    : split && partial.length
      ? `Заполни блок целиком или очисти его: ${partial.map((b) => BLOCK_NAMES[b].toLowerCase()).join(', ')}`
      : !complete
      ? split
        ? 'Заполни хотя бы один блок целиком'
        : `Заполни квалификацию и топ-10: ещё ${13 - picks.slice(0, 13).filter(Boolean).length}`
      : save.isSuccess && !dirty
        ? split ? 'Прогноз принят. Открытые блоки можно менять до их закрытия' : 'Прогноз принят. До дедлайна его можно изменить'
        : data?.prediction && !dirty
          ? split ? 'Прогноз отправлен. Открытые блоки можно менять до их закрытия' : 'Прогноз отправлен. До дедлайна его можно изменить'
          : 'Бонусы и бустер можно пропустить';

  return (
    <>
      <PageTitle title="Игра прогнозов" sub="Прогноз этапа" />
      <Toolbar>
        <a className={p.btn} href="#send" onClick={(e) => { e.preventDefault(); document.getElementById('send')?.scrollIntoView({ behavior: 'smooth' }); }}>
          <IconTarget size={20} />
          Отправить прогноз
        </a>
        <ToolbarDivider />
        <PillLink to="/predict">Прогноз этапа</PillLink>
        <PillLink to="/league">Лига друзей</PillLink>
        <PillLink to="/rules">Правила начисления</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="card"><Skeleton h={420} /></div>
        ) : q.error ? (
          <div className="empty-state"><h3>Не получилось загрузить этап</h3><p>Проверь интернет и обнови страницу.</p></div>
        ) : !ev ? (
          <div className="empty-state"><h3>Сезон закончился</h3><p>Прогнозы снова откроются перед первым этапом нового сезона.</p></div>
        ) : (
          <>
          <Notices notices={data?.notices} />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <section className="card rise" style={{ flex: '2 1 760px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="eyebrow">Этап {ev.round} · {ev.name}</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 12, letterSpacing: '-.01em' }}>Твой прогноз</div>
                  <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>
                    {!open
                      ? split ? 'Приём закрыт: гонка началась' : 'Приём закрыт: квалификация началась'
                      : split && nextBlock
                        ? `${BLOCK_NAMES[nextBlock]}: приём до ${formatDateTime(nextDeadline!)} — старт ${(SESSION_NAMES[nextBlock] ?? '').toLowerCase()}`
                        : `Приём до ${formatDateTime(ev.deadline!)} — старт квалификации`}
                  </div>
                </div>
                {open && nextDeadline ? <Countdown to={nextDeadline} small seconds={false} /> : <span className="chip red">Приём закрыт</span>}
              </div>

              <BlockHead title="Квалификация · топ-3" chip={`${filledIn(picks, 'qualy')} из 3`} full={filledIn(picks, 'qualy') === 3} until={split ? deadlineOf('qualy') : null} closed={closed('qualy')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                {SLOTS.slice(0, 3).map((s) => {
                  const v = slotView(s.index);
                  return (
                    <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} onClick={() => tapSlot(s.index)} disabled={!slotOpen(s.index)} aria-pressed={active === s.index}>
                      <span className="num" style={{ width: 44, fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{s.label}</span>
                      <DriverTile driver={v.d} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? lastName(v.d) : 'Выбрать'}</div>
                        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : s.points}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {hasSprint && (
                <>
                  <BlockHead title="Спринт · топ-3" chip={`${filledIn(picks, 'sprint')} из 3`} full={filledIn(picks, 'sprint') === 3} until={deadlineOf('sprint')} closed={closed('sprint')} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                    {SLOTS.slice(15, 18).map((s) => {
                      const v = slotView(s.index);
                      return (
                        <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} onClick={() => tapSlot(s.index)} disabled={!slotOpen(s.index)} aria-pressed={active === s.index}>
                          <span className="num" style={{ width: 56, fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{s.label}</span>
                          <DriverTile driver={v.d} size={40} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? lastName(v.d) : 'Выбрать'}</div>
                            <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : s.points}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <BlockHead title="Топ-10 финиша" chip={`${filledIn(picks, 'race')} из 10`} full={filledIn(picks, 'race') === 10} until={split ? deadlineOf('race') : null} closed={closed('race')} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                {SLOTS.slice(3, 13).map((s) => {
                  const v = slotView(s.index);
                  return (
                    <button key={s.index} type="button" className={v.cls} style={{ padding: '10px 14px', gap: 12, textAlign: 'left' }} onClick={() => tapSlot(s.index)} disabled={!slotOpen(s.index)} aria-pressed={active === s.index}>
                      <span className="num" style={{ width: 36, fontSize: 18, fontWeight: 600, color: s.pos <= 3 ? 'var(--gold)' : 'var(--mute)' }}>P{s.pos}</span>
                      <DriverTile driver={v.d} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{v.d ? v.d.name : 'Выбери пилота'}</div>
                        <div className="mute" style={{ fontSize: 12, marginTop: 2 }}>{v.d ? v.d.team_name : active === s.index && slotOpen(s.index) ? 'Выбираешь сейчас' : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '30px 0 14px' }}>
                <span className="eyebrow">Бонус</span>
                <span className="chip green">Считается автоматически</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
                {[13, 14].map((i) => {
                  const s = SLOTS[i]!;
                  const v = slotView(i);
                  return (
                    <button key={i} type="button" className={v.cls} style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 12px', gap: 10, ...boostCls('bonus') }} onClick={() => tapSlot(i)} disabled={!slotOpen(i)} aria-pressed={active === i}>
                      <div className="eyebrow">{s.label}</div>
                      {v.none ? (
                        <div className="ph" style={{ width: 72, height: 72, borderRadius: 22, ['--c' as string]: '#7fe0a0' }}><span className="npc" style={{ fontSize: 15 }}>никто</span></div>
                      ) : (
                        <DriverTile driver={v.d} size={72} />
                      )}
                      <div style={{ fontWeight: 600, fontSize: 14, minHeight: 18 }}>{v.none ? 'Никто не сойдёт' : v.d ? lastName(v.d) : 'Выбрать'}</div>
                      <div className="mute" style={{ fontSize: 12 }}>{i === 13 ? 'Гонка' : 'Круги в гонке'} · <b style={{ color: 'var(--pos)' }}>{s.points}</b></div>
                    </button>
                  );
                })}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <YesNo label="Поул выиграет гонку" points="+3" value={extras.poleWins} onChange={(v) => setExtra('poleWins', v)} disabled={closed('race')} />
                  <YesNo label="Будет safety car" points="+3" value={extras.safetyCar} onChange={(v) => setExtra('safetyCar', v)} disabled={closed('race')} />
                  <YesNo label="Сходов 2 и больше" points="+3" value={extras.dnfMany} onChange={(v) => setExtra('dnfMany', v)} disabled={closed('race')} />
                </div>
              </div>

              <div style={{ margin: '28px 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="eyebrow">Бустер ×2</span>
                <span className="chip">Один на каждые 5 этапов</span>
              </div>
              <BoostPicker value={extras.boost} onChange={(v) => setExtra('boost', v)} disabled={!open} usedElsewhere={data?.boost_used ?? null} closed={(b) => closed(b)} />

              {slotOpen(active) && (
                <>
                  <div style={{ margin: '28px 0 14px' }}>
                    <span className="eyebrow">Выбери пилота для: <b style={{ color: '#fff' }}>{SLOTS[active]!.block === 'race' ? `P${SLOTS[active]!.pos} в гонке` : SLOTS[active]!.block === 'qualy' ? `${SLOTS[active]!.label} в квалификации` : SLOTS[active]!.block === 'sprint' ? `${SLOTS[active]!.label} в спринте` : SLOTS[active]!.label}</b></span>
                  </div>
                  {active === FIRST_DNF && (
                    <button type="button" className={`slot ${picks[FIRST_DNF] === NONE ? 'act' : ''}`} style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontWeight: 600 }} onClick={() => choose(NONE)}>
                      Никто не сойдёт
                    </button>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10 }}>
                    {grid.map((d) => {
                      const used = usedInBlock(picks, active, d.id);
                      const here = picks[active] === d.id;
                      return (
                        <button key={d.id} type="button" className={`slot ${here ? 'act' : ''}`} style={{ flexDirection: 'column', textAlign: 'center', padding: '12px 8px', gap: 6 }} onClick={() => choose(d.id)} title={d.name}>
                          <DriverTile driver={d} size={52} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</div>
                          <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: '#ffb800', minHeight: 12 }}>
                            {here ? 'выбран' : used ? 'уже в блоке' : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mute" style={{ fontSize: 12, margin: '10px 2px 0' }}>
                    Состав — по заявке последнего этапа из Jolpica. Пилот уже стоит в блоке — выбор переставит его на это место.
                  </div>
                </>
              )}

              <div id="send" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 28 }}>
                {open && (
                  <button type="button" className={p.btn} style={complete ? undefined : { opacity: 0.45, cursor: 'not-allowed' }} disabled={!complete || save.isPending || (!dirty && !!data?.prediction)} onClick={() => save.mutate()}>
                    {save.isPending ? 'Отправляем…' : data?.prediction && !dirty ? 'Отправлено ✓' : data?.prediction ? 'Сохранить изменения' : 'Отправить прогноз'}
                  </button>
                )}
                <span className="mute" style={{ fontSize: 14 }} aria-live="polite">{sendHint}</span>
              </div>
              {save.error && <div className="alert bad" role="alert" style={{ marginTop: 14 }}>{save.error.message}</div>}
            </section>

            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <section className="card rise" style={{ ['--i' as string]: 1 }}>
                <h2 className="h">Кто уже отправил</h2>
                {data?.league ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {data.submissions.map((s) => (
                      <div key={s.user_id} className="lrow">
                        <Avatar {...avatarOf(s)} />
                        <div style={{ flex: 1, fontWeight: 600 }}>{s.nickname}</div>
                        <span className={`chip ${s.submitted ? 'green' : ''}`}>{s.submitted ? 'Отправил' : 'Ждём'}</span>
                      </div>
                    ))}
                    <div className="mute" style={{ fontSize: 12 }}>Лига «{data.league.name}». Чужие прогнозы скрыты до {split ? 'старта гонки' : 'закрытия приёма'}.</div>
                  </div>
                ) : (
                  <div className="mute" style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
                    Ты пока не в лиге. <Link to="/lobby/create" style={{ color: '#fff', fontWeight: 600 }}>Создай лобби</Link> или войди по коду друга — прогноз один на все твои лиги.
                  </div>
                )}
              </section>
              <section className="card rise" style={{ ['--i' as string]: 2 }} id="rules">
                <h2 className="h">Очки за квалификацию</h2>
                <div style={{ marginTop: 10 }}>{QUALY_RULES.map(([n, v]) => <div key={n} className="kv"><span>{n}</span><b className="num">{v}</b></div>)}</div>
              </section>
              {hasSprint && (
                <section className="card rise" style={{ ['--i' as string]: 2 }}>
                  <h2 className="h">Очки за спринт</h2>
                  <div style={{ marginTop: 10 }}>{SPRINT_RULES.map(([n, v]) => <div key={n} className="kv"><span>{n}</span><b className="num">{v}</b></div>)}</div>
                  <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>Бустер на спринт не ставится.</div>
                </section>
              )}
              <section className="card rise" style={{ ['--i' as string]: 3 }}>
                <h2 className="h">Очки за топ-10</h2>
                <div style={{ marginTop: 10 }}>{RACE_RULES.map(([n, v]) => <div key={n} className="kv"><span>{n}</span><b className="num">{v}</b></div>)}</div>
                <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>Очки за место даются, если пилот финишировал в топ-10.</div>
              </section>
              <section className="card rise" style={{ ['--i' as string]: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 className="h">Бонус</h2><span className="chip green">Авто</span></div>
                <div style={{ marginTop: 10 }}>
                  {BONUS_RULES.map(([n, d, v]) => (
                    <div key={n} className="kv">
                      <span>{n}<span className="mute" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{d}</span></span>
                      <b className="num" style={{ color: 'var(--pos)' }}>{v}</b>
                    </div>
                  ))}
                </div>
                <div className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>Бустер ×2 удваивает один блок этапа. Один бустер на каждые 5 этапов сезона.</div>
              </section>
              {data?.last && (
                <section className="card rise" style={{ ['--i' as string]: 5 }}>
                  <h2 className="h">Прошлый этап · {data.last.name.replace('Гран-при ', '')}</h2>
                  <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>Твой прогноз против результата</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                    <div className="num" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>+{data.last.total}</div>
                    <div className="mute" style={{ fontSize: 14, lineHeight: 1.5 }}>
                      квалификация — {data.last.qualy ?? 0},<br />
                      гонка — {data.last.race ?? 0}, бонус — {data.last.bonus ?? 0}
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
            ? 'Каждый блок закрывается со стартом своей сессии: квалификация — квалификации, спринт — спринта, топ-10 и бонусы — гонки. Чужие прогнозы скрыты до старта гонки.'
            : 'Прогноз закрывается со стартом квалификации, чужие прогнозы скрыты до закрытия.'}{' '}
          Не отправил прогноз — 0 очков за этап. Очки предварительные 48 часов после гонки (штрафы стюардов), потом фиксируются. Максимум за этап без бустера: 14 за квалификацию, 110 за гонку, 25 за бонусы.
        </div>
      </Content>
      {justClosed && (
        <Modal
          title={justClosed === 'all' ? 'Прогноз закрыт' : `${BLOCK_NAMES[justClosed]}: приём закрыт`}
          icon={
            <span className="bigico grn" style={{ width: 52, height: 52, borderRadius: 16 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="3" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          }
          onClose={() => setJustClosed(null)}
          actions={<button type="button" className="mini go" onClick={() => setJustClosed(null)}>Посмотреть мой прогноз</button>}
        >
          <p className={m.text}>
            {justClosed === 'all'
              ? `${split ? 'Гонка' : 'Квалификация'} началась — изменить прогноз уже нельзя. Твой вариант зафиксирован, прогнозы друзей теперь видны в разборе.`
              : justClosed === 'qualy'
                ? 'Квалификация началась — блок квалификации зафиксирован. Спринт и гонку ещё можно поменять до их старта.'
                : 'Спринт начался — блок спринта зафиксирован. Топ-10 и бонусы можно менять до старта гонки.'}
          </p>
        </Modal>
      )}
      {toast === 'saved' && <Toast tone="g" title="Прогноз сохранён" text={split ? 'Открытые блоки можно менять до их закрытия' : 'Можно менять до старта квалификации'} onDone={() => setToast(null)} />}
      {toast === 'failed' && <Toast tone="r" title="Не удалось сохранить" text="Проверь интернет и повтори" onDone={() => setToast(null)} />}
    </>
  );
}

function BlockHead({ title, chip, full, until = null, closed = false }: { title: string; chip: string; full: boolean; until?: string | null; closed?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '28px 0 14px' }}>
      <span className="eyebrow">
        {title}
        {until && <span className="mute" style={{ marginLeft: 10, textTransform: 'none', letterSpacing: 0 }}>{closed ? '· блок закрыт' : `· до ${formatDateTime(until)}`}</span>}
      </span>
      <span className={`chip ${closed && until ? 'red' : full ? 'green' : ''}`}>{closed && until ? 'Закрыт' : chip}</span>
    </div>
  );
}
