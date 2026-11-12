import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAvatarEditor } from '@/features/profile/useAvatarEditor';
import { updateProfile, type ProfileScreen } from '@/lib/api/profile';
import { serverNow } from '@/lib/time/useServerNow';
import { Avatar } from '@/ui/Avatar';
import b from '@/ui/Button.module.css';
import p from '@/ui/Page.module.css';
import s from './Settings.module.css';
import { intlLocale } from '@/i18n';
import { t as tr } from '@/i18n';

const NICK_COOLDOWN_MS = 30 * 24 * 3600 * 1000;
// Те же правила, что в базе (миграции 0001, 0015): база всё равно проверит, здесь — подсказка сразу.
const NICK_RE = /^[A-Za-zА-Яа-яЁё0-9 _.-]+$/;

type Values = { nickname: string; fav_team: string; fav_driver: string; team_name: string };

function initial(data: ProfileScreen): Values {
  const pl = data.player!;
  return {
    nickname: pl.nickname,
    fav_team: pl.fav_team?.id ?? '',
    fav_driver: pl.fav_driver?.id ?? '',
    team_name: data.fantasy?.team_name ?? '',
  };
}

function nickProblem(v: string): string | null {
  const t = v.trim();
  if (t.length < 2 || t.length > 20) return tr('nick.length');
  if (!NICK_RE.test(t)) return tr('nick.chars');
  return null;
}

function teamNameProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (t.length < 2 || t.length > 24) return tr('teamName.length');
  return null;
}

const dayMonth = (ms: number) => new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long' }).format(ms);

/**
 * Карточка «Профиль» экрана настроек (макет Settings): аватар, ник, любимые команда и пилот,
 * название фэнтези-команды. Изменения копятся в форме и уходят одним запросом по «Сохранить».
 * Почты и пароля нет: вход только через Google/Discord (PRODUCT.md), вместо них — чем выполнен вход.
 */
export function ProfileForm({
  data,
  userId,
  email,
  providers,
  onSaved,
}: {
  data: ProfileScreen;
  userId: string;
  email?: string;
  providers: string[];
  /** Тост показывает страница: после сохранения форма пересоздаётся с новыми значениями. */
  onSaved: () => void;
}) {
  const pl = data.player!;
  const qc = useQueryClient();
  const saved = initial(data);
  const [v, setV] = useState<Values>(saved);
  const avatar = useAvatarEditor({
    id: pl.id,
    nickname: pl.nickname,
    avatar_color: pl.avatar_color,
    avatar_path: pl.avatar_path ?? null,
    avatar_text: pl.avatar_text ?? null,
  });

  const changedAt = pl.nickname_changed_at ? Date.parse(pl.nickname_changed_at) : null;
  const nextNickAt = changedAt && changedAt + NICK_COOLDOWN_MS > serverNow() ? changedAt + NICK_COOLDOWN_MS : null;

  const patch: Parameters<typeof updateProfile>[1] = {};
  if (v.nickname.trim() !== saved.nickname) patch.nickname = v.nickname.trim();
  if (v.fav_team !== saved.fav_team) patch.fav_team = v.fav_team || null;
  if (v.fav_driver !== saved.fav_driver) patch.fav_driver = v.fav_driver || null;
  if (v.team_name.trim() !== saved.team_name) patch.team_name = v.team_name.trim() || null;
  const dirty = Object.keys(patch).length > 0;

  const nickErr = patch.nickname !== undefined ? nickProblem(v.nickname) : null;
  const teamErr = patch.team_name !== undefined ? teamNameProblem(v.team_name) : null;

  const save = useMutation({
    mutationFn: () => updateProfile(userId, patch),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['screen'] }), qc.invalidateQueries({ queryKey: ['profile'] })]);
      onSaved();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty && !nickErr && !teamErr && !save.isPending) save.mutate();
  };
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    save.reset();
    setV((x) => ({ ...x, [k]: e.target.value }));
  };

  return (
    <section className={`card rise ${s.col} ${s.wide}`} style={{ ['--i' as string]: 0 }}>
      <h2 className={p.h}>{tr('settings.profile')}</h2>
      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.who}>
          <Avatar nickname={pl.nickname} color={pl.avatar_color} photo={pl.avatar_path} text={pl.avatar_text} size={84} radius={24} fontSize={30} />
          <div style={{ minWidth: 0 }}>
            <div className={s.photoBtns} style={{ marginTop: 0 }}>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={avatar.openPhoto}>
                {tr('settings.uploadPhoto')}
              </button>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={avatar.openLetters}>
                {tr('settings.lettersColor')}
              </button>
              <button
                type="button"
                className={`${b.cta} ${b.sm} ${b.ghost}`}
                disabled={!pl.avatar_path || avatar.removing}
                onClick={() => void avatar.remove()}
              >
                {avatar.removing ? tr('settings.removing') : tr('settings.remove')}
              </button>
            </div>
            <div className="help" style={{ margin: '8px 0 0' }}>
              {tr('settings.photoHint')}
            </div>
            {avatar.removeError && (
              <div className="alert bad" role="alert" style={{ marginTop: 10 }}>
                {avatar.removeError}
              </div>
            )}
          </div>
        </div>

        <div className={s.grid2}>
          <div>
            <label className="lab" htmlFor="set-nick">{tr('settings.nick')}</label>
            <input
              id="set-nick"
              className={`in ${nickErr ? 'err' : ''}`}
              value={v.nickname}
              maxLength={20}
              autoComplete="nickname"
              disabled={!!nextNickAt}
              aria-invalid={!!nickErr}
              aria-describedby="set-nick-help"
              onChange={set('nickname')}
            />
            <div id="set-nick-help" className={`help ${nickErr ? 'err' : ''}`}>
              {nickErr ?? (nextNickAt ? tr('settings.nickNext', { date: dayMonth(nextNickAt) }) : tr('settings.nickHelp'))}
            </div>
          </div>

          <div>
            <label className="lab" htmlFor="set-team-name">{tr('settings.teamName')}</label>
            <input
              id="set-team-name"
              className={`in ${teamErr ? 'err' : ''}`}
              value={v.team_name}
              maxLength={24}
              placeholder={tr('settings.teamNamePlaceholder')}
              aria-invalid={!!teamErr}
              aria-describedby="set-team-help"
              onChange={set('team_name')}
            />
            <div id="set-team-help" className={`help ${teamErr ? 'err' : ''}`}>
              {teamErr ?? tr('settings.teamNameHelp')}
            </div>
          </div>

          <div>
            <label className="lab" htmlFor="set-fav-team">{tr('settings.favTeam')}</label>
            <select id="set-fav-team" className="in" value={v.fav_team} onChange={set('fav_team')}>
              <option value="">{tr('settings.notSelectedF')}</option>
              {(data.options?.teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="help">{tr('settings.shownInProfile')}</div>
          </div>

          <div>
            <label className="lab" htmlFor="set-fav-driver">{tr('settings.favDriver')}</label>
            <select id="set-fav-driver" className="in" value={v.fav_driver} onChange={set('fav_driver')}>
              <option value="">{tr('settings.notSelectedM')}</option>
              {(data.options?.drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {d.team_name}</option>
              ))}
            </select>
            <div className="help">{tr('settings.shownInProfile')}</div>
          </div>
        </div>

        <div>
          <span className="lab">{tr('settings.signIn')}</span>
          <div className={s.signin}>
            {providers.map((x) => (
              <span key={x} className={s.chip}>{tr('settings.via', { provider: x })}</span>
            ))}
            {email && <span className="mute" style={{ fontSize: 14 }}>{email}</span>}
          </div>
        </div>

        {save.error && (
          <div className="alert bad" role="alert">
            {save.error.message}
          </div>
        )}

        <div className={s.actions}>
          <button type="submit" className={`${b.cta} ${b.sm}`} disabled={!dirty || !!nickErr || !!teamErr || save.isPending}>
            {save.isPending ? (
              <>
                <i className={s.spn} aria-hidden="true" />
                {tr('common.saving')}
              </>
            ) : (
              tr('common.save')
            )}
          </button>
          {dirty && (
            <button
              type="button"
              className={`${b.cta} ${b.sm} ${b.ghost}`}
              disabled={save.isPending}
              onClick={() => {
                save.reset();
                setV(saved);
              }}
            >
              {tr('settings.discard')}
            </button>
          )}
          <span className="mute" style={{ fontSize: 13 }} aria-live="polite">
            {dirty ? tr('settings.unsaved') : ''}
          </span>
        </div>
      </form>
      {avatar.element}
    </section>
  );
}
