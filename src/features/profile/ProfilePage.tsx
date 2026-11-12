import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { teamCar, type TeamCode } from '@/lib/assets';
import { profileKeys, profileScreen, TITLE_NAMES, type ProfileScreen } from '@/lib/api/profile';
import { SESSION_NAMES } from '@/lib/time/format';
import { Avatar, DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, PrimaryLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import pg from '@/ui/Page.module.css';
import s from './Profile.module.css';
import { avatarOf } from '@/lib/avatar';
import { currentLocale, intlLocale, t, t as tr } from '@/i18n';

const IconEdit = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
);

function scrollTo(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
}

const pct = (hit: number, total: number) => (total > 0 ? Math.round((100 * hit) / total) : null);
/** «ноября 2026»: родительный падеж берём из формата с днём и убираем день. */
const monthYear = (iso: string) =>
  currentLocale() === 'en'
    ? new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(new Date(iso))
    : new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(iso))
        .replace(/^\d+\s/, '')
        .replace(/ (г|р)\.$/, '');

/** Макет Profile: свой профиль (/profile) или соседа по лиге (/profile/:id); архив сезонов — переключатель в истории. */
export default function ProfilePage() {
  const { id } = useParams();
  const auth = useAuth();
  const me = auth.session?.user.id;
  const player = id && id !== me ? id : undefined;
  const [season, setSeason] = useState<number | undefined>(undefined);
  const q = useQuery({ queryKey: profileKeys.screen(player, season), queryFn: () => profileScreen(player, season) });
  const data = q.data;
  const p = data?.player;

  if (q.error || (data && !p)) {
    return (
      <>
        <PageTitle title={t('drv.profile')} />
        <Content>
          <div className="empty-state">
            <h3>{t('prof.unavailable')}</h3>
            <p>{t('prof.unavailableText')}</p>
            <Link className={`${b.cta} ${b.sm}`} to="/league">{t('league.toMine')}</Link>
          </div>
        </Content>
      </>
    );
  }

  const isMe = !!data?.is_me;
  const history = data?.history ?? [];
  const total = history.reduce((a, x) => a + x.points, 0);
  const last = history.at(-1);
  const acc = data?.accuracy;
  const overall = acc ? pct(acc.qualy_hit + acc.race_hit, acc.qualy_total + acc.race_total) : null;
  const firstLeague = data?.leagues[0];
  const fl = data?.fantasy?.league;

  return (
    <>
      <PageTitle title={t('drv.profile')} sub={p?.nickname ?? '…'} />
      <Toolbar>
        {isMe && (
          <PrimaryLink to="/settings" icon={<IconEdit />}>
            {t('prof.edit')}
          </PrimaryLink>
        )}
        {isMe && <ToolbarDivider />}
        <a className={`${pg.pill} ${pg.pillOn}`} href="#top" onClick={scrollTo('top')}>{t('drv.overview')}</a>
        <a className={pg.pill} href="#history" onClick={scrollTo('history')}>{t('prof.history')}</a>
        <a className={pg.pill} href="#leagues" onClick={scrollTo('leagues')}>{t('prof.leagues')}</a>
        {isMe && <PillLink to="/settings">{t('settings.sub')}</PillLink>}
      </Toolbar>
      <Content>
        <div id="top" />
        {!data ? (
          <Skeleton h={168} />
        ) : (
          <Hero data={data} />
        )}

        <div className="row">
          {fl ? (
            <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 1 }}>
              <div className="eyebrow">{t('prof.fantasyPlace')}</div>
              <div className={`num ${s.big}`}>{fl.rank}<small> {t('prof.ofN', { n: fl.members })}</small></div>
              <div style={{ marginTop: 14 }}>
                {fl.rank === 1 && Number(fl.points) > 0 ? <span className="chip green">{t('prof.leader')}</span> : <span className="chip">{fl.name}</span>}
              </div>
            </section>
          ) : (
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 1 }}>
            <div className="eyebrow">{t('prof.leaguePlace')}</div>
            <div className={`num ${s.big}`}>
              {firstLeague?.rank ?? '—'}
              {firstLeague && <small> {t('prof.ofN', { n: firstLeague.member_count })}</small>}
            </div>
            <div style={{ marginTop: 14 }}>
              {firstLeague ? (
                firstLeague.rank === 1 && total > 0 ? <span className="chip green">{t('prof.leader')}</span> : <span className="chip">{firstLeague.name}</span>
              ) : (
                <span className="mute" style={{ fontSize: 14 }}>{t('prof.noLeague')}</span>
              )}
            </div>
          </section>
          )}
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 2 }}>
            <div className="eyebrow">{t('prof.seasonPts')}</div>
            <div className={`num ${s.big}`}>{total.toLocaleString(intlLocale())}</div>
            <div className={s.note}>{last ? t('prof.lastRound', { p: last.points, r: last.round }) : t('prof.ptsLater')}</div>
          </section>
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 3 }}>
            <div className="eyebrow">{t('prof.accuracy')}</div>
            <div className={`num ${s.big}`}>{overall ?? '—'}{overall !== null && <small>%</small>}</div>
            <div className={s.note}>{t('prof.accuracyNote')}</div>
          </section>
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 4 }}>
            <div className="eyebrow">{t('prof.bestStreak')}</div>
            <div className={`num ${s.big}`}>
              {data?.best_streak ?? 0}
              <small> {t('prof.rounds', { n: data?.best_streak ?? 0 })}</small>
            </div>
            <div className={s.note}>{t('prof.streakNote')}</div>
          </section>
        </div>

        <div className="row">
          {data?.fantasy?.squad ? <FantasyCard data={data} /> : <BestDrivers data={data} />}
          <PredictCard data={data} me={me} />
        </div>
        {data?.fantasy?.squad && (
          <div className="row">
            <BestDrivers data={data} />
          </div>
        )}

        <History data={data} season={season} onSeason={setSeason} />

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 8, flex: '1 1 480px' }} id="leagues">
            <h2 className="h">{t('prof.leagues')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {(data?.leagues ?? []).map((l, i) => (
                <Link key={l.id} to={`/league/${l.id}`} className="lrow" style={i === 0 ? { borderColor: 'rgba(255,212,0,.4)' } : undefined}>
                  <Avatar nickname={l.name} color={i === 0 ? 'var(--gold)' : '#2b2b33'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{l.name}</div>
                    <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                      {t('prof.membersPredict', { n: l.member_count })}
                    </div>
                  </div>
                  {l.rank && <span className={`chip ${l.rank === 1 && total > 0 ? 'green' : ''}`}>{t('prof.rankPlace', { n: l.rank })}</span>}
                </Link>
              ))}
              {data && data.leagues.length === 0 && <div className="mute" style={{ fontSize: 14 }}>{isMe ? t('prof.noLeagueMe') : t('prof.noCommon')}</div>}
              {isMe && (
                <Link className="mini" to="/lobby/join" style={{ alignSelf: 'flex-start', marginTop: 4, display: 'inline-flex', alignItems: 'center' }}>
                  {t('prof.createOrJoin')}
                </Link>
              )}
            </div>
          </section>
        </div>
      </Content>
    </>
  );
}

function Hero({ data }: { data: ProfileScreen }) {
  const p = data.player!;
  const fd = p.fav_driver;
  const ft = p.fav_team;
  const leader = data.leagues.some((l) => l.rank === 1) && data.history.some((h) => h.points > 0);
  const car = ft ? teamCar(ft.code as TeamCode) : null;
  return (
    <section className={`card rise ${s.hero}`} style={{ ['--i' as string]: 0 }}>
      <Avatar {...avatarOf(p)} size={112} fontSize={40} className={s.avl} style={{ '--c': p.avatar_color } as CSSProperties} />
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{t('league.player')}</div>
        <div className={`num ${s.name}`}>{p.nickname}</div>
        <div className={s.chips}>
          {leader && <span className="chip red">{t('prof.leagueLeader')}</span>}
          {data.titles.map((t) => (
            <span key={`${t.league_id}${t.title}`} className="chip gold" title={tr('prof.titleIn', { league: t.league })}>
              {TITLE_NAMES[t.title]}
            </span>
          ))}
          <span className="chip">{tr('lobby.mode.predict')}</span>
        </div>
        <div className="mute" style={{ marginTop: 14, fontSize: 15 }}>{tr('prof.since', { date: monthYear(p.created_at) })}</div>
      </div>
      {(fd || ft) && (
        <div className={s.favs}>
          {fd && (
            <div className={s.fav}>
              <DriverTile driver={{ code: fd.code, number: fd.number, color: fd.color ?? '#3a3a42', team_code: fd.team_code ?? '', name: fd.name }} size={112} className={s.lg} />
              <div>
                <div className="eyebrow">{tr('prof.favDriver')}</div>
                <div className={s.favName}>{fd.name}</div>
                <div className={`mute ${s.favSub}`}>{[fd.team_name, fd.number ? `#${fd.number}` : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          )}
          {ft && (
            <div className={s.fav}>
              <div className={s.car}>{car ? <img src={car} alt={ft.name} loading="lazy" decoding="async" /> : <div className={s.carEmpty} />}</div>
              <div>
                <div className="eyebrow">{tr('prof.favTeam')}</div>
                <div className={s.favName}>{ft.name}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** На месте фэнтези-команды из макета (фаза 4) — пилоты, которые принесли больше всего очков в прогнозах. */
function BestDrivers({ data }: { data: ProfileScreen | undefined }) {
  const list = data?.best_drivers ?? [];
  return (
    <section className="card rise" style={{ ['--i' as string]: 5, flex: '1 1 480px' }}>
      <h2 className="h">{t('prof.bestDrivers')}</h2>
      <div className={s.lineup}>
        {list.map((d) => (
          <div key={d.id} title={d.name}>
            <DriverTile driver={{ code: d.code, number: d.number, color: d.color ?? '#3a3a42', team_code: d.team_code ?? '', name: d.name }} size={60} className={s.md} />
            <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        {list.map((d) => (
          <div key={d.id} className="kv">
            <span className="mute">{d.name}</span>
            <b className="num">{t('prof.pts', { n: d.points })}</b>
          </div>
        ))}
        {data && list.length === 0 && <div className="mute" style={{ fontSize: 14 }}>{t('prof.afterFirst')}</div>}
      </div>
    </section>
  );
}

/** Макет Profile: «Фэнтези-команда» — состав последнего этапа, бюджет, замены, чипы. */
function FantasyCard({ data }: { data: ProfileScreen }) {
  const f = data.fantasy!;
  const sq = f.squad!;
  const used = new Set(f.chips_used);
  return (
    <section className="card rise" style={{ ['--i' as string]: 5, flex: '1 1 560px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 className="h">{f.team_name ? t('prof.fantasyTeamNamed', { name: f.team_name }) : t('prof.fantasyTeam')}</h2>
        {data.is_me && <Link className="mini" to="/fantasy/squad" style={{ display: 'inline-flex', alignItems: 'center' }}>{t('prof.squad')}</Link>}
      </div>
      <div className={s.lineup}>
        {sq.lineup.map((d) => (
          <div key={d.id} title={d.name} style={{ position: 'relative' }}>
            <DriverTile driver={{ code: d.code, number: d.number, color: d.color ?? '#3a3a42', team_code: d.team_code ?? '', name: d.name }} size={60} className={s.md} />
            {sq.drs === d.id && <i className="code act" style={{ position: 'absolute', right: -4, top: -6, minWidth: 0, height: 18, fontSize: 10 }}>×2</i>}
            <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</div>
          </div>
        ))}
        {sq.cons.map((t) => (
          <div key={t.id} title={t.name}>
            <div style={{ height: 60, width: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#15151a', border: '1px solid var(--line)', font: '700 12px var(--font-num)' }}>
              <i style={{ width: 4, height: 18, borderRadius: 2, background: t.color }} />{t.code}
            </div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600 }}>{t.code}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="kv"><span className="mute">{t('prof.budget')}</span><b className="num">${Number(sq.cost).toFixed(1)}M <span className="mute" style={{ fontWeight: 500 }}>{t('prof.freeM', { m: `$${(f.budget - Number(sq.cost)).toFixed(1)}M` })}</span></b></div>
        <div className="kv"><span className="mute">{t('prof.transfers')}</span><b>{sq.free_before >= 99 ? t('prof.firstBuild') : t('prof.transfersOf', { n: sq.transfers, free: sq.free_before })}</b></div>
        <div className="kv">
          <span className="mute">{t('prof.chips')}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['wildcard', 'limitless', 'final_fix', 'autopilot', 'no_negative', 'extra_drs'] as const).map((c, i) => (
              <span key={c} className={`chip ${used.has(c) ? '' : 'green'}`} style={used.has(c) ? { opacity: 0.5 } : undefined}>{['WC', 'LL', 'FF', 'AP', 'NN', 'X3'][i]}</span>
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}

function PredictCard({ data, me }: { data: ProfileScreen | undefined; me: string | undefined }) {
  const a = data?.accuracy;
  const rows = a
    ? [
        { name: SESSION_NAMES.qualy!, v: pct(a.qualy_hit, a.qualy_total) },
        { name: SESSION_NAMES.race!, v: pct(a.race_hit, a.race_total) },
        { name: t('bd.bonuses'), v: pct(a.bonus_hit, a.bonus_total) },
      ]
    : [];
  const duel = data?.duel;
  const p = data?.player;
  const sum = duel ? duel.wins + duel.losses || 1 : 1;
  return (
    <section className="card rise" style={{ ['--i' as string]: 6, flex: '1 1 480px' }}>
      <h2 className="h">{t('predict.title')}</h2>
      <div style={{ marginTop: 14 }}>
        {rows.map((r) => (
          <div key={r.name} className={s.pr}>
            <span className="mute" style={{ fontSize: 15 }}>{r.name}</span>
            <div className="stripes" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => <i key={i} className={r.v !== null && i < Math.round(r.v / 10) ? 'on' : ''} />)}
            </div>
            <b className="num" style={{ textAlign: 'right' }}>{r.v === null ? '—' : `${r.v}%`}</b>
          </div>
        ))}
        {!a && <Skeleton h={120} />}
      </div>
      {duel && p && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <div className="eyebrow">{t('prof.duel', { name: duel.rival.nickname })}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 12px' }}>
            <Avatar {...avatarOf(p)} />
            <div className="num" style={{ fontSize: 28, fontWeight: 600, flex: 1, textAlign: 'center' }}>
              {duel.wins} <span className="mute">:</span> {duel.losses}
            </div>
            <Link to={duel.rival.id === me ? '/profile' : `/profile/${duel.rival.id}`} aria-label={t('prof.profileOf', { name: duel.rival.nickname })}>
              <Avatar {...avatarOf(duel.rival)} />
            </Link>
          </div>
          <div className={s.duel}>
            <i style={{ width: `${(duel.wins / sum) * 100}%`, background: p.avatar_color }} />
            <i style={{ width: `${(duel.losses / sum) * 100}%`, background: duel.rival.avatar_color }} />
          </div>
          <div className="mute" style={{ marginTop: 12, fontSize: 13 }}>{t('prof.duelNote')}</div>
        </div>
      )}
    </section>
  );
}

function History({ data, season, onSeason }: { data: ProfileScreen | undefined; season: number | undefined; onSeason: (y: number) => void }) {
  const h = data?.history ?? [];
  const max = Math.max(1, ...h.map((x) => x.points));
  const best = h.reduce((bi, x, i) => (x.points > (h[bi]?.points ?? -1) ? i : bi), -1);
  const current = season ?? data?.season;
  return (
    <section className="card rise" style={{ ['--i' as string]: 7 }} id="history">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="h">{t('prof.historyTitle')}</h2>
          <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{t('prof.historySub')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(data?.seasons.length ?? 0) > 1 && (
            <div className="seg" role="tablist" aria-label={t('drv.season')}>
              {data!.seasons.map((y) => (
                <button key={y} role="tab" type="button" className={y === current ? 'on' : ''} aria-selected={y === current} onClick={() => onSeason(y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
          <div className="seg" role="tablist" aria-label={t('prof.historyMode')}>
            <button role="tab" type="button" disabled title={t('prof.fantasySoon')}>{t('lobby.mode.fantasy')}</button>
            <button role="tab" type="button" className="on" aria-selected="true">{t('lobby.mode.predict')}</button>
          </div>
        </div>
      </div>
      {h.length > 0 ? (
        <div className={s.bars}>
          {h.map((x, i) => (
            <div key={x.event_id} className={s.bc} title={`${x.name}: ${t('prof.pts', { n: x.points })}${x.played ? '' : t('prof.noPick')}`}>
              <i className={i === h.length - 1 ? s.now : i === best && x.points > 0 ? s.best : ''} style={{ height: `${Math.round((x.points / max) * 100)}%` }} />
              <span>{x.round}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mute" style={{ fontSize: 14, marginTop: 18 }}>{data ? t('prof.noRounds') : ''}</div>
      )}
    </section>
  );
}
