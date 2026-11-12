import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamCar, type TeamCode } from '@/lib/assets';
import {
  CHIPS,
  fantasyKeys,
  fantasySquadScreen,
  finalFix,
  money,
  pts,
  saveSquad,
  type ChipId,
  type SquadScreen,
} from '@/lib/api/fantasy';
import { formatDateTime } from '@/lib/time/format';
import { Countdown, DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import { Toast } from '@/ui/Toast';
import b from '@/ui/Button.module.css';
import pg from '@/ui/Page.module.css';
import { FantasyTabs, IconCheckSm, IconSwap, IconX } from './FantasyTabs';

const TOUR_KEY = 'gridline.fantasy.tour.hidden';
const readTour = () => {
  try {
    return localStorage.getItem(TOUR_KEY) !== '1';
  } catch {
    return true;
  }
};

/** Макет Fantasy-Squad: дедлайн, бюджет, замены, состав с DRS, чипы и выбор активов. */
export default function SquadPage() {
  const q = useQuery({ queryKey: fantasyKeys.squad(), queryFn: () => fantasySquadScreen() });
  const data = q.data;

  if (q.isLoading) {
    return (
      <>
        <PageTitle title="Фэнтези-лига" sub="Мой состав" />
        <FantasyTabs />
        <Content><Skeleton h={420} /></Content>
      </>
    );
  }
  if (q.error || !data?.event) {
    return (
      <>
        <PageTitle title="Фэнтези-лига" sub="Мой состав" />
        <FantasyTabs />
        <Content>
          <div className="empty-state">
            <h3>Фэнтези пока не открыто</h3>
            <p>Пробный этап — Гран-при Абу-Даби 2026, сезон 2027 начнётся с первого этапа. Цены появятся перед этапом.</p>
          </div>
        </Content>
      </>
    );
  }
  const key = `${data.event.id}:${data.squad?.updated_at ?? 'new'}`;
  return <SquadEditor key={key} data={data} />;
}

type Draft = { drivers: string[]; teams: string[]; drs: string | null; chip: ChipId | null };

function SquadEditor({ data }: { data: SquadScreen }) {
  const qc = useQueryClient();
  const initial: Draft = data.squad
    ? { drivers: data.squad.drivers, teams: data.squad.teams, drs: data.squad.drs, chip: data.squad.chip }
    : data.base
      ? { drivers: data.base.drivers, teams: data.base.teams, drs: data.base.drs, chip: null }
      : { drivers: [], teams: [], drs: null, chip: null };
  const [draft, setDraft] = useState<Draft>(initial);
  const [mode, setMode] = useState<'drivers' | 'teams'>('drivers');
  const [tour, setTour] = useState(readTour);
  const [toast, setToast] = useState<{ tone: 'g' | 'r'; title: string; text?: string } | null>(null);

  const drivers = useMemo(() => new Map(data.market.drivers.map((d) => [d.id, d])), [data]);
  const teams = useMemo(() => new Map(data.market.teams.map((t) => [t.id, t])), [data]);
  const budget = data.rules.budget;
  const locked = data.locked;
  const first = !data.base;

  const cost =
    draft.drivers.reduce((a, id) => a + Number(drivers.get(id)?.price ?? 0), 0) +
    draft.teams.reduce((a, id) => a + Number(teams.get(id)?.price ?? 0), 0);
  const left = budget - cost;
  const limitless = draft.chip === 'limitless';
  const overBudget = left < -0.001 && !limitless;

  // Трансферы по итогу против прошлого состава — как считает база (не едущие пилоты уходят бесплатно).
  const transfers = data.base
    ? data.base.drivers.filter((d) => !draft.drivers.includes(d) && !drivers.get(d)?.out).length +
      draft.teams.filter((t) => !data.base!.teams.includes(t)).length
    : 0;
  const freeTransfers = draft.chip === 'wildcard' || limitless;
  const extra = first || freeTransfers ? 0 : Math.max(0, transfers - data.free_before);
  const penalty = extra * data.rules.transfer_penalty;

  const complete = draft.drivers.length === 5 && draft.teams.length === 2;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || !data.squad;

  const save = useMutation({
    mutationFn: () => saveSquad(data.event!.id, draft),
    onSuccess: (r) => {
      setToast({ tone: 'g', title: 'Состав сохранён', text: r.penalty ? `Штраф за лишние замены: −${r.penalty}` : 'Изменения можно вносить до закрытия.' });
      void qc.invalidateQueries({ queryKey: ['screen', 'fantasy'] });
    },
    onError: (e) => setToast({ tone: 'r', title: 'Не сохранилось', text: (e as Error).message }),
  });

  const toggleDriver = (id: string) =>
    setDraft((d) => {
      if (d.drivers.includes(id)) return { ...d, drivers: d.drivers.filter((x) => x !== id), drs: d.drs === id ? null : d.drs };
      if (d.drivers.length >= 5) return d;
      return { ...d, drivers: [...d.drivers, id] };
    });
  const toggleTeam = (id: string) =>
    setDraft((d) => {
      if (d.teams.includes(id)) return { ...d, teams: d.teams.filter((x) => x !== id) };
      if (d.teams.length >= 2) return d;
      return { ...d, teams: [...d.teams, id] };
    });
  const swap = (out: string, inn: string) =>
    setDraft((d) => ({ ...d, drivers: d.drivers.map((x) => (x === out ? inn : x)), drs: d.drs === out ? inn : d.drs }));

  const hideTour = () => {
    setTour(false);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* без хранилища подсказка просто появится снова */
    }
  };

  const used = new Map(data.chips_used.map((c) => [c.chip, c]));
  const chipsLeft = CHIPS.filter((c) => !used.has(c.id)).length;
  const outInSquad = draft.drivers.map((id) => drivers.get(id)).filter((d) => d?.out && d.sub && !draft.drivers.includes(d.sub));
  const eventName = data.event!.name.replace('Гран-при ', '');
  const stripeOn = Math.min(20, Math.round((cost / budget) * 20));

  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Мой состав" />
      <FantasyTabs
        action={
          !locked && (
            <button type="button" className={pg.btn} style={{ border: 0 }} disabled={!complete || overBudget || save.isPending || !dirty} onClick={() => save.mutate()}>
              <IconCheckSm />
              {save.isPending ? 'Сохраняем…' : data.squad && !dirty ? 'Состав сохранён' : 'Сохранить состав'}
            </button>
          )
        }
        extra={!tour && <button type="button" className={pg.pill} onClick={() => setTour(true)}>Подсказки</button>}
      />
      <Content>
        {tour && !locked && (
          <section className="card rise" style={{ ['--i' as string]: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="h">Как играть: три шага</span><span className="chip">1 минута</span></div>
              <button type="button" className="mini" onClick={hideTour}>Понятно, скрыть</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Step n={1} title="Соберите состав" text="5 пилотов и 2 конструктора, не дороже бюджета. Нажимайте «Добавить» в списке ниже." />
              <Step n={2} title="Выберите DRS-буст" text="Очки одного пилота за этап удвоятся. Тот, кто ошибся с выбором, теряет больше всего." />
              <Step n={3} title="Сохраните до закрытия" text="Приём закрывается со стартом первой сессии уик-энда. После этого состав не изменить." />
            </div>
          </section>
        )}

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 1, flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="eyebrow">{locked ? 'Составы закрыты' : 'Дедлайн'} · {eventName}</span>
              {!locked && <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />}
            </div>
            {locked ? (
              <div className="mute" style={{ fontSize: 14, lineHeight: 1.5 }}>Закрыто {formatDateTime(data.lock_at)}. Очки появятся после гонки.</div>
            ) : (
              <Countdown to={data.lock_at} />
            )}
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2, flex: '2 1 400px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="eyebrow">Бюджет{limitless ? ' · Limitless' : ''}</span>
              <span className="num" style={{ fontSize: 14 }}>
                <b style={{ fontSize: 22, fontWeight: 600, color: overBudget ? 'var(--neg)' : undefined }}>{money(cost)}</b> <span className="mute">из {money(budget)}</span>
              </span>
            </div>
            <div className="stripes" style={{ height: 20 }} aria-hidden="true">
              {Array.from({ length: 20 }, (_, i) => <i key={i} className={i < stripeOn ? 'on' : ''} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="mute">{overBudget ? 'Перебор' : 'Осталось'}</span>
              <span className="num" style={{ fontWeight: 600, color: overBudget ? 'var(--neg)' : undefined }}>{money(Math.abs(left))}</span>
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 3, flex: '2 1 400px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="eyebrow">Замены</span>
              <span className={`chip ${penalty ? 'red' : 'green'}`}>{first ? 'Первая сборка' : freeTransfers ? 'Без штрафа' : penalty ? `−${penalty} очков` : 'Без штрафа'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{first ? '∞' : transfers}</span>
              <span className="mute" style={{ fontSize: 14 }}>{first ? 'состав собирается бесплатно' : `из ${data.free_before} бесплатн${data.free_before === 1 ? 'ой' : 'ых'}`}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: penalty ? '#ffb0a8' : 'var(--mute)' }}>
              {first
                ? 'Дальше: 2 бесплатные замены перед следующим этапом, потом +1 за этап, копится до двух.'
                : freeTransfers
                  ? `${draft.chip === 'wildcard' ? 'Wildcard' : 'Limitless'}: замены на этом этапе не считаются.`
                  : penalty
                    ? `Лишних замен: ${extra}. Каждая стоит −${data.rules.transfer_penalty} очков.`
                    : `Каждая замена сверх бесплатных стоит −${data.rules.transfer_penalty} очков. Вернуть пилота обратно — бесплатно.`}
            </div>
          </section>
        </div>

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 4, flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="h">Пилоты <span className="num mute" style={{ fontSize: 15, marginLeft: 6 }}>{draft.drivers.length}/5</span></span>
              <span className="mute" style={{ fontSize: 13 }}>DRS-буст ×{draft.chip === 'extra_drs' ? 3 : 2}{draft.chip === 'autopilot' ? ' · Autopilot выберет сам' : ''}</span>
            </div>
            {!locked && outInSquad.map((d) => d && (
              <div key={d.id} className="sbn">
                <span className="ic"><IconSwap /></span>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name} не участвует в этапе</div>
                  <div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                    {d.team_name} заявил {drivers.get(d.sub!)?.name}. Если не замените сами до закрытия, очки резервиста засчитаются автоматически. Замена бесплатная и не считается трансфером.
                  </div>
                </div>
                <button type="button" className="mini go" onClick={() => swap(d.id, d.sub!)}>Поставить {drivers.get(d.sub!)?.name.split(' ').at(-1)}</button>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }, (_, i) => {
                const id = draft.drivers[i];
                const d = id ? drivers.get(id) : undefined;
                if (!d) {
                  return <div key={`e${i}`} className="slot empty" style={{ minHeight: 82 }}><span className="mute" style={{ fontSize: 14 }}>Свободный слот. Выберите пилота в списке ниже.</span></div>;
                }
                const boosted = draft.drs === d.id;
                return (
                  <div key={d.id} className={`slot ${boosted ? 'boost' : ''}`}>
                    <DriverTile driver={{ code: d.code, number: d.number, color: d.color ?? '#3a3a42', team_code: d.team_code ?? '', name: d.name }} size={68} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>
                        {d.name}
                        {d.out && <span className="tagw" style={{ marginLeft: 10 }}>не участвует в этапе</span>}
                      </div>
                      <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{d.team_name}</div>
                    </div>
                    <div style={{ textAlign: 'right', width: 110 }}>
                      <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{money(d.price)}</div>
                      <div className="mute num" style={{ fontSize: 12, marginTop: 3 }}>{pts(d.pts3)} очк. за 3 этапа</div>
                    </div>
                    {!locked && (
                      <>
                        <button type="button" className={`bst ${boosted ? 'on' : ''}`} aria-pressed={boosted} disabled={draft.chip === 'autopilot'}
                          onClick={() => setDraft((x) => ({ ...x, drs: x.drs === d.id ? null : d.id }))}>
                          DRS ×{draft.chip === 'extra_drs' ? 3 : 2}
                        </button>
                        <button type="button" className="xbtn" aria-label="Убрать из состава" onClick={() => toggleDriver(d.id)}><IconX /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
              <span className="h">Конструкторы <span className="num mute" style={{ fontSize: 15, marginLeft: 6 }}>{draft.teams.length}/2</span></span>
              <span className="mute" style={{ fontSize: 13 }}>очки двух пилотов + бонусы квалификации</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 2 }, (_, i) => {
                const id = draft.teams[i];
                const t = id ? teams.get(id) : undefined;
                if (!t) {
                  return <div key={`t${i}`} className="slot empty" style={{ minHeight: 82 }}><span className="mute" style={{ fontSize: 14 }}>Свободный слот. Переключите список ниже на «Конструкторы».</span></div>;
                }
                const car = teamCar(t.code as TeamCode);
                return (
                  <div key={t.id} className="slot">
                    <div style={{ width: 132, flex: 'none', display: 'flex', justifyContent: 'center', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,.5))' }}>
                      {car && <img src={car} alt="" style={{ width: '100%', height: 'auto' }} loading="lazy" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</div>
                      <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>Конструктор</div>
                    </div>
                    <div style={{ textAlign: 'right', width: 110 }}>
                      <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>{money(t.price)}</div>
                      <div className="mute num" style={{ fontSize: 12, marginTop: 3 }}>{pts(t.pts3)} очк. за 3 этапа</div>
                    </div>
                    {!locked && <button type="button" className="xbtn" aria-label="Убрать из состава" onClick={() => toggleTeam(t.id)}><IconX /></button>}
                  </div>
                );
              })}
            </div>
            {locked && data.squad?.chip === 'final_fix' && <FinalFixBox data={data} />}
          </section>

          <section className="card rise" style={{ ['--i' as string]: 5, flex: '2 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="h">Чипы</span>
              <span className="chip">{chipsLeft} из 6 доступно</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(210px,100%),1fr))', gap: 12 }}>
              {CHIPS.map((k) => {
                const u = used.get(k.id);
                const active = draft.chip === k.id;
                const blockedFirst = k.notFirst && (data.is_start || first);
                const blockedRow = (k.id === 'wildcard' || k.id === 'limitless') && (data.prev_chip === 'wildcard' || data.prev_chip === 'limitless');
                const status = u ? `Использован · этап ${u.round}` : active ? 'Активен' : blockedFirst ? 'Не на первом этапе' : blockedRow ? 'Не сразу после WC/LL' : 'Доступен';
                const can = !u && !locked && !blockedFirst && !blockedRow;
                return (
                  <div key={k.id} className={`chipc ${active ? 'act' : u ? 'used' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="code">{k.code}</span>
                      <span className="mute" style={{ fontSize: 12 }}>{status}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{k.name}</div>
                      <div className="mute" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{k.desc}</div>
                    </div>
                    <button type="button" className={`mini ${active ? 'in' : can ? '' : 'off'}`} disabled={!can && !active || locked}
                      onClick={() => setDraft((x) => ({ ...x, chip: x.chip === k.id ? null : k.id }))}>
                      {active ? 'Отменить' : can ? 'Сыграть' : 'Недоступен'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--mute)' }}>Один чип за этап, каждый — один раз за сезон. Отменить можно до закрытия составов.</div>
          </section>
        </div>

        {!locked && (
          <section className="card rise" style={{ ['--i' as string]: 6, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="h">Выбор активов</span>
                <Link to="/fantasy/market" className="mute" style={{ fontSize: 13, textDecoration: 'underline' }}>Рынок с ценами и изменениями</Link>
              </div>
              <div className="seg" role="group" aria-label="Тип актива">
                <button type="button" className={mode === 'drivers' ? 'on' : ''} onClick={() => setMode('drivers')}>Пилоты</button>
                <button type="button" className={mode === 'teams' ? 'on' : ''} onClick={() => setMode('teams')}>Конструкторы</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 14px' }} className="eyebrow">
              <span style={{ flex: 1 }}>Актив</span><span style={{ width: 90, textAlign: 'right' }}>Цена</span>
              <span style={{ width: 130, textAlign: 'right' }}>Очки за 3 этапа</span><span style={{ width: 190, textAlign: 'right' }}>Действие</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(mode === 'drivers' ? data.market.drivers : data.market.teams).map((a) => {
                const isDriver = mode === 'drivers';
                const inSquad = isDriver ? draft.drivers.includes(a.id) : draft.teams.includes(a.id);
                const full = isDriver ? draft.drivers.length >= 5 : draft.teams.length >= 2;
                const tooExpensive = !limitless && !inSquad && Number(a.price) > left + 0.001;
                const team = isDriver ? (a as (typeof data.market.drivers)[number]).team_name : null;
                return (
                  <div key={a.id} className="trow">
                    <span style={{ width: 6, height: 30, borderRadius: 3, background: a.color ?? '#3a3a42' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500 }}>
                      {a.name}
                      {team && <span className="mute" style={{ fontSize: 13, marginLeft: 10 }}>{team}</span>}
                    </span>
                    <span className="num" style={{ width: 90, textAlign: 'right', fontSize: 15, fontWeight: 600 }}>{money(a.price)}</span>
                    <span className="num mute" style={{ width: 130, textAlign: 'right', fontSize: 15 }}>{pts(a.pts3)}</span>
                    <span style={{ width: 190, textAlign: 'right' }}>
                      <button type="button" className={`mini ${inSquad ? 'in' : full || tooExpensive ? 'off' : 'go'}`} disabled={!inSquad && full}
                        onClick={() => (isDriver ? toggleDriver(a.id) : toggleTeam(a.id))}>
                        {inSquad ? 'В составе · убрать' : full ? 'Нет места' : tooExpensive ? 'Не хватает бюджета' : 'Добавить'}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {data.squad?.auto && <div className="mute" style={{ fontSize: 13 }}>Этот состав скопирован с прошлого этапа: вы не отправили новый до закрытия.</div>}
      </Content>
      {toast && <Toast tone={toast.tone} title={toast.title} text={toast.text} onDone={() => setToast(null)} />}
    </>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="step">
      <b>{n}</b>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
        <div className="mute" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{text}</div>
      </div>
    </div>
  );
}

/** Final Fix: одна замена пилота после закрытия составов и до старта гонки. */
function FinalFixBox({ data }: { data: SquadScreen }) {
  const qc = useQueryClient();
  const s = data.squad!;
  const [out, setOut] = useState(s.drivers[0]!);
  const [inn, setInn] = useState('');
  const fix = useMutation({
    mutationFn: () => finalFix(data.event!.id, out, inn),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['screen', 'fantasy'] }),
  });
  if (s.final_fix) {
    const name = (id: string) => data.market.drivers.find((d) => d.id === id)?.name ?? id;
    return <div className="alert ok">Final Fix: {name(s.final_fix.in)} вместо {name(s.final_fix.out)}.</div>;
  }
  const candidates = data.market.drivers.filter((d) => !s.drivers.includes(d.id));
  return (
    <div className="sbn">
      <span className="ic"><IconSwap /></span>
      <div style={{ flex: '1 1 260px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <b style={{ width: '100%' }}>Final Fix: одна замена до старта гонки</b>
        <select className="in" style={{ height: 40, width: 'auto' }} value={out} onChange={(e) => setOut(e.target.value)} aria-label="Кого убрать">
          {s.drivers.map((id) => <option key={id} value={id}>{data.market.drivers.find((d) => d.id === id)?.name ?? id}</option>)}
        </select>
        <span className="mute">→</span>
        <select className="in" style={{ height: 40, width: 'auto' }} value={inn} onChange={(e) => setInn(e.target.value)} aria-label="Кого поставить">
          <option value="">Выбрать пилота</option>
          {candidates.map((d) => <option key={d.id} value={d.id}>{d.name} · {money(d.price)}</option>)}
        </select>
        {fix.error && <div className="alert bad" style={{ width: '100%' }}>{fix.error.message}</div>}
      </div>
      <button type="button" className={`${b.cta} ${b.sm}`} disabled={!inn || fix.isPending} onClick={() => fix.mutate()}>Заменить</button>
    </div>
  );
}
