import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { createLeague, currentSeasonId } from '@/lib/api/leagues';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
import { scheduleScreen, screenKeys } from '@/lib/api/screens';
import { setCurrentLeague } from '@/lib/currentLeague';
import { initialsOf } from '@/lib/initials';
import { formatRange } from '@/lib/time/format';
import { serverNow } from '@/lib/time/useServerNow';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import { LobbyTabs } from './LobbyTabs';

const MODES = [
  { t: 'Прогнозы', on: true },
  { t: 'Фэнтези', on: false },
  { t: 'Оба', on: false },
];
const ACCESS = [
  { t: 'По приглашению', on: false },
  { t: 'По ссылке', on: true },
  { t: 'Открытое', on: false },
];

/** Макет Lobby-Create. Фэнтези, приглашения по нику и открытые лиги — в следующих фазах. */
export default function CreateLeaguePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const profile = useQuery({ queryKey: profileKeys.me(userId ?? 'none'), queryFn: () => getMyProfile(userId!), enabled: !!userId });
  const schedule = useQuery({ queryKey: screenKeys.schedule(), queryFn: scheduleScreen, staleTime: 10 * 60_000 });

  const [name, setName] = useState('');
  const [count, setCount] = useState(8);
  const [startId, setStartId] = useState<string>('');

  const now = serverNow();
  const upcoming = (schedule.data?.events ?? []).filter((e) => e.deadline && Date.parse(e.deadline) > now);
  const start = upcoming.find((e) => String(e.id) === startId) ?? upcoming[0];

  const create = useMutation({
    mutationFn: async () =>
      createLeague({ name, maxMembers: count, startEventId: start?.id ?? null, seasonId: await currentSeasonId() }),
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

  const startLabel = start ? `с ${start.name.replace('Гран-при ', '')}` : 'с ближайшего этапа';
  const owner = profile.data?.nickname ?? '…';

  return (
    <>
      <PageTitle title="Лига друзей" sub="Создать лобби" />
      <LobbyTabs active="create" />
      <Content>
        <div className="row">
          <form className="card rise" style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }} onSubmit={submit} noValidate>
            <div>
              <h2 className="h">Новое лобби</h2>
              <div className="mute" style={{ fontSize: 14, marginTop: 6 }}>Настрой игру — друзей позовёшь на следующем шаге</div>
            </div>
            <div>
              <label className="lab" htmlFor="lg-name">Название</label>
              <input id="lg-name" className="in" type="text" placeholder="Как назовём лобби" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
              <div className={`help ${name && !nameOk ? 'err' : ''}`}>
                {name && !nameOk ? 'От 2 до 32 символов, без < и >.' : 'До 32 символов. Его увидят все, кто получит приглашение.'}
              </div>
            </div>
            <div>
              <span className="lab">Режим игры</span>
              <div className="seg2" role="group" aria-label="Режим игры">
                {MODES.map((m) => (
                  <button key={m.t} type="button" className={m.on ? 'on' : ''} disabled={!m.on} title={m.on ? undefined : 'Фэнтези-лига откроется к сезону 2027'}>
                    {m.t}
                  </button>
                ))}
              </div>
              <div className="help">Игра прогнозов на этапы. Фэнтези-лига откроется к сезону 2027.</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
              <div style={{ flex: '1 1 220px' }}>
                <span className="lab">Игроков</span>
                <div className="stp">
                  <button type="button" aria-label="Меньше" onClick={() => setCount((c) => Math.max(2, c - 1))}>−</button>
                  <b aria-live="polite">{count}</b>
                  <button type="button" aria-label="Больше" onClick={() => setCount((c) => Math.min(20, c + 1))}>+</button>
                </div>
                <div className="help">От 2 до 20</div>
              </div>
              <div style={{ flex: '2 1 300px' }}>
                <label className="lab" htmlFor="lg-start">Старт с этапа</label>
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
                <div className="help">Очки до этого этапа не считаются.</div>
              </div>
            </div>
            <div>
              <span className="lab">Кто может войти</span>
              <div className="seg2" role="group" aria-label="Доступ">
                {ACCESS.map((a) => (
                  <button key={a.t} type="button" className={a.on ? 'on' : ''} disabled={!a.on} title={a.on ? undefined : 'Скоро'}>
                    {a.t}
                  </button>
                ))}
              </div>
              <div className="help">Любой, у кого есть ссылка или код, попадёт в лобби.</div>
            </div>
            {create.error && <div className="alert bad" role="alert">{create.error.message}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              <button type="submit" className={b.cta} disabled={!nameOk || create.isPending} style={{ padding: '0 32px' }}>
                {create.isPending ? 'Создаём…' : 'Создать лобби'}
              </button>
              <PillJoin />
            </div>
          </form>

          <section className="card rise" style={{ ['--i' as string]: 1, flex: '2 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="eyebrow">Так увидят друзья</div>
            <div style={{ padding: 22, borderRadius: 22, background: 'radial-gradient(90% 90% at 80% 0%,rgba(232,33,26,.18),transparent 70%),#0f0f12', border: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--gold)', color: '#0a0a0d', font: "700 18px var(--font-num)", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {initialsOf(name.trim() || 'Лобби')}
                </span>
                <div>
                  <div style={{ font: "600 22px var(--font-num)", letterSpacing: '-.01em' }}>{name.trim() || 'Название лобби'}</div>
                  <div className="mute" style={{ fontSize: 13, marginTop: 3 }}>Хозяин: {owner}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span className="chip red">Прогнозы</span>
                <span className="chip">По ссылке</span>
                <span className="chip">{startLabel}</span>
              </div>
              <div>
                <div className="mute" style={{ fontSize: 13, marginBottom: 10 }}>Игроки · 1 из {count}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: Math.min(count, 8) }, (_, i) =>
                    i === 0 ? (
                      <span key={i} className="ava" style={{ width: 40, height: 40, background: profile.data?.avatar_color ?? 'var(--gold)' }}>
                        {initialsOf(owner)}
                      </span>
                    ) : (
                      <span key={i} className="ava" style={{ width: 40, height: 40, background: 'transparent', border: '1px dashed rgba(255,255,255,.25)', color: '#6d6d77' }}>+</span>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="step"><b>1</b><div><div style={{ fontWeight: 600 }}>Создай лобби</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>Название и лимит можно изменить потом</div></div></div>
            <div className="step"><b>2</b><div><div style={{ fontWeight: 600 }}>Позови друзей</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>Ссылкой или кодом</div></div></div>
            <div className="step"><b>3</b><div><div style={{ fontWeight: 600 }}>Играйте</div><div className="mute" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>Прогнозы с ближайшего этапа</div></div></div>
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
      Есть код? Войти в лобби
    </button>
  );
}
