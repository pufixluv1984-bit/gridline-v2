import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { carryOverLeague, kickMember, leaveLeague, transferLeague } from '@/lib/api/leagues';
import { homeScreen, leagueScreen, screenKeys, type LeagueScreen } from '@/lib/api/screens';
import { getCurrentLeague, setCurrentLeague } from '@/lib/currentLeague';
import { initialsOf } from '@/lib/initials';
import { inviteLink } from '@/lib/invite';
import { Avatar, Skeleton } from '@/ui/game';
import { LeagueSettings } from './LeagueSettings';
import { StandingsCard } from './Standings';
import { IconWarn } from '@/ui/icons';
import { Modal } from '@/ui/Modal';
import { Content, PageTitle, PillLink, Toolbar } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import pg from '@/ui/Page.module.css';
import { avatarOf } from '@/lib/avatar';
import { t } from '@/i18n';

/** /league без id: открываем выбранную лигу или первую, иначе — пустое состояние. */
export function LeagueIndexPage() {
  const remembered = getCurrentLeague();
  const q = useQuery({ queryKey: screenKeys.home(remembered), queryFn: () => homeScreen(remembered) });
  if (q.isLoading) return <><PageTitle title={t('common.friendsLeague')} sub={t('league.table')} /><Content><Skeleton h={300} /></Content></>;
  if (q.data?.league_id) return <Navigate to={`/league/${q.data.league_id}`} replace />;
  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={t('league.table')} />
      <Content>
        <div className="empty-state">
          <h3>{t('league.notIn')}</h3>
          <p>{t('league.notInText')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className={`${b.cta} ${b.sm}`} to="/lobby/create">{t('common.createLobby')}</Link>
            <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/lobby/join">{t('common.joinByCode')}</Link>
          </div>
        </div>
      </Content>
    </>
  );
}

type Dialog = { kind: 'leave' } | { kind: 'kick' | 'transfer'; userId: string; nickname: string } | null;

/** Макет League: шапка лиги с кодом, таблица, дуэли, участники. */
export default function LeaguePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const me = auth.session?.user.id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: screenKeys.league(id), queryFn: () => leagueScreen(id), enabled: !!id, retry: false });
  const [copied, setCopied] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    if (q.data) setCurrentLeague(id);
  }, [q.data, id]);

  const act = useMutation({
    mutationFn: async (d: NonNullable<Dialog>) => {
      if (d.kind === 'leave') return leaveLeague(id);
      if (d.kind === 'kick') return kickMember(id, d.userId);
      return transferLeague(id, d.userId);
    },
    onSuccess: (_r, d) => {
      void qc.invalidateQueries({ queryKey: ['screen'] });
      setDialog(null);
      if (d.kind === 'leave') {
        setCurrentLeague(null);
        navigate('/league', { replace: true });
      }
    },
  });

  const carry = useMutation({
    mutationFn: () => carryOverLeague(id),
    onSuccess: (nid) => {
      void qc.invalidateQueries({ queryKey: ['screen'] });
      setCurrentLeague(nid);
      navigate(`/league/${nid}`);
    },
  });

  if (q.error) {
    return (
      <>
        <PageTitle title={t('common.friendsLeague')} sub={t('league.table')} />
        <Content>
          <div className="empty-state"><h3>{t('league.unavailable')}</h3><p>{t('league.unavailableText')}</p><Link className={`${b.cta} ${b.sm}`} to="/league">{t('league.toMine')}</Link></div>
        </Content>
      </>
    );
  }

  const data = q.data;
  const league = data?.league;
  const isOwner = !!league && league.owner_id === me;

  const copy = async () => {
    if (!league) return;
    try {
      await navigator.clipboard.writeText(inviteLink(league.invite_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* без буфера — код виден на экране */
    }
  };

  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={t('league.table')} />
      <Toolbar>
        <PillLink to={`/league/${id}`} end>{t('league.table')}</PillLink>
        <a className={pg.pill} href="#duels" onClick={(e) => { e.preventDefault(); document.getElementById('duels')?.scrollIntoView({ behavior: 'smooth' }); }}>
          {t('league.duels')}
        </a>
        <a className={pg.pill} href="#members" onClick={(e) => { e.preventDefault(); document.getElementById('members')?.scrollIntoView({ behavior: 'smooth' }); }}>
          {t('league.members')}
        </a>
        {isOwner && <PillLink to={`/lobby/${id}/invite`}>{t('league.invite')}</PillLink>}
        <PillLink to="/lobby/create">{t('league.newLobby')}</PillLink>
      </Toolbar>
      <Content>
        <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--gold)', color: '#0a0a0d', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 26px var(--font-num)' }}>
              {initialsOf(league?.name ?? '··')}
            </div>
            <div>
              <div className="eyebrow">{t('league.league')}</div>
              <div className="num" style={{ fontSize: 32, fontWeight: 600, marginTop: 10 }}>{league?.name ?? '…'}</div>
              {league && (
                <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>
                  {t('league.meta', { n: league.member_count, max: league.max_members, year: 2026 })}
                  {league.start_event ? t('league.since', { name: league.start_event.name }) : ''}
                </div>
              )}
            </div>
          </div>
          {league && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ height: 44, padding: '0 16px', borderRadius: 14, background: 'var(--bg-field)', border: '1px solid var(--line-strong)', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <span className="mute">{t('league.code')}</span>
                <b className="num" style={{ letterSpacing: '.1em' }}>{league.invite_code}</b>
              </div>
              <button type="button" className="mini go" onClick={copy}>{copied ? t('league.copied') : t('league.copy')}</button>
            </div>
          )}
        </section>

        {data?.archive && (
          <div className="sbn">
            <span className="ic" aria-hidden="true">★</span>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t('league.archive', { year: league?.season ?? '' })}</div>
              <div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                {data.carried_to
                  ? t('league.carried', { year: data.current_season })
                  : isOwner
                    ? t('league.carryOwner', { year: data.current_season })
                    : t('league.carryOther', { year: data.current_season })}
              </div>
            </div>
            {data.carried_to ? (
              <Link className="mini go" to={`/league/${data.carried_to}`} style={{ display: 'inline-flex', alignItems: 'center' }}>{t('league.openYear', { year: data.current_season })}</Link>
            ) : isOwner ? (
              <button type="button" className="mini go" disabled={carry.isPending} onClick={() => carry.mutate()}>
                {carry.isPending ? t('league.carrying') : t('league.carryTo', { year: data.current_season })}
              </button>
            ) : null}
          </div>
        )}
        {carry.error && <div className="alert bad" role="alert">{carry.error.message}</div>}
        <StandingsCard data={data} me={me} />

        {isOwner && league && <LeagueSettings key={JSON.stringify(league.bonus_config)} leagueId={id} config={league.bonus_config} />}

        <div className="row">
          <Duels data={data} me={me} />
          <section className="card rise" style={{ ['--i' as string]: 3, flex: '1 1 480px' }} id="members">
            <h2 className="h">{t('league.members')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {(data?.members ?? []).map((x) => {
                const sub = data?.submissions.find((s) => s.user_id === x.user_id);
                return (
                  <div key={x.user_id} className="lrow">
                    <Avatar {...avatarOf(x)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{x.nickname}{x.user_id === me ? t('league.you') : ''}</div>
                      <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>
                        {data?.event ? (sub?.submitted ? t('league.sentFor', { name: data.event.name }) : t('league.notSent')) : ''}
                      </div>
                    </div>
                    <span className={`chip ${x.role === 'owner' ? 'gold' : ''}`}>{x.role === 'owner' ? t('league.owner') : t('league.player')}</span>
                    {isOwner && x.user_id !== me && (
                      <>
                        <button type="button" className="mini" onClick={() => setDialog({ kind: 'transfer', userId: x.user_id, nickname: x.nickname })}>{t('league.transfer')}</button>
                        <button type="button" className="mini" onClick={() => setDialog({ kind: 'kick', userId: x.user_id, nickname: x.nickname })}>{t('league.kick')}</button>
                      </>
                    )}
                  </div>
                );
              })}
              {q.isLoading && <Skeleton h={60} />}
            </div>
            {league && (
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => setDialog({ kind: 'leave' })}>
                  {isOwner && league.member_count === 1 ? t('league.deleteLeague') : t('league.leave')}
                </button>
              </div>
            )}
          </section>
        </div>
      </Content>

      {dialog && (
        <Modal
          title={dialog.kind === 'leave' ? (isOwner && league?.member_count === 1 ? t('league.deleteQ') : t('league.leaveQ')) : dialog.kind === 'kick' ? t('league.kickQ', { name: dialog.nickname }) : t('league.transferQ', { name: dialog.nickname })}
          icon={<IconWarn size={24} />}
          onClose={() => { setDialog(null); act.reset(); }}
          busy={act.isPending}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => { setDialog(null); act.reset(); }} disabled={act.isPending}>{t('common.cancel')}</button>
              <button type="button" className={`${b.cta} ${b.sm} ${dialog.kind === 'transfer' ? '' : b.dng}`} onClick={() => act.mutate(dialog)} disabled={act.isPending}>
                {act.isPending ? t('league.wait') : dialog.kind === 'leave' ? (isOwner && league?.member_count === 1 ? t('league.delete') : t('league.leaveBtn')) : dialog.kind === 'kick' ? t('league.kick') : t('league.transfer')}
              </button>
            </>
          }
        >
          <p className={m.text}>
            {dialog.kind === 'leave'
              ? isOwner && league?.member_count === 1
                ? t('league.lastPlayer')
                : isOwner
                  ? t('league.ownerFirst')
                  : t('league.leaveText')
              : dialog.kind === 'kick'
                ? t('league.kickText')
                : t('league.transferText')}
          </p>
          {act.error && <div className="alert bad" role="alert">{act.error.message}</div>}
        </Modal>
      )}
    </>
  );
}

/** Дуэли: сколько этапов ты набрал больше каждого соперника. */
function Duels({ data, me }: { data: LeagueScreen | undefined; me: string | undefined }) {
  const duels = useMemo(() => {
    if (!data || !me) return [];
    const by = new Map<string, Map<number, number>>();
    for (const x of data.per_event) {
      if (!by.has(x.user_id)) by.set(x.user_id, new Map());
      by.get(x.user_id)!.set(x.round, x.points);
    }
    const rounds = [...new Set(data.per_event.map((x) => x.round))];
    const mine = by.get(me) ?? new Map<number, number>();
    return data.members
      .filter((x) => x.user_id !== me)
      .map((x) => {
        const theirs = by.get(x.user_id) ?? new Map<number, number>();
        let a = 0;
        let bb = 0;
        for (const r of rounds) {
          const pa = mine.get(r) ?? 0;
          const pb = theirs.get(r) ?? 0;
          if (pa > pb) a++;
          else if (pb > pa) bb++;
        }
        return { ...x, a, b: bb };
      });
  }, [data, me]);
  const meRow = data?.members.find((x) => x.user_id === me);

  return (
    <section className="card rise" style={{ ['--i' as string]: 2, flex: '1 1 480px' }} id="duels">
      <h2 className="h">{t('league.duels')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        {duels.map((d) => {
          const total = d.a + d.b || 1;
          return (
            <div key={d.user_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {meRow && <Avatar {...avatarOf(meRow)} />}
                <div className="num" style={{ fontSize: 24, fontWeight: 600, flex: 1, textAlign: 'center' }}>{d.a} <span className="mute">:</span> {d.b}</div>
                <Avatar {...avatarOf(d)} />
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e1e24', gap: 3, marginTop: 10 }}>
                <i style={{ display: 'block', width: `${(d.a / total) * 100}%`, background: meRow?.avatar_color }} />
                <i style={{ display: 'block', width: `${(d.b / total) * 100}%`, background: d.avatar_color }} />
              </div>
              <div className="mute" style={{ fontSize: 13, marginTop: 8 }}>{t('league.vs', { a: meRow?.nickname ?? '', b: d.nickname })}</div>
            </div>
          );
        })}
        {data && duels.length === 0 && <div className="mute" style={{ fontSize: 14 }}>{t('league.duelsEmpty')}</div>}
      </div>
    </section>
  );
}
