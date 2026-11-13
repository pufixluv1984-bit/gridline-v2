import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { finishProfileSetup, profileKeys, updateProfile, welcomeScreen, type Profile } from '@/lib/api/profile';
import { useAvatarEditor } from './useAvatarEditor';
import { Avatar } from '@/ui/Avatar';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import w from './Welcome.module.css';
import { t } from '@/i18n';
import type { Locale } from '@/i18n/locale';

// Те же правила, что в базе (миграции 0001, 0023): база всё равно проверит, здесь — подсказка сразу.
const NICK_RE = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9 _.-]+$/;
function nickProblem(v: string): string | null {
  const x = v.trim();
  if (x.length < 2 || x.length > 20) return t('nick.length');
  if (!NICK_RE.test(x)) return t('nick.chars');
  return null;
}

/** Само окно; грузится отдельным чанком только тем, кому его показать (Welcome.tsx). */
export default function WelcomeWindow({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const [closed, setClosed] = useState(false);
  const [nick, setNick] = useState(profile.nickname);
  const [team, setTeam] = useState<string | null>(profile.fav_team);
  const [driver, setDriver] = useState(profile.fav_driver ?? '');
  const startColor = useState(profile.avatar_color)[0];
  const data = useQuery({ queryKey: ['screen', 'welcome'], queryFn: welcomeScreen, staleTime: Infinity });
  const avatar = useAvatarEditor({
    id: profile.id,
    nickname: profile.nickname,
    avatar_color: profile.avatar_color,
    avatar_path: profile.avatar_path,
    avatar_text: profile.avatar_text,
  });

  const nickChanged = nick.trim() !== profile.nickname;
  const nickErr = nickChanged ? nickProblem(nick) : null;

  const markDone = () => {
    qc.setQueryData<Profile | null>(profileKeys.me(profile.id), (p) => (p ? { ...p, setup_done_at: new Date().toISOString() } : p));
    setClosed(true);
  };

  const later = useMutation({ mutationFn: finishProfileSetup, onSettled: markDone });
  const save = useMutation({
    mutationFn: async () => {
      const patch: Parameters<typeof updateProfile>[1] = {};
      if (nickChanged) patch.nickname = nick.trim();
      if (team !== profile.fav_team) patch.fav_team = team;
      if ((driver || null) !== profile.fav_driver) patch.fav_driver = driver || null;
      // Цвет профиля — от любимой команды, если игрок не выбрал цвет сам в окне «Буквы и цвет».
      const color = data.data?.teams.find((x) => x.id === team)?.color;
      if (color && !profile.avatar_path && profile.avatar_color === startColor) patch.avatar_color = color;
      if (Object.keys(patch).length) await updateProfile(profile.id, patch);
      await finishProfileSetup();
    },
    onSuccess: () => {
      markDone();
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['screen'] });
    },
  });

  // Язык сохраняется сразу: окно тут же перерисуется на выбранном языке.
  const saveLocale = (l: Locale) => {
    qc.setQueryData<Profile | null>(profileKeys.me(profile.id), (p) => (p ? { ...p, locale: l } : p));
    void updateProfile(profile.id, { locale: l }).catch(() => undefined);
  };

  if (closed) return null;
  const busy = save.isPending || later.isPending;
  const skip = () => {
    if (!busy) later.mutate();
  };

  return (
    <Modal
      large
      title={t('welcome.title', { name: profile.nickname })}
      onClose={skip}
      busy={busy || avatar.open}
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={skip} disabled={busy}>
            {t('common.later')}
          </button>
          <button type="button" className={`${b.cta} ${b.sm}`} disabled={busy || !!nickErr} onClick={() => save.mutate()}>
            {save.isPending ? t('common.saving') : t('common.done')}
          </button>
        </>
      }
    >
      <p className={m.text}>{t('welcome.text')}</p>

      <div className={w.who}>
        <Avatar nickname={nick.trim() || profile.nickname} color={profile.avatar_color} photo={profile.avatar_path} text={profile.avatar_text} size={64} radius={20} fontSize={22} />
        <div className={w.photoBtns}>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={avatar.openPhoto} disabled={busy}>
            {t('settings.uploadPhoto')}
          </button>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={avatar.openLetters} disabled={busy}>
            {t('settings.lettersColor')}
          </button>
        </div>
      </div>

      <div className={w.grid2}>
        <div>
          <label className="lab" htmlFor="wel-nick">{t('settings.nick')}</label>
          <input
            id="wel-nick"
            className={`in ${nickErr ? 'err' : ''}`}
            value={nick}
            maxLength={20}
            autoComplete="nickname"
            aria-invalid={!!nickErr}
            aria-describedby="wel-nick-help"
            onChange={(e) => {
              save.reset();
              setNick(e.target.value);
            }}
          />
          <div id="wel-nick-help" className={`help ${nickErr ? 'err' : ''}`}>{nickErr ?? t('welcome.nickHelp')}</div>
        </div>
        <div>
          <span className="lab">{t('lang.title')}</span>
          <LanguageSwitch compact wide onChange={saveLocale} />
        </div>
      </div>

      <div>
        <span className="lab">{t('welcome.team')}</span>
        <div className={w.teams} role="radiogroup" aria-label={t('welcome.teamAria')}>
          {(data.data?.teams ?? []).map((x) => {
            const logo = teamLogo(x.code as TeamCode);
            const on = team === x.id;
            return (
              <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => setTeam(on ? null : x.id)}
                className={`slot ${on ? 'act' : ''} ${w.team}`} style={{ borderColor: on ? x.color : undefined }}>
                {logo ? <img src={logo} alt="" width={32} height={32} /> : <i style={{ background: x.color }} />}
                <b>{x.name}</b>
              </button>
            );
          })}
        </div>
        <div className="help">{t('welcome.teamHelp')}</div>
      </div>

      <div>
        <label className="lab" htmlFor="wel-driver">{t('welcome.driver')}</label>
        <select id="wel-driver" className="in" value={driver} onChange={(e) => setDriver(e.target.value)}>
          <option value="">{t('settings.notSelectedM')}</option>
          {(data.data?.drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name} · {d.team_name}</option>
          ))}
        </select>
      </div>

      {(save.error ?? data.error) && <div className="alert bad" role="alert">{(save.error ?? data.error)!.message}</div>}
      {avatar.element}
    </Modal>
  );
}
