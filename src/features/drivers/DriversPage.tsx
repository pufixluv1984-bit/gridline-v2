import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { driverKeys, driversScreen } from '@/lib/api/drivers';
import { plural } from '@/lib/time/format';
import { DriverTile, Skeleton } from '@/ui/game';
import { Content, PageTitle, Toolbar, ToolbarDivider } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import s from './Drivers.module.css';

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Макет Drivers: каталог пилотов сезона с поиском, фильтром по команде и видом «Все времена». */
export default function DriversPage() {
  const q = useQuery({ queryKey: driverKeys.catalog(), queryFn: driversScreen, staleTime: 10 * 60_000 });
  const [team, setTeam] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [allTime, setAllTime] = useState(false);
  const drivers = useMemo(() => q.data?.drivers ?? [], [q.data]);
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of drivers) seen.set(d.team_id, d.team_name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [drivers]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = drivers.filter(
      (d) => (!team || d.team_id === team) && (!needle || d.name.toLowerCase().includes(needle) || d.code.toLowerCase().includes(needle)),
    );
    return allTime ? [...list].sort((a, b) => b.career_points - a.career_points) : list;
  }, [drivers, team, search, allTime]);

  return (
    <>
      <PageTitle title="Пилоты" sub={`Каталог сезона ${q.data?.season ?? ''}`.trim()} />
      <Toolbar>
        <input className={s.srch} type="search" placeholder="Найти пилота" aria-label="Найти пилота" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ToolbarDivider />
        <button type="button" className={`${pg.pill} ${team === null ? pg.pillOn : ''}`} onClick={() => setTeam(null)}>Все команды</button>
        {teams.map(([id, name]) => (
          <button key={id} type="button" className={`${pg.pill} ${team === id ? pg.pillOn : ''}`} onClick={() => setTeam(id)}>{name}</button>
        ))}
        <span className={`seg ${s.cnt}`} role="tablist" aria-label="Период">
          <button type="button" role="tab" className={allTime ? '' : 'on'} aria-selected={!allTime} onClick={() => setAllTime(false)}>Сезон {q.data?.season}</button>
          <button type="button" role="tab" className={allTime ? 'on' : ''} aria-selected={allTime} onClick={() => setAllTime(true)}>Все времена</button>
        </span>
      </Toolbar>
      <Content>
        <section className="card rise" style={{ ['--i' as string]: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <h2 className="h">{allTime ? 'Пилоты сезона за всю карьеру' : 'Пилоты сезона'}</h2>
              <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>Нажми на пилота, чтобы открыть карьеру, статистику и достижения</div>
            </div>
            <span className="chip">{shown.length} {plural(shown.length, 'пилот', 'пилота', 'пилотов')}</span>
          </div>
          {q.isLoading ? (
            <Skeleton h={320} />
          ) : (
            <div className={s.dgrid}>
              {shown.map((d) => {
                const logo = teamLogo(d.team_code as TeamCode);
                return (
                  <Link key={d.id} to={`/drivers/${d.id}`} className={s.dc}>
                    {d.number && <span className={s.no}>#{d.number}</span>}
                    <DriverTile driver={d} size={170} />
                    <div>
                      <div className={s.nm}>{d.name}</div>
                      <div className={s.tm}>{logo && <img src={logo} alt="" loading="lazy" />}{d.team_name}</div>
                    </div>
                    <div className={s.st}>
                      {allTime ? (
                        <>
                          <div><span className="eyebrow">Очки за карьеру</span><b>{fmt(d.career_points)}</b></div>
                          <div><span className="eyebrow">Титулы</span><b>{d.titles}</b></div>
                        </>
                      ) : (
                        <>
                          <div><span className="eyebrow">Очки</span><b>{fmt(d.points)}</b></div>
                          {q.data?.prices?.[d.id] != null ? (
                            <div><span className="eyebrow">Цена</span><b>${Number(q.data.prices[d.id]).toFixed(1)}M</b></div>
                          ) : (
                            <div><span className="eyebrow">Место</span><b>{d.position ?? '—'}</b></div>
                          )}
                        </>
                      )}
                    </div>
                  </Link>
                );
              })}
              {shown.length === 0 && <div className="mute" style={{ fontSize: 14 }}>Никого не нашлось.</div>}
            </div>
          )}
        </section>
      </Content>
    </>
  );
}
