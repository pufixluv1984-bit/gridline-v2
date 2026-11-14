import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { resetInviteCode } from '@/lib/api/leagues';
import { leagueScreen, screenKeys } from '@/lib/api/screens';
import { inviteLink } from '@/lib/invite';
import { Avatar, Skeleton } from '@/ui/game';
import { IconCheck } from '@/ui/icons';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import { LobbyTabs } from './LobbyTabs';
import { LobbyLoading, LobbyNoAccess } from './LobbyGate';
import { avatarOf } from '@/lib/avatar';
import { t } from '@/i18n';

/** Макет Lobby-Invite: ссылка и код, «отправить в», сброс ссылки, кто уже в лобби. */
export default function InvitePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: screenKeys.league(id), queryFn: () => leagueScreen(id), enabled: !!id, retry: false });
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const reset = useMutation({
    mutationFn: () => resetInviteCode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: screenKeys.league(id) }),
  });

  const league = q.data?.league;
  const link = league ? inviteLink(league.invite_code) : '';
  const isOwner = league?.owner_id === auth.session?.user.id;
  const text = league ? t('lobby.shareText', { name: league.name }) : '';

  const copy = async (what: 'link' | 'code') => {
    if (!league) return;
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : league.invite_code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* без доступа к буферу — пусть выделят вручную */
    }
  };

  if (q.isLoading) return <LobbyLoading sub={t('lobby.inviteSub')} />;
  if (q.error) return <LobbyNoAccess sub={t('lobby.inviteSub')} />;

  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={t('lobby.inviteSub')} />
      <LobbyTabs active="invite" leagueId={id} />
      <Content>
        <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, background: 'radial-gradient(60% 120% at 0% 0%,rgba(127,224,160,.10),transparent 70%),var(--card-grad)' }}>
          <span style={{ width: 64, height: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(127,224,160,.1)', border: '1px solid rgba(127,224,160,.35)', color: 'var(--pos)' }}>
            <IconCheck size={30} />
          </span>
          <div style={{ flex: '1 1 300px' }}>
            <div className="eyebrow" style={{ color: 'var(--pos)' }}>{t('lobby.created')}</div>
            <div style={{ font: '600 30px var(--font-num)', letterSpacing: '-.02em', marginTop: 10 }}>{league?.name ?? <Skeleton h={30} w={240} />}</div>
            {league && (
              <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>
                {t('lobby.meta', { n: league.max_members })}{league.start_event ? t('lobby.metaStart', { name: league.start_event.name }) : ''}
              </div>
            )}
          </div>
          <Link className={b.cta} to={`/lobby/${id}/waiting`} style={{ padding: '0 28px' }}>{t('lobby.goLobby')}</Link>
        </section>

        <div className="row">
          <section className="card rise" style={{ ['--i' as string]: 1, flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 className="h">{t('lobby.inviteTitle')}</h2>
              <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{t('lobby.inviteText')}</div>
            </div>
            <div>
              <span className="lab">{t('lobby.inviteLink')}</span>
              <div className="copyf">
                <span>{link || '…'}</span>
                <button type="button" className={`${b.cta} ${b.sm}`} style={{ minWidth: 150 }} onClick={() => copy('link')} disabled={!league}>
                  {copied === 'link' ? t('lobby.copiedShort') : t('lobby.copyShort')}
                </button>
              </div>
            </div>
            <div>
              <span className="lab">{t('lobby.code')}</span>
              <div className="copyf">
                <span className="code2">{league?.invite_code ?? '······'}</span>
                <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => copy('code')} disabled={!league}>
                  {copied === 'code' ? t('lobby.copiedShort') : t('lobby.copyShort')}
                </button>
              </div>
            </div>
            <div>
              <span className="lab">{t('lobby.sendTo')}</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a className={`${b.cta} ${b.sm} ${b.ghost}`} style={{ flex: 1 }} target="_blank" rel="noreferrer"
                  href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`}>
                  Telegram
                </a>
                <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} style={{ flex: 1 }} onClick={() => copy('link')} title={t('lobby.discordHint')}>
                  Discord
                </button>
                <a className={`${b.cta} ${b.sm} ${b.ghost}`} style={{ flex: 1 }}
                  href={`mailto:?subject=${encodeURIComponent(t('lobby.mailSubject'))}&body=${encodeURIComponent(`${text}\n${link}`)}`}>
                  {t('lobby.mail')}
                </a>
              </div>
            </div>
            {isOwner && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div className="kv">
                  <span>
                    {t('lobby.resetLink')}
                    <span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{t('lobby.resetHelp')}</span>
                  </span>
                  <button type="button" className="mini" onClick={() => reset.mutate()} disabled={reset.isPending}>
                    {reset.isPending ? t('lobby.resetting') : t('lobby.reset')}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2, flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="h">{t('lobby.inLobby')}</h2>
              {league && <span className="mute" style={{ fontSize: 13 }}>{t('lobby.xOfY', { n: league.member_count, max: league.max_members })}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(q.data?.members ?? []).map((m) => (
                <div key={m.user_id} className="lrow">
                  <Avatar {...avatarOf(m)} size={40} />
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{m.nickname}</div>
                  <span className={`chip ${m.role === 'owner' ? 'gold' : 'green'}`}>{m.role === 'owner' ? t('lobby.owner2') : t('lobby.inLobby')}</span>
                </div>
              ))}
              {q.isLoading && <Skeleton h={64} />}
            </div>
            <div className="mute" style={{ fontSize: 13, lineHeight: 1.5 }}>{t('lobby.listHelp')}</div>
          </section>
        </div>
      </Content>
    </>
  );
}
