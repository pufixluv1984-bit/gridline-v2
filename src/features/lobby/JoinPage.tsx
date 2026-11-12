import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrandMark } from '@/features/auth/AuthLayout';
import { useAuth } from '@/features/auth/authContext';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
import { joinLeague, leaguePreview } from '@/lib/api/leagues';
import { signOut } from '@/lib/api/auth';
import { setCurrentLeague } from '@/lib/currentLeague';
import { initialsOf } from '@/lib/initials';
import { parseInviteCode } from '@/lib/invite';
import { Avatar } from '@/ui/game';
import { Frame } from '@/ui/Frame';
import { MiniFooter } from '@/ui/Footer';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import s from './Join.module.css';
import { LobbyTabs } from './LobbyTabs';
import { avatarOf } from '@/lib/avatar';
import { t, tn } from '@/i18n';
import { gpShort } from '@/lib/time/format';

/** Ввод кода вручную (внутри приложения): /lobby/join. */
export function JoinByCodePage() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState('');
  const code = parseInviteCode(raw);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code) navigate(`/join/${code}`);
  };
  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={t('lobby.joinSub')} />
      <LobbyTabs active="join" />
      <Content>
        <form className="card rise" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={submit} noValidate>
          <div>
            <h2 className="h">{t('lobby.codeTitle')}</h2>
            <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{t('lobby.codeHelp')}</div>
          </div>
          <input className="in" type="text" autoComplete="off" placeholder="K7Q2XM" value={raw} onChange={(e) => setRaw(e.target.value)} aria-label={t('lobby.codeAria')} />
          <button type="submit" className={b.cta} disabled={!code}>{t('lobby.find')}</button>
        </form>
      </Content>
    </>
  );
}

/** Макет Lobby-Join: превью лиги по ссылке и кнопка «Присоединиться». Без боковой панели. */
export default function JoinPage() {
  const { code: rawCode = '' } = useParams();
  const code = parseInviteCode(rawCode);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const me = useQuery({ queryKey: profileKeys.me(userId ?? 'none'), queryFn: () => getMyProfile(userId!), enabled: !!userId });
  const preview = useQuery({ queryKey: ['league-preview', code], queryFn: () => leaguePreview(code!), enabled: !!code, retry: false, staleTime: 60_000 });

  const join = useMutation({
    mutationFn: () => joinLeague(code!),
    onSuccess: (id) => {
      if (!id) return;
      setCurrentLeague(id);
      void qc.invalidateQueries({ queryKey: ['screen'] });
      navigate(`/league/${id}`, { replace: true });
    },
  });

  const p = preview.data && !preview.data.error ? preview.data : null;
  const notFound = !code || preview.data?.error === 'not_found' || (join.isSuccess && !join.data);
  const full = p ? p.member_count >= p.max_members && !p.already_member : false;

  return (
    <Frame>
      <div className={s.stage}>
        <div className={`${s.center} rise`}>
          <BrandMark />
          {notFound ? (
            <div className={s.card}>
              <div style={{ font: '600 26px var(--font-num)' }}>{t('lobby.notFound')}</div>
              <div className="mute" style={{ fontSize: 15, lineHeight: 1.5 }}>{t('lobby.notFoundJoin')}</div>
              <Link className={`${b.cta} ${b.ghost}`} to="/lobby/join">{t('lobby.enterCode')}</Link>
            </div>
          ) : preview.error ? (
            <div className={s.card}>
              <div className="alert bad" role="alert">{(preview.error as Error).message}</div>
              <Link className={`${b.cta} ${b.ghost}`} to="/">{t('common.toHome')}</Link>
            </div>
          ) : (
            <>
              <div className="mute" style={{ fontSize: 16 }}>
                {p ? tn('lobby.invitesYou', { name: <b style={{ color: '#fff' }}>{p.owner_nickname}</b> }) : t('lobby.loadingInvite')}
              </div>
              <div className={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className={s.mark}>{initialsOf(p?.name ?? '··')}</span>
                  <div>
                    <div style={{ font: '600 26px var(--font-num)', letterSpacing: '-.02em' }}>{p?.name ?? '…'}</div>
                    {p && <div className="mute" style={{ fontSize: 13, marginTop: 4 }}>{t('lobby.owner', { name: p.owner_nickname })}</div>}
                  </div>
                </div>
                {p && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="chip red">{t('lobby.mode.predict')}</span>
                      {p.start_event && <span className="chip">{t('lobby.start', { name: gpShort(p.start_event.name) })}</span>}
                      <span className="chip">{t('lobby.upTo', { n: p.max_members })}</span>
                    </div>
                    <div className={s.players}>
                      <div style={{ display: 'flex' }}>
                        {p.members.map((m, i) => (
                          <span key={i} style={{ marginLeft: i ? -10 : 0, borderRadius: '50%', border: '2px solid #0f0f12', display: 'inline-flex' }}>
                            <Avatar {...avatarOf(m)} size={38} />
                          </span>
                        ))}
                      </div>
                      <div className="mute" style={{ fontSize: 14 }}>
                        {t('lobby.playing', { n: p.member_count, max: p.max_members })}
                      </div>
                    </div>
                    {full ? (
                      <div className="alert bad">{t('lobby.full')}</div>
                    ) : (
                      <div className="alert info">
                        <div>
                          {p.already_member ? t('lobby.already') : tn('lobby.joinAs', { name: <b style={{ color: '#fff' }}>{me.data?.nickname ?? '…'}</b> })}
                        </div>
                      </div>
                    )}
                    {join.error && <div className="alert bad" role="alert">{join.error.message}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button type="button" className={b.cta} disabled={full || join.isPending} onClick={() => (p.already_member ? navigate(`/league/${p.id}`) : join.mutate())}>
                        {p.already_member ? t('lobby.openLobby') : join.isPending ? t('lobby.joining') : t('lobby.join')}
                      </button>
                      <Link className={`${b.cta} ${b.ghost}`} to="/">{t('lobby.notNow')}</Link>
                    </div>
                  </>
                )}
              </div>
              <div className="mute" style={{ fontSize: 13 }}>
                {t('lobby.notYou')}{' '}
                <button type="button" className={s.link} onClick={() => void signOut()}>
                  {t('lobby.otherAccount')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <MiniFooter center />
    </Frame>
  );
}
