import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leagueScreen, screenKeys } from '@/lib/api/screens';
import { inviteLink } from '@/lib/invite';
import { hasTrack } from '@/lib/tracks';
import { formatDateTime, formatRange, plural } from '@/lib/time/format';
import { Avatar, Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import { TrackMap } from '@/ui/TrackMap';
import b from '@/ui/Button.module.css';
import { LobbyTabs } from './LobbyTabs';
import { avatarOf } from '@/lib/avatar';

/**
 * Макет Lobby-Waiting. Кнопки «Начать игру» и заявок на вступление в продукте нет: лига считает
 * очки сама с выбранного этапа, а войти может любой со ссылкой (docs/PRODUCT.md §1).
 */
export default function WaitingPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: screenKeys.league(id), queryFn: () => leagueScreen(id), enabled: !!id, retry: false });
  const [copied, setCopied] = useState(false);
  const data = q.data;
  const league = data?.league;
  const ev = data?.event;
  const sent = new Map((data?.submissions ?? []).map((s) => [s.user_id, s.submitted]));
  const free = league ? Math.max(0, league.max_members - league.member_count) : 0;

  const copy = async () => {
    if (!league) return;
    try {
      await navigator.clipboard.writeText(inviteLink(league.invite_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* код виден на экране */
    }
  };

  if (q.error) {
    return (
      <>
        <PageTitle title="Лига друзей" sub="Комната ожидания" />
        <Content><div className="empty-state"><h3>Лобби недоступно</h3><p>Ты не участник этого лобби, или его удалили.</p></div></Content>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Лига друзей" sub="Комната ожидания" />
      <LobbyTabs active="invite" leagueId={id} />
      <Content>
        <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
          <div style={{ flex: '1 1 340px' }}>
            <div className="eyebrow">Комната ожидания</div>
            <div style={{ font: '600 34px var(--font-num)', letterSpacing: '-.02em', marginTop: 12 }}>{league?.name ?? <Skeleton h={34} w={260} />}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <span className="chip red">Прогнозы</span>
              <span className="chip">По ссылке</span>
              {league?.start_event && <span className="chip">Старт: {league.start_event.name.replace('Гран-при ', '')}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
            <span className="eyebrow">Код для друзей</span>
            <div className="copyf">
              <span className="code2">{league?.invite_code ?? '······'}</span>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={copy} disabled={!league}>
                {copied ? 'Ссылка скопирована ✓' : 'Скопировать ссылку'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <Link className={b.cta} to={`/league/${id}`} style={{ padding: '0 32px' }}>Таблица лиги</Link>
            <span className="mute" style={{ fontSize: 12 }}>Игра начнётся сама — очки считаются с первого этапа лиги</span>
          </div>
        </section>

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 1, flex: '3 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="h">Игроки</h2>
              {league && <span className="chip">{league.member_count} из {league.max_members}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data?.members ?? []).map((m) => (
                <div key={m.user_id} className="lrow" style={{ padding: 16 }}>
                  <Avatar {...avatarOf(m)} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {m.nickname}
                      {m.role === 'owner' && <span className="chip gold" style={{ marginLeft: 8 }}>Хозяин</span>}
                    </div>
                    <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                      {ev ? (sent.get(m.user_id) ? 'Прогноз на ближайший этап отправлен' : 'Прогноз ещё не отправлен') : 'В лобби'}
                    </div>
                  </div>
                  {ev && <span className={`chip ${sent.get(m.user_id) ? 'green' : ''}`}>{sent.get(m.user_id) ? 'Готов' : 'Ждём'}</span>}
                </div>
              ))}
              {q.isLoading && <Skeleton h={80} />}
              {league && free > 0 && (
                <Link to={`/lobby/${id}/invite`} className="lrow" style={{ padding: 16, borderStyle: 'dashed', background: 'transparent', color: 'var(--mute)', justifyContent: 'center' }}>
                  Ещё {free} {plural(free, 'место', 'места', 'мест')} — позови друзей
                </Link>
              )}
            </div>
          </section>

          {ev && (
            <section className="card rise" style={{ ['--i' as string]: 2, flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="eyebrow">Ближайший этап</span>
              <div>
                <div style={{ font: '600 20px var(--font-num)' }}>{ev.name}</div>
                <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                  {ev.sessions.length ? formatRange(ev.sessions[0]!.starts_at, ev.sessions[ev.sessions.length - 1]!.starts_at) : ''} · {ev.country}
                </div>
              </div>
              {hasTrack(ev.slug) && <TrackMap slug={ev.slug} label={ev.name} />}
              {ev.deadline && <div className="mute" style={{ fontSize: 13 }}>Приём прогнозов до {formatDateTime(ev.deadline)}</div>}
              <Link className={`${b.cta} ${b.sm}`} to="/predict">Сделать прогноз</Link>
            </section>
          )}
        </div>
      </Content>
    </>
  );
}
