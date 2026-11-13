import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { driverPhoto, teamCar, teamLogo, type TeamCode } from '@/lib/assets';
import { StageSummary } from './StageSummary';
import { homeScreen, screenKeys, type HomeScreen, nextDeadline } from '@/lib/api/screens';
import { getCurrentLeague, setCurrentLeague } from '@/lib/currentLeague';
import { SESSION_NAMES, formatDateTime, formatDayShort, formatTime, gpLines } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { Avatar, Countdown, DriverTile, Skeleton } from '@/ui/game';
import { IconCrosshair } from '@/ui/icons';
import { hasTrack } from '@/lib/tracks';
import { Notices } from '@/ui/Toast';
import { TrackMap } from '@/ui/TrackMap';
import { weatherIcon, weatherText, weekday } from './weather';
import { Content, PageTitle, PillLink, PrimaryLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import { avatarOf } from '@/lib/avatar';
import { t } from '@/i18n';
import { Select } from '@/ui/Select';

/**
 * Главная (макет Main): чемпионат мира (топ-5), следующий этап с таймером и схемой трассы, сезон,
 * последний победитель, уик-энд с погодой, календарь, таблица лиги и кто отправил прогноз.
 * Блок фэнтези-лиги — в фазе 4.
 */
export default function HomePage() {
  const [league, setLeague] = useState(getCurrentLeague);
  const q = useQuery({ queryKey: screenKeys.home(league), queryFn: () => homeScreen(league) });
  const data = q.data;
  const now = useServerNow();
  const ev = data?.event ?? null;
  const next = nextDeadline(ev, now);
  const open = !!next;

  const pickLeague = (id: string) => {
    setCurrentLeague(id);
    setLeague(id);
  };

  return (
    <>
      <PageTitle title={t('common.home')} sub={t('common.season', { year: 2026 })} />
      <Toolbar>
        <PrimaryLink to="/predict" icon={<IconCrosshair />}>
          {data?.submitted ? (open ? t('common.editPrediction') : t('common.myPrediction')) : t('common.makePrediction')}
        </PrimaryLink>
        <ToolbarDivider />
        <PillLink to="/" end>{t('common.home')}</PillLink>
        <PillLink to="/league">{t('common.friendsLeague')}{data ? <span className="num mute">{data.leagues.length || ''}</span> : null}</PillLink>
        <PillLink to="/results">{t('common.results')}</PillLink>
        <PillLink to="/schedule">{t('common.calendar')}</PillLink>
      </Toolbar>
      <Content>
        {q.isLoading ? (
          <div className="row"><div className="card" style={{ flex: '2 1 640px' }}><Skeleton h={360} /></div><div className="card" style={{ flex: '1 1 300px' }}><Skeleton h={360} /></div></div>
        ) : q.error ? (
          <div className="empty-state"><h3>{t('common.noServer')}</h3><p>{t('common.noServerText')}</p><button type="button" className={`${b.cta} ${b.sm}`} onClick={() => q.refetch()}>{t('common.retry')}</button></div>
        ) : (
          <>
            <Notices notices={data!.notices} />
            <StageSummary summary={data!.summary} />
            <Championship data={data!} />
            <div className="row">
              <NextStage data={data!} next={next} />
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

function NextStage({ data, next }: { data: HomeScreen; next: { at: string; label: string } | null }) {
  const open = !!next;
  const ev = data.event;
  if (!ev) {
    return (
      <section className="card rise" style={{ flex: '2 1 640px' }}>
        <div className="eyebrow">{t('common.season', { year: 2026 })}</div>
        <h1 style={{ margin: '14px 0 0', fontSize: 40 }}>{t('home.seasonOver')}</h1>
        <p className="mute">{t('home.seasonOverText')}</p>
      </section>
    );
  }
  const [gp, rest] = gpLines(ev.name);
  return (
    <section className="card rise" style={{ ['--i' as string]: 1, flex: '2 1 640px', minWidth: 0, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', gap: 24, padding: 32, background: 'radial-gradient(120% 140% at 85% 0%,var(--glowc),transparent 55%),linear-gradient(180deg,#131317,#0c0c0f)' }}>
      <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={open ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: open ? 'var(--accent)' : '#3a3a42' }} />
          <span className="eyebrow">{open ? t('home.weekendOpen') : t('home.weekendClosed')}</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.04, letterSpacing: '-.025em', fontWeight: 600 }}>
            {gp}
            <br />
            {rest}
          </h1>
          <p className="mute" style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.5 }}>
            {ev.deadline
              ? next
                ? t('home.closesAt', { block: next.label, at: formatDateTime(next.at) })
                : ev.split_deadlines
                  ? t('home.raceStarted')
                  : t('home.qualyStarted', { at: formatDateTime(ev.deadline) })
              : t('home.noQualyTime')}
          </p>
        </div>
        {next && <Countdown to={next.at} />}
        <div>
          <Link className={b.cta} style={{ padding: '0 28px', background: 'var(--text)', color: '#0a0a0d', boxShadow: '0 0 0 1px rgba(255,255,255,.25),0 8px 32px var(--glowc)' }} to="/predict">
            {data.submitted ? (open ? t('common.editPrediction') : t('common.myPrediction')) : t('common.makePrediction')}
          </Link>
          {data.submitted && open && <span className="chip green" style={{ marginLeft: 12 }}>{t('common.predictionSent')}</span>}
        </div>
      </div>
      {hasTrack(data.track) && (
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrackMap slug={data.track} label={ev.name} />
        </div>
      )}
      <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="eyebrow">{t('home.season')}</span>
          <span className="mute num" style={{ fontSize: 13 }}>{t('home.roundOf', { round: ev.round, total: ev.season_rounds })}</span>
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

/** Макет Main: «Чемпионат мира · Топ-5», переключатель пилоты/команды, полоска от лидера. */
function Championship({ data }: { data: HomeScreen }) {
  const [mode, setMode] = useState<'drivers' | 'teams'>('drivers');
  // Старый ответ базы (до миграции 0009) поля не содержит — блок просто не показываем.
  const list = data.championship?.[mode] ?? [];
  if (!data.championship?.drivers?.length) return null;
  const max = Number(list[0]?.points ?? 1) || 1;
  return (
    <section className="card rise" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="h">{t('home.championship')}</h2>
          <span className="chip">{t('home.top5')}</span>
        </div>
        <div className="seg" role="group" aria-label={t('home.standingsAria')}>
          <button type="button" className={mode === 'drivers' ? 'on' : ''} onClick={() => setMode('drivers')}>{t('common.drivers')}</button>
          <button type="button" className={mode === 'teams' ? 'on' : ''} onClick={() => setMode('teams')}>{t('common.teams')}</button>
        </div>
      </div>
      <div key={mode} className="rise" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px,100%),1fr))', gap: 14 }}>
        {list.map((x) => {
          const on = Math.round((Number(x.points) / max) * 14);
          const car = mode === 'teams' && x.team_code ? teamCar(x.team_code as TeamCode) : null;
          return (
            <div key={x.position} style={{ padding: 18, borderRadius: 20, background: 'var(--bg-field)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 72 }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{x.position}</span>
                {mode === 'drivers' && x.code ? (
                  <DriverTile driver={{ code: x.code, number: x.number, color: x.color ?? '#9a9aa4', team_code: x.team_code ?? '', name: x.name ?? '' }} size={72} />
                ) : car ? (
                  <img src={car} alt={t('common.carOf', { team: x.team_name ?? '' })} loading="lazy" decoding="async" width={110} height={24} style={{ width: 110, height: 'auto', objectFit: 'contain', marginTop: 18 }} />
                ) : null}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{mode === 'drivers' ? x.name : x.team_name}</div>
                <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                  {mode === 'drivers' ? x.team_name : t('common.constructors')}
                  {x.wins ? t('home.wins', { n: x.wins }) : ''}
                </div>
              </div>
              <div className="stripes" style={{ height: 18 }} aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} className={i < on ? 'on' : ''} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{Number(x.points)}</span>
                <span className="mute" style={{ fontSize: 12 }}>{t('common.points')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LastWinner({ data }: { data: HomeScreen }) {
  const w = data.last_race?.podium?.[0];
  if (!w) return null;
  const car = teamCar(w.team_code as TeamCode);
  const logo = teamLogo(w.team_code as TeamCode);
  const photo = driverPhoto(w.code);
  return (
    <section className="card rise" style={{ ['--i' as string]: 1, flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">{t('home.lastRace')}</span>
        <span className="chip red">{t('home.winner')}</span>
      </div>
      <div style={{ position: 'relative', height: 230, borderRadius: 20, overflow: 'hidden', background: `radial-gradient(90% 80% at 50% 100%, color-mix(in srgb, ${w.color} 40%, transparent), transparent 70%), linear-gradient(180deg,#17171c,#0e0e11)`, border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {/* Макет Main: логотип команды и фото прямо в блоке, без отдельной плитки. */}
        {logo && (
          <img src={logo} alt="" loading="lazy" decoding="async"
            style={{ position: 'absolute', left: '50%', top: '50%', width: '56%', height: '72%', transform: 'translate(-50%,-50%)', objectFit: 'contain', opacity: 0.16 }} />
        )}
        {photo ? (
          <img src={photo} alt={w.name} loading="lazy" decoding="async" style={{ position: 'relative', zIndex: 1, height: '100%', width: 'auto', objectFit: 'contain' }} />
        ) : (
          <span style={{ position: 'relative', zIndex: 1, alignSelf: 'center', font: '700 96px var(--font-num)', color: 'rgba(255,255,255,.92)', textShadow: '0 2px 8px rgba(0,0,0,.55)' }}>{w.code}</span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em' }}>{w.name}</div>
        <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{w.team_name} · {data.last_race!.event}</div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--bg-field)', border: '1px solid var(--line)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow">{t('home.team')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 5, height: 26, borderRadius: 3, background: w.color }} />
            <span style={{ font: '600 20px var(--font-num)', letterSpacing: '-.01em' }}>{w.team_name}</span>
          </div>
          <span className="mute" style={{ fontSize: 12 }}>{t('home.constructorCode', { code: w.team_code })}</span>
        </div>
        {car && <img src={car} alt={t('common.carOf', { team: w.team_name })} loading="lazy" decoding="async" width={230} height={51} style={{ width: '58%', maxWidth: 230, height: 'auto', objectFit: 'contain', flex: 'none' }} />}
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
        <h2 className="h">{t('home.weekend')}</h2>
        <div className="seg" role="group" aria-label={t('home.sectionAria')}>
          <button type="button" className={tab === 'sched' ? 'on' : ''} onClick={() => setTab('sched')}>{t('common.schedule')}</button>
          <button type="button" className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>{t('common.results')}</button>
        </div>
      </div>
      {(data.weather ?? []).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min((data.weather ?? []).length, 4)},minmax(0,1fr))`, gap: 10 }} aria-label={t('home.weatherAria')}>
          {(data.weather ?? []).slice(-4).map((w) => (
            <div key={w.day} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--bg-field)', border: '1px solid var(--line)' }} title={weatherText(w.code)}>
              <span style={{ fontSize: 22 }} aria-hidden="true">{weatherIcon(w.code)}</span>
              <div>
                <div className="eyebrow">{weekday(w.day)}</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
                  {w.t_max != null ? `${Math.round(Number(w.t_max))}°` : '—'}
                  <span className="mute" style={{ fontSize: 12, marginLeft: 8, fontWeight: 500 }}>
                    {w.wind_max != null ? t('home.kmh', { n: Math.round(Number(w.wind_max)) }) : ''}
                    {w.precip_prob ? ` · ☂ ${w.precip_prob}%` : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tab === 'sched' ? (
          (ev?.sessions ?? []).map((s) => {
            const past = Date.parse(s.starts_at) < now;
            return (
              <div key={s.kind} className="trow" style={{ opacity: past ? 0.5 : 1 }}>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{SESSION_NAMES[s.kind]}</span>
                {s.kind === 'qualy' && <span className="chip red">{t('common.deadline')}</span>}
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
            <Link to="/results" className="mute" style={{ fontSize: 13, padding: '6px 14px' }}>{t('home.allResults')}</Link>
          </>
        ) : (
          <div className="mute" style={{ padding: 14 }}>{t('home.noResults')}</div>
        )}
      </div>
      <div className="mute" style={{ fontSize: 12 }}>
        {t('common.timeLocal')}
        {(data.weather ?? []).length > 0 && (
          <>
            {' '}{t('home.weatherCredit')} <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Open-Meteo.com</a> (CC BY 4.0).
          </>
        )}
      </div>
    </section>
  );
}

function Calendar({ data }: { data: HomeScreen }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: 3, flex: '2 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="h">{t('common.calendar')}</h2>
        <span className="chip">{t('home.next')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.next_events.map((e, i) => (
          <div key={e.round} className="trow" style={{ padding: 14 }}>
            <span className="num mute" style={{ width: 30, fontSize: 15 }}>{e.round}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{e.name}</div>
              <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{i === data.next_events.length - 1 && data.event && e.round === data.event.season_rounds ? t('home.seasonFinal') : t('home.race')}</div>
            </div>
            <span className="num mute" style={{ fontSize: 14 }}>{formatDayShort(e.race_at)}</span>
          </div>
        ))}
        {data.next_events.length === 0 && <div className="mute" style={{ padding: 14 }}>{t('home.lastOfSeason')}</div>}
        <Link to="/schedule" className="mute" style={{ fontSize: 13, padding: '6px 14px' }}>{t('home.fullCalendar')}</Link>
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
          <h3>{t('home.betterWithFriends')}</h3>
          <p>{t('home.betterWithFriendsText')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className={`${b.cta} ${b.sm}`} to="/lobby/create">{t('common.createLobby')}</Link>
            <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/lobby/join">{t('common.joinByCode')}</Link>
          </div>
        </div>
      </section>
    );
  }
  const name = data.leagues.find((l) => l.id === data.league_id)?.name ?? t('home.league');
  const sent = new Map(data.submissions.map((s) => [s.user_id, s.submitted]));
  return (
    <section className="card rise" style={{ ['--i' as string]: 4, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="h">{t('common.friendsLeague')}</h2>
          {data.leagues.length > 1 ? (
            <Select size="pill" value={data.league_id} onChange={onPick} aria-label={t('home.pickLeague')}
              options={data.leagues.map((l) => ({ value: l.id, label: l.name }))} />
          ) : (
            <span className="chip">{name}</span>
          )}
        </div>
        <Link className="mini go" to={`/league/${data.league_id}`} style={{ display: 'inline-flex', alignItems: 'center' }}>{t('home.fullTable')}</Link>
      </div>
      <div>
        {data.table.map((r) => (
          <div key={r.user_id} className={`trow ${r.user_id === me ? 'me' : r.rank === 1 && r.points > 0 ? 'lead' : ''}`}>
            <span className="num" style={{ width: 30, fontSize: 20, fontWeight: 600 }}>{r.rank}</span>
            <Avatar {...avatarOf(r)} />
            <span style={{ flex: 1, fontWeight: 600 }}>{r.nickname}</span>
            {data.event && (
              <span className={`chip ${sent.get(r.user_id) ? 'green' : ''}`}>{sent.get(r.user_id) ? t('common.predictionSent') : t('home.waitingPrediction')}</span>
            )}
            <span className="num" style={{ width: 70, textAlign: 'right', fontSize: 18, fontWeight: 600 }}>{r.points}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
