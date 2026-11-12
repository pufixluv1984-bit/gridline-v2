import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { teamCar, type TeamCode } from '@/lib/assets';
import { profileKeys, profileScreen, TITLE_NAMES, updateProfile, type ProfileScreen } from '@/lib/api/profile';
import { initialsOf } from '@/lib/initials';
import { plural } from '@/lib/time/format';
import { serverNow } from '@/lib/time/useServerNow';
import { Avatar, DriverTile, Skeleton } from '@/ui/game';
import { Modal } from '@/ui/Modal';
import { Content, PageTitle, Toolbar, ToolbarDivider } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import pg from '@/ui/Page.module.css';
import s from './Profile.module.css';

/** Цвета аватара без фото (макет Overlays, «Аватар без фото»). */
const SWATCHES = ['#ffd400', '#e8211a', '#ff8000', '#27f4d2', '#3671c6', '#b66dff', '#ff87bc', '#7fe0a0'];
const NICK_COOLDOWN_MS = 30 * 24 * 3600 * 1000;

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
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso))
    .replace(/^\d+\s/, '')
    .replace(' г.', '');

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
        <PageTitle title="Профиль" />
        <Content>
          <div className="empty-state">
            <h3>Профиль недоступен</h3>
            <p>Профили видны только игрокам из общих лиг.</p>
            <Link className={`${b.cta} ${b.sm}`} to="/league">К моим лигам</Link>
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

  return (
    <>
      <PageTitle title="Профиль" sub={p?.nickname ?? '…'} />
      <Toolbar>
        {isMe && (
          <a className={pg.btn} href="#settings" onClick={scrollTo('settings')}>
            <IconEdit />
            Редактировать профиль
          </a>
        )}
        {isMe && <ToolbarDivider />}
        <a className={`${pg.pill} ${pg.pillOn}`} href="#top" onClick={scrollTo('top')}>Обзор</a>
        <a className={pg.pill} href="#history" onClick={scrollTo('history')}>История</a>
        <a className={pg.pill} href="#leagues" onClick={scrollTo('leagues')}>Лиги</a>
        {isMe && <a className={pg.pill} href="#settings" onClick={scrollTo('settings')}>Настройки</a>}
      </Toolbar>
      <Content>
        <div id="top" />
        {!data ? (
          <Skeleton h={168} />
        ) : (
          <Hero data={data} />
        )}

        <div className="row">
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 1 }}>
            <div className="eyebrow">Лига · место</div>
            <div className={`num ${s.big}`}>
              {firstLeague?.rank ?? '—'}
              {firstLeague && <small> из {firstLeague.member_count}</small>}
            </div>
            <div style={{ marginTop: 14 }}>
              {firstLeague ? (
                firstLeague.rank === 1 && total > 0 ? <span className="chip green">Лидер</span> : <span className="chip">{firstLeague.name}</span>
              ) : (
                <span className="mute" style={{ fontSize: 14 }}>Пока без лиги</span>
              )}
            </div>
          </section>
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 2 }}>
            <div className="eyebrow">Очки сезона</div>
            <div className={`num ${s.big}`}>{total.toLocaleString('ru-RU')}</div>
            <div className={s.note}>{last ? `+${last.points} за этап ${last.round}` : 'Очки появятся после первого этапа'}</div>
          </section>
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 3 }}>
            <div className="eyebrow">Прогнозы · точность</div>
            <div className={`num ${s.big}`}>{overall ?? '—'}{overall !== null && <small>%</small>}</div>
            <div className={s.note}>точных мест в квалификации и гонке</div>
          </section>
          <section className={`card rise ${s.stat}`} style={{ ['--i' as string]: 4 }}>
            <div className="eyebrow">Лучшая серия</div>
            <div className={`num ${s.big}`}>
              {data?.best_streak ?? 0}
              <small> {plural(data?.best_streak ?? 0, 'этап', 'этапа', 'этапов')}</small>
            </div>
            <div className={s.note}>подряд с очками в прогнозе</div>
          </section>
        </div>

        <div className="row">
          <BestDrivers data={data} />
          <PredictCard data={data} me={me} />
        </div>

        <History data={data} season={season} onSeason={setSeason} />

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 8, flex: '1 1 480px' }} id="leagues">
            <h2 className="h">Лиги</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {(data?.leagues ?? []).map((l, i) => (
                <Link key={l.id} to={`/league/${l.id}`} className="lrow" style={i === 0 ? { borderColor: 'rgba(255,212,0,.4)' } : undefined}>
                  <Avatar nickname={l.name} color={i === 0 ? 'var(--gold)' : '#2b2b33'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{l.name}</div>
                    <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                      {l.member_count} {plural(l.member_count, 'игрок', 'игрока', 'игроков')} · прогнозы
                    </div>
                  </div>
                  {l.rank && <span className={`chip ${l.rank === 1 && total > 0 ? 'green' : ''}`}>{l.rank} место</span>}
                </Link>
              ))}
              {data && data.leagues.length === 0 && <div className="mute" style={{ fontSize: 14 }}>{isMe ? 'Ты пока не в лиге.' : 'Общих лиг в этом сезоне нет.'}</div>}
              {isMe && (
                <Link className="mini" to="/lobby/join" style={{ alignSelf: 'flex-start', marginTop: 4, display: 'inline-flex', alignItems: 'center' }}>
                  + Создать лигу или войти по коду
                </Link>
              )}
            </div>
          </section>
          {isMe && data && me && <ProfileSettings key={`${p?.nickname}${p?.avatar_color}${p?.fav_driver?.id}${p?.fav_team?.id}`} data={data} userId={me} />}
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
      <div className={s.avl} style={{ background: p.avatar_color, '--c': p.avatar_color } as CSSProperties}>{initialsOf(p.nickname)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">Игрок</div>
        <div className={`num ${s.name}`}>{p.nickname}</div>
        <div className={s.chips}>
          {leader && <span className="chip red">Лидер лиги</span>}
          {data.titles.map((t) => (
            <span key={`${t.league_id}${t.title}`} className="chip gold" title={`Звание сезона в лиге «${t.league}»`}>
              {TITLE_NAMES[t.title]}
            </span>
          ))}
          <span className="chip">Прогнозы</span>
        </div>
        <div className="mute" style={{ marginTop: 14, fontSize: 15 }}>в игре с {monthYear(p.created_at)}</div>
      </div>
      {(fd || ft) && (
        <div className={s.favs}>
          {fd && (
            <div className={s.fav}>
              <DriverTile driver={{ code: fd.code, number: fd.number, color: fd.color ?? '#3a3a42', team_code: fd.team_code ?? '', name: fd.name }} size={112} className={s.lg} />
              <div>
                <div className="eyebrow">Любимый пилот</div>
                <div className={s.favName}>{fd.name}</div>
                <div className={`mute ${s.favSub}`}>{[fd.team_name, fd.number ? `#${fd.number}` : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          )}
          {ft && (
            <div className={s.fav}>
              <div className={s.car}>{car ? <img src={car} alt={ft.name} loading="lazy" decoding="async" /> : <div className={s.carEmpty} />}</div>
              <div>
                <div className="eyebrow">Любимая команда</div>
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
      <h2 className="h">Лучшие пилоты в прогнозах</h2>
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
            <b className="num">{d.points} {plural(d.points, 'очко', 'очка', 'очков')}</b>
          </div>
        ))}
        {data && list.length === 0 && <div className="mute" style={{ fontSize: 14 }}>Появятся после первого этапа с результатами.</div>}
      </div>
    </section>
  );
}

function PredictCard({ data, me }: { data: ProfileScreen | undefined; me: string | undefined }) {
  const a = data?.accuracy;
  const rows = a
    ? [
        { name: 'Квалификация', v: pct(a.qualy_hit, a.qualy_total) },
        { name: 'Гонка', v: pct(a.race_hit, a.race_total) },
        { name: 'Бонусы', v: pct(a.bonus_hit, a.bonus_total) },
      ]
    : [];
  const duel = data?.duel;
  const p = data?.player;
  const sum = duel ? duel.wins + duel.losses || 1 : 1;
  return (
    <section className="card rise" style={{ ['--i' as string]: 6, flex: '1 1 480px' }}>
      <h2 className="h">Игра прогнозов</h2>
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
          <div className="eyebrow">Дуэль с {duel.rival.nickname}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 12px' }}>
            <Avatar nickname={p.nickname} color={p.avatar_color} />
            <div className="num" style={{ fontSize: 28, fontWeight: 600, flex: 1, textAlign: 'center' }}>
              {duel.wins} <span className="mute">:</span> {duel.losses}
            </div>
            <Link to={duel.rival.id === me ? '/profile' : `/profile/${duel.rival.id}`} aria-label={`Профиль ${duel.rival.nickname}`}>
              <Avatar nickname={duel.rival.nickname} color={duel.rival.avatar_color} />
            </Link>
          </div>
          <div className={s.duel}>
            <i style={{ width: `${(duel.wins / sum) * 100}%`, background: p.avatar_color }} />
            <i style={{ width: `${(duel.losses / sum) * 100}%`, background: duel.rival.avatar_color }} />
          </div>
          <div className="mute" style={{ marginTop: 12, fontSize: 13 }}>Побед по этапам в прогнозах за сезон</div>
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
          <h2 className="h">История по этапам</h2>
          <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>Очки за прогноз на каждый этап · лучший этап выделен жёлтым</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(data?.seasons.length ?? 0) > 1 && (
            <div className="seg" role="tablist" aria-label="Сезон">
              {data!.seasons.map((y) => (
                <button key={y} role="tab" type="button" className={y === current ? 'on' : ''} aria-selected={y === current} onClick={() => onSeason(y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
          <div className="seg" role="tablist" aria-label="Режим истории">
            <button role="tab" type="button" disabled title="Фэнтези-лига — к сезону 2027">Фэнтези</button>
            <button role="tab" type="button" className="on" aria-selected="true">Прогнозы</button>
          </div>
        </div>
      </div>
      {h.length > 0 ? (
        <div className={s.bars}>
          {h.map((x, i) => (
            <div key={x.event_id} className={s.bc} title={`${x.name}: ${x.points} ${plural(x.points, 'очко', 'очка', 'очков')}${x.played ? '' : ' · без прогноза'}`}>
              <i className={i === h.length - 1 ? s.now : i === best && x.points > 0 ? s.best : ''} style={{ height: `${Math.round((x.points / max) * 100)}%` }} />
              <span>{x.round}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mute" style={{ fontSize: 14, marginTop: 18 }}>{data ? 'Этапов с результатами пока нет.' : ''}</div>
      )}
    </section>
  );
}

type Dialog = 'nick' | 'avatar' | null;

function ProfileSettings({ data, userId }: { data: ProfileScreen; userId: string }) {
  const p = data.player!;
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [nick, setNick] = useState(p.nickname);
  const [color, setColor] = useState(p.avatar_color);
  const [nextNickAt, setNextNickAt] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateProfile>[1]) => updateProfile(userId, patch),
    onSuccess: () => {
      setDialog(null);
      void qc.invalidateQueries({ queryKey: ['screen'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const openNick = () => {
    const changed = p.nickname_changed_at ? new Date(p.nickname_changed_at).getTime() : null;
    setNextNickAt(changed && changed + NICK_COOLDOWN_MS > serverNow() ? changed + NICK_COOLDOWN_MS : null);
    setNick(p.nickname);
    save.reset();
    setDialog('nick');
  };
  const close = () => {
    setDialog(null);
    save.reset();
  };
  const nickOk = nick.trim().length >= 2 && nick.trim().length <= 20 && nick.trim() !== p.nickname;

  return (
    <section className="card rise" style={{ ['--i' as string]: 9, flex: '1 1 560px' }} id="settings">
      <h2 className="h">Настройки профиля</h2>
      <div style={{ marginTop: 12 }}>
        <div className="kv">
          <span className="mute">Ник</span>
          <button type="button" className={s.fld} onClick={openNick}>{p.nickname}<span className="mute">Изменить</span></button>
        </div>
        <div className="kv">
          <span className="mute">Аватар</span>
          <button type="button" className={s.fld} onClick={() => { setColor(p.avatar_color); save.reset(); setDialog('avatar'); }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><i className={s.dotc} style={{ background: p.avatar_color }} />{initialsOf(p.nickname)}</span>
            <span className="mute">Цвет</span>
          </button>
        </div>
        <div className="kv">
          <label className="mute" htmlFor="fav-driver">Любимый пилот</label>
          <select id="fav-driver" className={s.fld} value={p.fav_driver?.id ?? ''} disabled={save.isPending}
            onChange={(e) => save.mutate({ fav_driver: e.target.value || null })}>
            <option value="">Не выбран</option>
            {(data.options?.drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.team_name}</option>)}
          </select>
        </div>
        <div className="kv">
          <label className="mute" htmlFor="fav-team">Любимая команда</label>
          <select id="fav-team" className={s.fld} value={p.fav_team?.id ?? ''} disabled={save.isPending}
            onChange={(e) => save.mutate({ fav_team: e.target.value || null })}>
            <option value="">Не выбрана</option>
            {(data.options?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="kv">
          <span className="mute">Аккаунт, выход и удаление</span>
          <Link className="mini" to="/settings" style={{ display: 'inline-flex', alignItems: 'center' }}>Настройки аккаунта</Link>
        </div>
      </div>
      {save.error && !dialog && <div className="alert bad" role="alert" style={{ marginTop: 12 }}>{save.error.message}</div>}

      {dialog === 'nick' && (
        <Modal
          title="Сменить ник"
          onClose={close}
          busy={save.isPending}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={save.isPending}>Отмена</button>
              <button type="button" className={`${b.cta} ${b.sm}`} disabled={!nickOk || !!nextNickAt || save.isPending} onClick={() => save.mutate({ nickname: nick.trim() })}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <div>
            <label className="lab" htmlFor="nick">Новый ник</label>
            <input id="nick" className="in" type="text" value={nick} maxLength={20} disabled={!!nextNickAt}
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nickOk && !nextNickAt) save.mutate({ nickname: nick.trim() }); }} />
            <div className="help">От 2 до 20 символов. Его видят все игроки лиги.</div>
          </div>
          <div className="alert info">
            <span>
              {nextNickAt
                ? `Ник уже меняли недавно. Следующая смена — с ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(nextNickAt)}.`
                : 'Менять ник можно раз в 30 дней. История очков сохранится.'}
            </span>
          </div>
          {save.error && <div className="alert bad" role="alert">{save.error.message}</div>}
        </Modal>
      )}

      {dialog === 'avatar' && (
        <Modal
          title="Аватар без фото"
          onClose={close}
          busy={save.isPending}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={save.isPending}>Отмена</button>
              <button type="button" className={`${b.cta} ${b.sm}`} disabled={color === p.avatar_color || save.isPending} onClick={() => save.mutate({ avatar_color: color })}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </>
          }
        >
          <div className={s.avprev}>
            <Avatar nickname={p.nickname} color={color} size={84} />
            <div>
              <div style={{ fontWeight: 600 }}>{p.nickname}</div>
              <div className="mute" style={{ fontSize: 13, marginTop: 4 }}>Так тебя видят в таблице и лобби</div>
            </div>
          </div>
          <div>
            <span className="lab">Цвет</span>
            <div className={s.swr} role="radiogroup" aria-label="Цвет аватара">
              {SWATCHES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
                  className={`${s.sw} ${c === color ? s.on : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          {save.error && <div className="alert bad" role="alert">{save.error.message}</div>}
        </Modal>
      )}
    </section>
  );
}
