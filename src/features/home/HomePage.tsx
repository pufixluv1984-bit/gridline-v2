import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { teamCar, type TeamCode } from '@/lib/assets';
import { homeScreen, screenKeys, type HomeScreen } from '@/lib/api/screens';
import { getCurrentLeague, setCurrentLeague } from '@/lib/currentLeague';
import { SESSION_NAMES, formatDateTime, formatDayShort, formatTime } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { Avatar, Countdown, DriverTile, Skeleton } from '@/ui/game';
import { IconCrosshair } from '@/ui/icons';
import { Content, PageTitle, PillLink, PrimaryLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';

/**
 * Главная (макет Main). Фаза 1: следующий этап с таймером, сезон, последний победитель,
 * расписание уик-энда, календарь, таблица лиги и кто отправил прогноз.
 * Чемпионат мира, погода и трасса — в следующих итерациях.
 */
export default function HomePage() {
  const [league, setLeague] = useState(getCurrentLeague);
  const q = useQuery({ queryKey: screenKeys.home(league), queryFn: () => homeScreen(league) });
  const data = q.data;
  const now = useServerNow();
  const ev = data?.event ?? null;
  const open = !!ev?.deadline && Date.parse(ev.deadline) > now;

  const pickLeague = (id: string) => {
    setCurrentLeague(id);
    setLeague(id);
  };

  return (
    <>
      <PageTitle title="Главная" sub="Сезон 2026" />
      <Toolbar>
        <PrimaryLink to="/predict" icon={<IconCrosshair />}>
          {data?.submitted ? (open ? 'Изменить прогноз' : 'Мой прогноз') : 'Сделать прогноз'}
        </PrimaryLink>
        <ToolbarDivider />
        <PillLink to="/" end>Главная</PillLink>
        <PillLink to="/league">Лига друзей{data ? <span className="num mute">{data.leagues.length || ''}</span> : null}</PillLink>
        <PillLink to="/results">Результаты</PillLink>
        <PillLink to="/schedule">Календарь</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="row"><div className="card" style={{ flex: '2 1 640px' }}><Skeleton h={360} /></div><div className="card" style={{ flex: '1 1 300px' }}><Skeleton h={360} /></div></div>
        ) : q.error ? (
          <div className="empty-state"><h3>Нет связи с сервером</h3><p>Проверь интернет — мы попробуем ещё раз автоматически.</p><button type="button" className={`${b.cta} ${b.sm}`} onClick={() => q.refetch()}>Повторить</button></div>
        ) : (
          <>
            <div className="row">
              <NextStage data={data!} open={open} />
              <LastWinner data={data!} />
            </div>
            <div className="row">
              <Weekend data={data!} />
              <Calendar data={data!} />
            </div>
            <LeagueCard data={data!} onPick={pickLeague} />
          </>
        )}
      </Content>
    </>
  );
}

function NextStage({ data, open }: { data: HomeScreen; open: boolean }) {
  const ev = data.event;
  if (!ev) {
    return (
      <section className="card rise" style={{ flex: '2 1 640px' }}>
        <div className="eyebrow">Сезон 2026</div>
        <h1 style={{ margin: '14px 0 0', fontSize: 40 }}>Сезон завершён</h1>
        <p className="mute">Прогнозы снова откроются перед первым этапом 2027 года.</p>
      </section>
    );
  }
  const [gp, ...rest] = ev.name.split(' ');
  return (
    <section className="card rise" style={{ flex: '2 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22, padding: 32, background: 'radial-gradient(120% 140% at 85% 0%,var(--glowc),transparent 55%),linear-gradient(180deg,#131317,#0c0c0f)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={open ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: open ? 'var(--accent)' : '#3a3a42' }} />
        <span className="eyebrow">Следующий этап · {open ? 'приём прогнозов открыт' : 'приём закрыт'}</span>
      </div>
      <div>
        <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.04, letterSpacing: '-.025em', fontWeight: 600 }}>
          {gp}<br />{rest.join(' ')}
        </h1>
        <p className="mute" style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.5 }}>
          {ev.deadline
            ? open
              ? `Приём закрывается с началом квалификации — ${formatDateTime(ev.deadline)} по твоему времени.`
              : `Квалификация началась ${formatDateTime(ev.deadline)}. Прогнозы друзей уже открыты.`
            : 'Время квалификации ещё не объявлено.'}
        </p>
      </div>
      {open && ev.deadline && <Countdown to={ev.deadline} />}
      <div>
        <Link className={`${b.cta}`} style={{ padding: '0 28px', background: 'var(--text)', color: '#0a0a0d', boxShadow: '0 0 0 1px rgba(255,255,255,.25),0 8px 32px var(--glowc)' }} to="/predict">
          {data.submitted ? (open ? 'Изменить прогноз' : 'Мой прогноз') : 'Сделать прогноз'}
        </Link>
        {data.submitted && open && <span className="chip green" style={{ marginLeft: 12 }}>Прогноз отправлен</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="eyebrow">Сезон</span>
          <span className="mute num" style={{ fontSize: 13 }}>этап {ev.round} из {ev.season_rounds}</span>
        </div>
        <div className="stripes" aria-hidden="true">
          {Array.from({ length: ev.season_rounds }, (_, i) => (
            <i key={i} className={i + 1 < ev.round ? 'on' : i + 1 === ev.round ? 'now' : ''} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LastWinner({ data }: { data: HomeScreen }) {
  const w = data.last_race?.podium?.[0];
  if (!w) return null;
  const car = teamCar(w.team_code as TeamCode);
  return (
    <section className="card rise" style={{ ['--i' as string]: 1, flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">Последний этап</span>
        <span className="chip red">Победитель</span>
      </div>
      <div style={{ position: 'relative', height: 230, borderRadius: 20, overflow: 'hidden', background: `radial-gradient(90% 80% at 50% 100%, color-mix(in srgb, ${w.color} 40%, transparent), transparent 70%), linear-gradient(180deg,#17171c,#0e0e11)`, border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <DriverTile driver={{ code: w.code, number: null, color: w.color, team_code: w.team_code, name: w.name }} size={200} className="hero" />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em' }}>{w.name}</div>
        <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{w.team_name} · {data.last_race!.event}</div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--bg-field)', border: '1px solid var(--line)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">Команда</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 5, height: 26, borderRadius: 3, background: w.color }} />
            <span style={{ font: '600 20px var(--font-num)', letterSpacing: '-.01em' }}>{w.team_name}</span>
          </div>
          <span className="mute" style={{ fontSize: 12 }}>Конструктор · {w.team_code}</span>
        </div>
        {car && <img src={car} alt={`Болид ${w.team_name}`} loading="lazy" decoding="async" width={230} height={51} style={{ width: '58%', maxWidth: 230, height: 'auto', objectFit: 'contain', flex: 'none' }} />}
      </div>
    </section>
  );
}

function Weekend({ data }: { data: HomeScreen }) {
  const [tab, setTab] = useState<'sched' | 'res'>('sched');
  const ev = data.event;
  const now = useServerNow();
  return (
    <section className="card rise" style={{ ['--i' as string]: 2, flex: '3 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 className="h">Уик-энд</h2>
        <div className="seg" role="group" aria-label="Раздел">
          <button type="button" className={tab === 'sched' ? 'on' : ''} onClick={() => setTab('sched')}>Расписание</button>
          <button type="button" className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>Результаты</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tab === 'sched' ? (
          (ev?.sessions ?? []).map((s) => {
            const past = Date.parse(s.starts_at) < now;
            return (
              <div key={s.kind} className="trow" style={{ opacity: past ? 0.5 : 1 }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{SESSION_NAMES[s.kind]}</span>
                {s.kind === 'qualy' && <span className="chip red">Дедлайн</span>}
                <span className="num mute" style={{ fontSize: 15 }}>{formatDayShort(s.starts_at)}, {formatTime(s.starts_at)}</span>
              </div>
            );
          })
        ) : data.last_race?.podium ? (
          <>
            <div className="mute" style={{ fontSize: 13, padding: '0 14px 4px' }}>{data.last_race.event}</div>
            {data.last_race.podium.map((r) => (
              <div key={r.position} className="trow">
                <span className="num" style={{ width: 34, fontSize: 20, fontWeight: 600, textAlign: 'center' }}>{r.position}</span>
                <span style={{ width: 6, height: 30, borderRadius: 3, background: r.color }} />
                <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{r.name}<span className="mute" style={{ fontSize: 13, marginLeft: 10 }}>{r.team_name}</span></span>
              </div>
            ))}
            <Link to="/results" className="mute" style={{ fontSize: 13, padding: '6px 14px' }}>Все результаты →</Link>
          </>
        ) : (
          <div className="mute" style={{ padding: 14 }}>Результатов пока нет.</div>
        )}
      </div>
      <div className="mute" style={{ fontSize: 12 }}>Время — по твоему часовому поясу.</div>
    </section>
  );
}

function Calendar({ data }: { data: HomeScreen }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: 3, flex: '2 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="h">Календарь</h2>
        <span className="chip">Дальше</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.next_events.map((e, i) => (
          <div key={e.round} className="trow" style={{ padding: 14 }}>
            <span className="num mute" style={{ width: 30, fontSize: 15 }}>{e.round}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{e.name}</div>
              <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{i === data.next_events.length - 1 && data.event && e.round === data.event.season_rounds ? 'финал сезона' : 'гонка'}</div>
            </div>
            <span className="num mute" style={{ fontSize: 14 }}>{formatDayShort(e.race_at)}</span>
          </div>
        ))}
        {data.next_events.length === 0 && <div className="mute" style={{ padding: 14 }}>Это последний этап сезона.</div>}
        <Link to="/schedule" className="mute" style={{ fontSize: 13, padding: '6px 14px' }}>Весь календарь →</Link>
      </div>
    </section>
  );
}

function LeagueCard({ data, onPick }: { data: HomeScreen; onPick: (id: string) => void }) {
  const auth = useAuth();
  const me = auth.session?.user.id;
  if (!data.league_id) {
    return (
      <section className="card rise" style={{ ['--i' as string]: 4 }}>
        <div className="empty-state" style={{ minHeight: 200 }}>
          <h3>Играть интереснее с друзьями</h3>
          <p>Создай лобби и отправь друзьям ссылку — или войди по коду, который тебе прислали.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className={`${b.cta} ${b.sm}`} to="/lobby/create">Создать лобби</Link>
            <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/lobby/join">Войти по коду</Link>
          </div>
        </div>
      </section>
    );
  }
  const name = data.leagues.find((l) => l.id === data.league_id)?.name ?? 'Лига';
  const sent = new Map(data.submissions.map((s) => [s.user_id, s.submitted]));
  return (
    <section className="card rise" style={{ ['--i' as string]: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="h">Лига друзей</h2>
          {data.leagues.length > 1 ? (
            <select className="in" style={{ height: 36, width: 'auto', padding: '0 40px 0 14px', backgroundPosition: 'calc(100% - 22px) 15px, calc(100% - 16px) 15px' }} value={data.league_id} onChange={(e) => onPick(e.target.value)} aria-label="Выбрать лигу">
              {data.leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : (
            <span className="chip">{name}</span>
          )}
        </div>
        <Link className="mini go" to={`/league/${data.league_id}`} style={{ display: 'inline-flex', alignItems: 'center' }}>Вся таблица →</Link>
      </div>
      <div>
        {data.table.map((r) => (
          <div key={r.user_id} className={`trow ${r.user_id === me ? 'me' : r.rank === 1 && r.points > 0 ? 'lead' : ''}`}>
            <span className="num" style={{ width: 30, fontSize: 20, fontWeight: 600 }}>{r.rank}</span>
            <Avatar nickname={r.nickname} color={r.avatar_color} />
            <span style={{ flex: 1, fontWeight: 600 }}>{r.nickname}</span>
            {data.event && (
              <span className={`chip ${sent.get(r.user_id) ? 'green' : ''}`}>{sent.get(r.user_id) ? 'Прогноз отправлен' : 'Ждём прогноз'}</span>
            )}
            <span className="num" style={{ width: 70, textAlign: 'right', fontSize: 18, fontWeight: 600 }}>{r.points}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
