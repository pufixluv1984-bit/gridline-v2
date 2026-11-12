import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { countryOf, driverKeys, driverScreen, type CareerSeason, type DriverScreen } from '@/lib/api/drivers';
import { plural } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, PillLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import pg from '@/ui/Page.module.css';
import s from './Drivers.module.css';

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

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
        <PageTitle title="Пилоты" sub="Профиль" />
        <Content>
          <div className="empty-state">
            <h3>Пилот не найден</h3>
            <p>Такого пилота нет в справочнике сезона.</p>
            <Link className={`${b.cta} ${b.sm}`} to="/drivers">Все пилоты</Link>
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
      <PageTitle title="Пилоты" sub={d?.name ?? '…'} />
      <Toolbar>
        <PillLink to="/drivers" end>Все пилоты</PillLink>
        <ToolbarDivider />
        <a className={`${pg.pill} ${pg.pillOn}`} href="#top" onClick={scrollTo('top')}>Обзор</a>
        <a className={pg.pill} href="#career" onClick={scrollTo('career')}>Карьера по сезонам</a>
        <a className={pg.pill} href="#achievements" onClick={scrollTo('achievements')}>Достижения</a>
        <a className={pg.pill} href="#bio" onClick={scrollTo('bio')}>Биография</a>
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
                {titles.length > 0 && <span className="chip gold">{titles.length}× чемпион мира</span>}
                {d.active && <span className="chip green">Действующий пилот</span>}
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
                      <span>Родился</span>
                      {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(c.born)).replace(' г.', '')}
                    </div>
                  )}
                  <div><span>Дебют в Ф1</span>{c?.debut_year}{c?.debut_race ? `, ${c.debut_race}` : ''}</div>
                  {teamNames.length > 0 && <div><span>Команды</span>{teamNames.join(', ')}</div>}
                  {data?.championship && <div><span>Сезон {data.season}</span>{data.championship.position} место · {fmt(Number(data.championship.points))} очк.</div>}
                </div>
              )}
            </div>
          </section>
        )}

        {data && !ready && (
          <div className="empty-state">
            <h3>Карьера ещё загружается</h3>
            <p>Статистику и историю по сезонам сайт подтягивает из Jolpica F1 API понемногу, чтобы не превышать лимит. Загляни через пару часов.</p>
          </div>
        )}

        {ready && c && (
          <>
            <section className="rise" style={{ ['--i' as string]: 1 }}>
              <div className={s.stats}>
                <div className={`${s.sc} ${titles.length ? s.gold : ''}`}>
                  <span className="eyebrow">Титулы</span>
                  <b>{titles.length}</b>
                  <small>{titles.length ? ranges(titles) : 'пока без титулов'}</small>
                </div>
                <div className={s.sc}>
                  <span className="eyebrow">Победы</span>
                  <b>{c.wins}</b>
                  <small>{c.first_win_year ? `первая — ${c.first_win_year}` : 'пока без побед'}</small>
                </div>
                <div className={s.sc}><span className="eyebrow">Поулы</span><b>{c.poles}</b><small>за карьеру</small></div>
                <div className={s.sc}><span className="eyebrow">Подиумы</span><b>{c.podiums}</b><small>из {c.starts} {plural(c.starts, 'гонки', 'гонок', 'гонок')}</small></div>
                <div className={s.sc}><span className="eyebrow">Быстрые круги</span><b>{c.fastest_laps}</b><small>за карьеру</small></div>
              </div>
              <div className="mute" style={{ fontSize: 12.5, marginTop: 10 }}>По данным Jolpica F1 API, только гонки Гран-при (без спринтов).</div>
            </section>

            <SeasonsChart seasons={seasons} titles={titles} teams={teamsDict} />
            <Achievements data={data!} seasons={seasons} />
            <CareerTable seasons={seasons} titles={titles} teams={teamsDict} />
          </>
        )}

        {c?.bio && (
          <section className={`card rise ${s.bio}`} style={{ ['--i' as string]: 5 }} id="bio">
            <h2 className="h" style={{ marginBottom: 16 }}>Биография</h2>
            {c.bio.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            <span className={s.bt}>
              Текст: {c.bio_url ? <a href={c.bio_url} target="_blank" rel="noreferrer">Википедия</a> : 'Википедия'} · CC BY-SA 4.0
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
          <h2 className="h">Очки по сезонам</h2>
          <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>Золотым выделены сезоны с титулом</div>
        </div>
        <div className={s.legend}>
          <span><i style={{ background: 'var(--gold)' }} />Чемпион</span>
          <span><i style={{ background: '#2a2a32' }} />Остальные сезоны</span>
        </div>
      </div>
      <div className={s.bars}>
        {seasons.map((x) => (
          <div key={x.year} className={s.bc} title={`${x.year}: ${fmt(x.points)} очк.${x.position ? `, ${x.position} место` : ''}`}>
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
  if (titles.length) items.push({ badge: `${titles.length}`, title: titles.length === 1 ? 'Чемпион мира' : `${titles.length}-кратный чемпион мира`, text: titles.join(', ') });
  else if (best) items.push({ badge: `P${best.position}`, title: 'Лучшее место в чемпионате', text: `${best.year}${mainTeam(best) ? `, ${teamOf(mainTeam(best)!, data.teams).name}` : ''}` });
  if (c.wins) items.push({ badge: `${c.wins}`, title: `${c.wins} ${plural(c.wins, 'победа', 'победы', 'побед')} в Гран-при`, text: `Первая — ${c.first_win_year}${c.first_win_race ? `, ${c.first_win_race}` : ''}` });
  if (winSeasons > 1) items.push({ badge: `${winSeasons}`, title: `${plural(winSeasons, 'Сезон', 'Сезона', 'Сезонов')} с победами`, text: `из ${seasons.length} в Формуле-1` });
  if (c.poles) items.push({ badge: `${c.poles}`, title: `${c.poles} ${plural(c.poles, 'поул', 'поула', 'поулов')}`, text: 'Первое место в квалификации' });
  if (c.podiums) items.push({ badge: `${c.podiums}`, title: `${c.podiums} ${plural(c.podiums, 'подиум', 'подиума', 'подиумов')}`, text: `${Math.round((100 * c.podiums) / Math.max(1, c.starts))}% гонок в первой тройке` });
  items.push({ badge: `${seasons.length}`, title: `${seasons.length} ${plural(seasons.length, 'сезон', 'сезона', 'сезонов')} в Формуле-1`, text: `${c.starts} ${plural(c.starts, 'гонка', 'гонки', 'гонок')} с ${c.debut_year} года` });
  return (
    <section className="card rise" style={{ ['--i' as string]: 3 }} id="achievements">
      <h2 className="h">Достижения</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>Знаковые цифры карьеры</div>
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
      <h2 className="h">Карьера по сезонам</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>Команда, место в чемпионате и очки</div>
      <div className={s.tbh}><span>Сезон</span><span>Команда</span><span className={s.rt}>Место</span><span className={s.rt}>Очки</span><span className={s.rt} /></div>
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
              <span className={s.rt}>{champ ? <span className="chip gold">Чемпион</span> : !x.final ? <span className="chip">идёт</span> : null}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
