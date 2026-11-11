import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { deleteMyAccount } from '@/lib/api/account';
import { isSiteAdmin } from '@/lib/api/admin';
import { Link } from 'react-router-dom';
import { signOut } from '@/lib/api/auth';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
import { initialsOf } from '@/lib/initials';
import { IconWarn } from '@/ui/icons';
import { Modal } from '@/ui/Modal';
import { Card, Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import p from '@/ui/Page.module.css';
import s from './Settings.module.css';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', discord: 'Discord', email: 'Почта' };

const IconLogout = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="M16 8l4 4-4 4M20 12H9" />
  </svg>
);

/**
 * «Профиль · Настройки» (макет Settings + окна из Overlays). Сейчас только аккаунт:
 * кто вошёл, выход и удаление. Редактирование профиля и настройки лиги — в следующих фазах.
 */
export default function SettingsPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const user = auth.session?.user;
  const profile = useQuery({
    queryKey: profileKeys.me(user?.id ?? 'none'),
    queryFn: () => getMyProfile(user!.id),
    enabled: !!user,
  });

  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isSiteAdmin, staleTime: Infinity, enabled: !!user });
  const [dialog, setDialog] = useState<'logout' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nickname = profile.data?.nickname ?? '';
  const providers = ((user?.app_metadata?.providers as string[] | undefined) ?? [])
    .filter((x) => x !== 'email')
    .map((x) => PROVIDER_NAMES[x] ?? x);

  const close = useCallback(() => {
    setDialog(null);
    setConfirm('');
    setError(null);
  }, []);

  const doLogout = async () => {
    setBusy(true);
    await signOut();
    qc.clear();
    // RequireAuth сам переведёт на экран входа, когда придёт событие выхода.
  };

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      qc.clear();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Профиль" sub="Настройки" />
      <Content>
        <div className={s.row}>
          <Card i={0} className={s.col}>
            <h2 className={p.h}>Аккаунт</h2>
            <div className={s.who}>
              <span className={s.ava} style={{ background: profile.data?.avatar_color ?? 'var(--gold)' }}>
                {initialsOf(nickname)}
              </span>
              <div>
                <div className={s.nick}>{nickname || '…'}</div>
                <div className={s.chips}>
                  {providers.map((x) => (
                    <span key={x} className={s.chip}>
                      Вход через {x}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {admin.data && (
            <Card i={1} className={s.col}>
              <h2 className={p.h}>Админ сайта</h2>
              <div className={s.kvr}>
                <div>
                  <div className={s.t}>Ввести результат вручную</div>
                  <div className={s.s}>Если Jolpica не отдала квалификацию или гонку</div>
                </div>
                <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/admin/results">Открыть</Link>
              </div>
            </Card>
          )}
          <Card i={2} className={`${s.col} ${s.danger}`}>
            <h2 className={p.h}>Опасная зона</h2>
            <div className={s.kvr}>
              <div>
                <div className={s.t}>Выйти из аккаунта</div>
                <div className={s.s}>На этом устройстве. Прогнозы и лиги сохранятся.</div>
              </div>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => setDialog('logout')}>
                Выйти
              </button>
            </div>
            <div className={s.kvr}>
              <div>
                <div className={s.t}>Удалить аккаунт</div>
                <div className={s.s}>Профиль, прогнозы и лиги, где ты один, исчезнут без восстановления</div>
              </div>
              <button type="button" className={`${b.cta} ${b.sm} ${b.dng}`} onClick={() => setDialog('delete')}>
                Удалить
              </button>
            </div>
          </Card>
        </div>
      </Content>

      {dialog === 'logout' && (
        <Modal
          title="Выйти из аккаунта?"
          icon={<IconLogout />}
          onClose={close}
          busy={busy}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={busy}>
                Отмена
              </button>
              <button type="button" className={`${b.cta} ${b.sm}`} onClick={doLogout} disabled={busy}>
                {busy ? 'Выходим…' : 'Выйти'}
              </button>
            </>
          }
        >
          <p className={m.text}>Прогнозы и лиги сохранятся. Чтобы вернуться, войди через Google или Discord.</p>
        </Modal>
      )}

      {dialog === 'delete' && (
        <Modal
          title="Удалить аккаунт?"
          icon={<IconWarn size={24} />}
          onClose={close}
          busy={busy}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={busy}>
                Отмена
              </button>
              <button
                type="button"
                className={`${b.cta} ${b.sm} ${b.dng}`}
                onClick={doDelete}
                disabled={busy || !nickname || confirm.trim() !== nickname}
              >
                {busy ? 'Удаляем…' : 'Удалить навсегда'}
              </button>
            </>
          }
        >
          <p className={m.text}>
            Профиль и прогнозы исчезнут без восстановления. Лиги, где ты владелец и есть другие игроки, нужно сначала
            передать. Чтобы подтвердить, введи свой ник: <b style={{ color: '#fff' }}>{nickname}</b>
          </p>
          <input
            className={s.in}
            type="text"
            placeholder={nickname}
            aria-label="Твой ник для подтверждения"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && (
            <div className={s.err} role="alert">
              {error}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
