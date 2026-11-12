import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { createLeague, currentSeasonId } from '@/lib/api/leagues';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
import { scheduleScreen, screenKeys } from '@/lib/api/screens';
import { setCurrentLeague } from '@/lib/currentLeague';
import { initialsOf } from '@/lib/initials';
import { formatRange, gpShort } from '@/lib/time/format';
import { serverNow } from '@/lib/time/useServerNow';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import { LobbyTabs } from './LobbyTabs';
import { Avatar } from '@/ui/Avatar';
import { t, type Key } from '@/i18n';

const MODES = [
  { id: 'predict', t: 'lobby.mode.predict', help: 'lobby.mode.predictHelp' },
  { id: 'fantasy', t: 'lobby.mode.fantasy', help: 'lobby.mode.fantasyHelp' },
  { id: 'both', t: 'lobby.mode.both', help: 'lobby.mode.bothHelp' },
] as const;
type Mode = (typeof MODES)[number]['id'];
const ACCESS: { t: Key; on: boolean }[] = [
  { t: 'lobby.access.invite', on: false },
  { t: 'lobby.access.link', on: true },
  { t: 'lobby.access.open', on: false },
];

/** Макет Lobby-Create. Приглашения по нику и открытые лиги — позже. */
export default function CreateLeaguePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const profile = useQuery({ queryKey: profileKeys.me(userId ?? 'none'), queryFn: () => getMyProfile(userId!), enabled: !!userId });
  const schedule = useQuery({ queryKey: screenKeys.schedule(), queryFn: scheduleScreen, staleTime: 10 * 60_000 });

  const [mode, setMode] = useState<Mode>('predict');
  const [name, setName] = useState('');
  const [count, setCount] = useState(8);
  const [startId, setStartId] = useState<string>('');

  const now = serverNow();
  const upcoming = (schedule.data?.events ?? []).filter((e) => e.deadline && Date.parse(e.deadline) > now);
  const start = upcoming.find((e) => String(e.id) === startId) ?? upcoming[0];

  const create = useMutation({
    mutationFn: async () =>
      createLeague({ name, mode, maxMembers: count, startEventId: start?.id ?? null, seasonId: await currentSeasonId() }),
    onSuccess: (id) => {
      setCurrentLeague(id);
      void qc.invalidateQueries({ queryKey: ['screen'] });
      navigate(`/lobby/${id}/invite`);
    },
  });

  const nameOk = name.trim().length >= 2 && name.trim().length <= 32 && !/[<>]/.test(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (nameOk && !create.isPending) create.mutate();
  };

  const startLabel = start ? t('lobby.startFrom', { name: gpShort(start.name) }) : t('lobby.startNext');
  const owner = profile.data?.nickname ?? '…';

  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={t('lobby.create')} />
      <LobbyTabs active="create" />
      <Content>
        <div className="row">
          <form className="card rise" style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }} onSubmit={submit} noValidate>
            <div>
              <h2 className="h">{t('lobby.new')}</h2>
              <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>{t('lobby.newText')}</div>
            </div>
            <div>
              <label className="lab" htmlFor="lg-name">{t('lobby.name')}</label>
              <input id="lg-name" className="in" type="text" placeholder={t('lobby.namePh')} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
              <div className={`help ${name && !nameOk ? 'err' : ''}`}>
                {name && !nameOk ? t('lobby.nameBad') : t('lobby.nameHelp')}
              </div>
            </div>
            <div>
              <span className="lab">{t('lobby.gameMode')}</span>
              <div className="seg2" role="group" aria-label={t('lobby.gameMode')}>
                {MODES.map((m) => (
                  <button key={m.id} type="button" className={mode === m.id ? 'on' : ''} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                    {t(m.t)}
                  </button>
                ))}
              </div>
              <div className="help">{t(MODES.find((m) => m.id === mode)!.help)}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
              <div style={{ flex: '1 1 220px' }}>
                <span className="lab">{t('lobby.players')}</span>
                <div className="stp">
                  <button type="button" aria-label={t('lobby.fewer')} onClick={() => setCount((c) => Math.max(2, c - 1))}>−</button>
                  <b aria-live="polite">{count}</b>
                  <button type="button" aria-label={t('lobby.more')} onClick={() => setCount((c) => Math.min(20, c + 1))}>+</button>
                </div>
                <div className="help">{t('lobby.from2to20')}</div>
              </div>
              <div style={{ flex: '2 1 300px' }}>
                <label className="lab" htmlFor="lg-start">{t('lobby.startRound')}</label>
                <select id="lg-start" className="in" value={start ? String(start.id) : ''} onChange={(e) => setStartId(e.target.value)} disabled={!upcoming.length}>
                  {upcoming.map((e) => {
                    const first = e.sessions[0]?.starts_at;
                    const last = e.sessions[e.sessions.length - 1]?.starts_at;
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {first && last ? ` · ${formatRange(first, last)}` : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="help">{t('lobby.startHelp')}</div>
              </div>
            </div>
            <div>
              <span className="lab">{t('lobby.whoCanJoin')}</span>
              <div className="seg2" role="group" aria-label={t('lobby.accessAria')}>
                {ACCESS.map((a) => (
                  <button key={a.t} type="button" className={a.on ? 'on' : ''} disabled={!a.on} title={a.on ? undefined : t('lobby.soon')}>
                    {t(a.t)}
                  </button>
                ))}
              </div>
              <div className="help">{t('lobby.accessHelp')}</div>
            </div>
            {create.error && <div className="alert bad" role="alert">{create.error.message}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              <button type="submit" className={b.cta} disabled={!nameOk || create.isPending} style={{ padding: '0 32px' }}>
                {create.isPending ? t('lobby.creating') : t('lobby.create')}
              </button>
              <PillJoin />
            </div>
          </form>

          <section className="card rise" style={{ ['--i' as string]: 1, flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="eyebrow">{t('lobby.preview')}</div>
            <div style={{ padding: 22, borderRadius: 22, background: 'radial-gradient(90% 90% at 80% 0%,rgba(232,33,26,.18),transparent 70%),#0f0f12', border: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--gold)', color: '#0a0a0d', font: "700 18px var(--font-num)", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {initialsOf(name.trim() || t('lobby.lobby'))}
                </span>
                <div>
                  <div style={{ font: "600 22px var(--font-num)", letterSpacing: '-.01em' }}>{name.trim() || t('lobby.namePlaceholder')}</div>
                  <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>{t('lobby.owner', { name: owner })}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span className="chip red">{t(MODES.find((m) => m.id === mode)!.t)}</span>
                <span className="chip">{t('lobby.access.link')}</span>
                <span className="chip">{startLabel}</span>
              </div>
              <div>
                <div className="mute" style={{ fontSize: 13, marginBottom: 10 }}>{t('lobby.playersOf', { n: count })}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: Math.min(count, 8) }, (_, i) =>
                    i === 0 ? (
                      <Avatar
                        key={i}
                        nickname={owner}
                        color={profile.data?.avatar_color ?? 'var(--gold)'}
                        photo={profile.data?.avatar_path}
                        text={profile.data?.avatar_text}
                        size={40}
                      />
                    ) : (
                      <span key={i} className="ava" style={{ width: 40, height: 40, background: 'transparent', border: '1px dashed rgba(255,255,255,.25)', color: '#6d6d77' }}>+</span>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="step"><b>1</b><div><div style={{ fontWeight: 600 }}>{t('lobby.step1')}</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>{t('lobby.step1t')}</div></div></div>
            <div className="step"><b>2</b><div><div style={{ fontWeight: 600 }}>{t('lobby.step2')}</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>{t('lobby.step2t')}</div></div></div>
            <div className="step"><b>3</b><div><div style={{ fontWeight: 600 }}>{t('lobby.step3')}</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>{mode === 'predict' ? t('lobby.step3predict') : mode === 'fantasy' ? t('lobby.step3fantasy') : t('lobby.step3both')}</div></div></div>
          </section>
        </div>
      </Content>
    </>
  );
}

function PillJoin() {
  const navigate = useNavigate();
  return (
    <button type="button" className={`${b.cta} ${b.ghost}`} style={{ padding: '0 26px' }} onClick={() => navigate('/lobby/join')}>
      {t('lobby.haveCode')}
    </button>
  );
}
