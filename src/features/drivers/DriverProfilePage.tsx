import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { countryOf, driverKeys, driverScreen, type CareerSeason, type DriverScreen } from '@/lib/api/drivers';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import pg from '@/ui/Page.module.css';
import s from './Drivers.module.css';
import { intlLocale, t } from '@/i18n';

const fmt = (n: number) => n.toLocaleString(intlLocale(), { maximumFractionDigits: 1 });

/** 2014, 2015, 2017, 2018 → «2014–2015, 2017–2018». */
function ranges(years: number[]): string {
  const out: string[] = [];
  let start = years[0];
  for (let i = 0; i < years.length; i++) {
    const y = years[i]!;
    if (years[i + 1] !== y + 1) {
      out.push(start === y ? `${y}` : `${start}–${y}`);
      start = years[i + 1];
    }
  }
  return out.join(', ');
}

type TeamInfo = { name: string; code: string | null; color: string };
function teamOf(t: { id: string; name: string }, dict: DriverScreen['teams']): TeamInfo {
  const k = dict[t.id];
  return k ? { name: k.name, code: k.code, color: k.color } : { name: t.name, code: null, color: '#3a3a42' };
}
const mainTeam = (x: CareerSeason) => x.teams.at(-1);

function scrollTo(id: string) {
  return (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
}

/** Макет Driver-Profile: карьера из Jolpica F1 API, биография из Википедии. Блок фэнтези-цены — в фазе 4. */
export default function DriverProfilePage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: driverKeys.one(id), queryFn: () => driverScreen(id), enabled: !!id, staleTime: 10 * 60_000 });
  const data = q.data;
  const d = data?.driver;
  const c = data?.career;
  const ready = !!c?.debut_year;

  if (q.error || (data && !d)) {
    return (
      <>
        <PageTitle title={t('drv.title')} sub={t('drv.profile')} />
        <Content>
          <div className="empty-state">
            <h3>{t('drv.notFound')}</h3>
            <p>{t('drv.notFoundText')}</p>
            <Link className={`${b.cta} ${b.sm}`} to="/drivers">{t('drv.all')}</Link>
          </div>
        </Content>
      </>
    );
  }

  const seasons = [...(c?.seasons ?? [])].sort((x, y) => x.year - y.year);
  const titles = c?.titles ?? [];
  const teamsDict = data?.teams ?? {};
  const teamNames = [...new Set(seasons.flatMap((x) => x.teams.map((t) => teamOf(t, teamsDict).name)))];
  const logo = d?.team_code ? teamLogo(d.team_code as TeamCode) : null;
  const country = countryOf(c?.nationality);

  return (
    <>
      <PageTitle title={t('drv.title')} sub={d?.name ?? '…'} />
      <Toolbar>
        <PillLink to="/drivers" end>{t('drv.all')}</PillLink>
        <ToolbarDivider />
        <a className={`${pg.pill} ${pg.pillOn}`} href="#top" onClick={scrollTo('top')}>{t('drv.overview')}</a>
        <a className={pg.pill} href="#career" onClick={scrollTo('career')}>{t('drv.careerBySeason')}</a>
        <a className={pg.pill} href="#achievements" onClick={scrollTo('achievements')}>{t('drv.achievements')}</a>
        <a className={pg.pill} href="#bio" onClick={scrollTo('bio')}>{t('drv.bio')}</a>
      </Toolbar>
      <Content>
        <div id="top" />
        {!d ? (
          <Skeleton h={240} />
        ) : (
          <section className={`card rise ${s.hero}`} style={{ ['--i' as string]: 0, '--c': d.color ?? '#3a3a42' } as CSSProperties}>
            <DriverTile driver={{ code: d.code, number: d.number, color: d.color ?? '#3a3a42', team_code: d.team_code ?? '', name: d.name }} size={200} className={s.big} />
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {titles.length > 0 && <span className="chip gold">{t('drv.champX', { n: titles.length })}</span>}
                {d.active && <span className="chip green">{t('drv.active')}</span>}
              </div>
              <h1 className={s.h1}>{d.name}</h1>
              <div className={`mute ${s.sub}`}>
                {logo && <img src={logo} alt="" />}
                {[d.team_name, d.number ? `№${d.number}` : null, country].filter(Boolean).join(' · ')}
              </div>
              {ready && (
                <div className={s.facts}>
                  {c?.born && (
                    <div>
                      <span>{t('drv.born')}</span>
                      {new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(c.born)).replace(/ (г|р)\.$/, '')}
                    </div>
                  )}
                  <div><span>{t('drv.debut')}</span>{c?.debut_year}{c?.debut_race ? `, ${c.debut_race}` : ''}</div>
                  {teamNames.length > 0 && <div><span>{t('drv.teams')}</span>{teamNames.join(', ')}</div>}
                  {data?.championship && <div><span>{t('drv.seasonN', { season: data.season })}</span>{t('drv.champLine', { pos: data.championship.position, pts: fmt(Number(data.championship.points)) })}</div>}
                </div>
              )}
            </div>
          </section>
        )}

        {data && !ready && (
          <div className="empty-state">
            <h3>{t('drv.loading')}</h3>
            <p>{t('drv.loadingText')}</p>
          </div>
        )}

        {ready && c && (
          <>
            <section className="rise" style={{ ['--i' as string]: 1 }}>
              <div className={s.stats}>
                <div className={`${s.sc} ${titles.length ? s.gold : ''}`}>
                  <span className="eyebrow">{t('drv.titles')}</span>
                  <b>{titles.length}</b>
                  <small>{titles.length ? ranges(titles) : t('drv.noTitles')}</small>
                </div>
                <div className={s.sc}>
                  <span className="eyebrow">{t('drv.wins')}</span>
                  <b>{c.wins}</b>
                  <small>{c.first_win_year ? t('drv.firstWin', { year: c.first_win_year }) : t('drv.noWins')}</small>
                </div>
                <div className={s.sc}><span className="eyebrow">{t('drv.poles')}</span><b>{c.poles}</b><small>{t('drv.polesHint')}</small></div>
                <div className={s.sc}><span className="eyebrow">{t('drv.podiums')}</span><b>{c.podiums}</b><small>{t('drv.ofRaces', { n: c.starts })}</small></div>
                <div className={s.sc}><span className="eyebrow">{t('drv.fl')}</span><b>{c.fastest_laps}</b><small>{t('drv.career')}</small></div>
              </div>
              <div className="mute" style={{ fontSize: 12.5, marginTop: 10 }}>{t('drv.source')}</div>
            </section>

            <SeasonsChart seasons={seasons} titles={titles} teams={teamsDict} />
            <Achievements data={data!} seasons={seasons} />
            <CareerTable seasons={seasons} titles={titles} teams={teamsDict} />
          </>
        )}

        {c?.bio && (
          <section className={`card rise ${s.bio}`} style={{ ['--i' as string]: 5 }} id="bio">
            <h2 className="h" style={{ marginBottom: 16 }}>{t('drv.bio')}</h2>
            {c.bio.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            <span className={s.bt}>
              {t('drv.text')} {c.bio_url ? <a href={c.bio_url} target="_blank" rel="noreferrer">{t('drv.wiki')}</a> : t('drv.wiki')} · CC BY-SA 4.0
            </span>
          </section>
        )}
      </Content>
    </>
  );
}

function SeasonsChart({ seasons, titles, teams }: { seasons: CareerSeason[]; titles: number[]; teams: DriverScreen['teams'] }) {
  const max = Math.max(1, ...seasons.map((x) => x.points));
  // Отрезки карьеры по командам (подряд идущие сезоны с одной основной командой).
  const spans: { team: TeamInfo; from: number; to: number; n: number }[] = [];
  for (const x of seasons) {
    const t = mainTeam(x);
    if (!t) continue;
    const info = teamOf(t, teams);
    const last = spans.at(-1);
    if (last && last.team.name === info.name && last.to === x.year - 1) {
      last.to = x.year;
      last.n++;
    } else spans.push({ team: info, from: x.year, to: x.year, n: 1 });
  }
  return (
    <section className="card rise" style={{ ['--i' as string]: 2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="h">{t('drv.ptsBySeason')}</h2>
          <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{t('drv.goldHint')}</div>
        </div>
        <div className={s.legend}>
          <span><i style={{ background: 'var(--gold)' }} />{t('drv.champion')}</span>
          <span><i style={{ background: '#2a2a32' }} />{t('drv.otherSeasons')}</span>
        </div>
      </div>
      <div className={s.bars}>
        {seasons.map((x) => (
          <div key={x.year} className={s.bc} title={t('drv.barTitle', { year: x.year, pts: fmt(x.points) }) + (x.position ? t('drv.barPos', { pos: x.position }) : '')}>
            <i className={titles.includes(x.year) ? s.ch : ''} style={{ height: `${Math.round((x.points / max) * 100)}%` }} />
            <em>{String(x.year).slice(2)}</em>
          </div>
        ))}
      </div>
      <div className={s.tl2}>
        {spans.map((sp) => {
          const lg = sp.team.code ? teamLogo(sp.team.code as TeamCode) : null;
          return (
            <div key={`${sp.team.name}${sp.from}`} className={s.seg2b} style={{ flex: sp.n }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {lg && <img src={lg} alt="" loading="lazy" />}
                <b>{sp.team.name}</b>
              </div>
              <div className={s.bar} style={{ background: sp.team.color }} />
              <span className="mute" style={{ fontSize: 13 }}>{sp.from === sp.to ? sp.from : `${sp.from}–${sp.to}`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Achievements({ data, seasons }: { data: DriverScreen; seasons: CareerSeason[] }) {
  const c = data.career!;
  const titles = c.titles;
  const best = seasons.filter((x) => x.position).sort((a, b) => a.position! - b.position! || a.year - b.year)[0];
  const winSeasons = seasons.filter((x) => x.wins > 0).length;
  const items: { badge: string; title: string; text: string }[] = [];
  if (titles.length) items.push({ badge: `${titles.length}`, title: titles.length === 1 ? t('drv.ach.champ') : t('drv.ach.champN', { n: titles.length }), text: titles.join(', ') });
  else if (best) items.push({ badge: `P${best.position}`, title: t('drv.ach.best'), text: `${best.year}${mainTeam(best) ? `, ${teamOf(mainTeam(best)!, data.teams).name}` : ''}` });
  if (c.wins) items.push({ badge: `${c.wins}`, title: t('drv.ach.wins', { n: c.wins }), text: `${t('drv.ach.firstWin', { year: c.first_win_year })}${c.first_win_race ? `, ${c.first_win_race}` : ''}` });
  if (winSeasons > 1) items.push({ badge: `${winSeasons}`, title: t('drv.ach.winSeasons', { n: winSeasons }), text: t('drv.ach.ofSeasons', { n: seasons.length }) });
  if (c.poles) items.push({ badge: `${c.poles}`, title: t('drv.ach.poles', { n: c.poles }), text: t('drv.ach.polesText') });
  if (c.podiums) items.push({ badge: `${c.podiums}`, title: t('drv.ach.podiums', { n: c.podiums }), text: t('drv.ach.podiumPct', { p: Math.round((100 * c.podiums) / Math.max(1, c.starts)) }) });
  items.push({ badge: `${seasons.length}`, title: t('drv.ach.seasons', { n: seasons.length }), text: t('drv.ach.races', { n: c.starts, year: c.debut_year }) });
  return (
    <section className="card rise" style={{ ['--i' as string]: 3 }} id="achievements">
      <h2 className="h">{t('drv.achievements')}</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>{t('drv.achSub')}</div>
      <div className={s.ach}>
        {items.map((x) => (
          <div key={x.title} className={s.ac}>
            <div className={s.bg}>{x.badge}</div>
            <div><b>{x.title}</b><span>{x.text}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CareerTable({ seasons, titles, teams }: { seasons: CareerSeason[]; titles: number[]; teams: DriverScreen['teams'] }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: 4 }} id="career">
      <h2 className="h">{t('drv.careerBySeason')}</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>{t('drv.careerSub')}</div>
      <div className={s.tbh}><span>{t('drv.season')}</span><span>{t('drv.team')}</span><span className={s.rt}>{t('drv.place')}</span><span className={s.rt}>{t('drv.points')}</span><span className={s.rt} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[...seasons].reverse().map((x) => {
          const champ = titles.includes(x.year);
          const main = mainTeam(x);
          const info = main ? teamOf(main, teams) : null;
          const lg = info?.code ? teamLogo(info.code as TeamCode) : null;
          return (
            <div key={x.year} className={`${s.tbr} ${champ ? s.ch : ''}`}>
              <b className="num">{x.year}</b>
              <span className={s.tn}>
                {lg && <img src={lg} alt="" loading="lazy" />}
                {x.teams.map((t) => teamOf(t, teams).name).join(' / ')}
              </span>
              <span className={`num ${s.rt}`}>{x.position ?? '—'}</span>
              <span className={`num ${s.rt}`}>{fmt(x.points)}</span>
              <span className={s.rt}>{champ ? <span className="chip gold">{t('drv.champion')}</span> : !x.final ? <span className="chip">{t('drv.ongoing')}</span> : null}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
