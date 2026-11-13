import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '@/features/auth/authContext';
import { deleteMyAccount } from '@/lib/api/account';
import { isSiteAdmin } from '@/lib/api/admin';
import { Link } from 'react-router-dom';
import { signOut } from '@/lib/api/auth';
import { getMyProfile, profileKeys, profileScreen } from '@/lib/api/profile';
import { Skeleton } from '@/ui/game';
import { ProfileForm } from './ProfileForm';
import { Toast } from '@/ui/Toast';
import { IconWarn } from '@/ui/icons';
import { Modal } from '@/ui/Modal';
import { Card, Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import p from '@/ui/Page.module.css';
import s from './Settings.module.css';
import { t } from '@/i18n';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { updateProfile, type Profile } from '@/lib/api/profile';
import type { Locale } from '@/i18n/locale';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', discord: 'Discord' };

const IconLogout = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="M16 8l4 4-4 4M20 12H9" />
  </svg>
);

/**
 * «Профиль · Настройки» (макет Settings + окна из Overlays): профиль с сохранением, выход и удаление.
 * Блок «Уведомления» из макета не делается: рассылок на сайте нет (вход только OAuth, писем нет).
 * Настройки лобби — на экране лиги.
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
  const [savedToast, setSavedToast] = useState(false);

  const nickname = profile.data?.nickname ?? '';
  // Поля формы и списки (команды, пилоты) — из экрана профиля: один запрос на экран.
  const screen = useQuery({ queryKey: profileKeys.screen(), queryFn: () => profileScreen(), enabled: !!user });
  const pl = screen.data?.player;
  // Форма пересоздаётся, когда сохранённые значения пришли с сервера (после «Сохранить» или с другой вкладки).
  const formKey = pl ? [pl.nickname, pl.fav_team?.id, pl.fav_driver?.id, screen.data?.fantasy?.team_name].join('|') : '';
  const providers = ((user?.app_metadata?.providers as string[] | undefined) ?? [])
    .filter((x) => x !== 'email')
    .map((x) => PROVIDER_NAMES[x] ?? x);

  // Язык в профиль: сначала кэш (экран пересоздаётся раньше, чем ответит база), потом база.
  const saveLocale = (l: Locale) => {
    if (!user) return;
    qc.setQueryData<Profile | null>(profileKeys.me(user.id), (pr) => (pr ? { ...pr, locale: l } : pr));
    void updateProfile(user.id, { locale: l }).catch(() => undefined);
  };

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
      <PageTitle title={t('settings.title')} sub={t('settings.sub')} />
      <Content>
        <div className={s.row}>
          {screen.data?.player && user ? (
            <ProfileForm
              key={formKey}
              data={screen.data}
              userId={user.id}
              email={user.email}
              providers={providers}
              onSaved={() => setSavedToast(true)}
            />
          ) : (
            <Card i={0} className={`${s.col} ${s.wide}`}>
              <h2 className={p.h}>{t('settings.profile')}</h2>
              {screen.error ? (
                <div className="alert bad" role="alert" style={{ marginTop: 16 }}>{t('settings.loadFailed')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                  <Skeleton h={84} w={84} />
                  <Skeleton h={52} />
                  <Skeleton h={52} />
                </div>
              )}
            </Card>
          )}

          <div className={s.side}>
            <Card i={1}>
              <h2 className={p.h}>{t('lang.title')}</h2>
              <div style={{ marginTop: 16 }}>
                <LanguageSwitch onChange={saveLocale} />
              </div>
              <div className="help" style={{ marginTop: 10 }}>{t('lang.help')}</div>
            </Card>
          {admin.data && (
            <Card i={1} className={s.col}>
              <h2 className={p.h}>{t('settings.admin')}</h2>
              <div className={s.kvr}>
                <div>
                  <div className={s.t}>{t('settings.adminManual')}</div>
                  <div className={s.s}>{t('settings.adminManualSub')}</div>
                </div>
                <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/admin/results">{t('common.open')}</Link>
              </div>
              <div className={s.kvr}>
                <div>
                  <div className={s.t}>{t('adm.errors')}</div>
                  <div className={s.s}>{t('adm.errorsSub')}</div>
                </div>
                <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/admin/errors">{t('common.open')}</Link>
              </div>
            </Card>
          )}
          <Card i={2} className={`${s.col} ${s.danger}`}>
            <h2 className={p.h}>{t('settings.danger')}</h2>
            <div className={s.kvr}>
              <div>
                <div className={s.t}>{t('settings.logout')}</div>
                <div className={s.s}>{t('settings.logoutSub')}</div>
              </div>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => setDialog('logout')}>
                {t('settings.logoutBtn')}
              </button>
            </div>
            <div className={s.kvr}>
              <div>
                <div className={s.t}>{t('settings.delete')}</div>
                <div className={s.s}>{t('settings.deleteSub')}</div>
              </div>
              <button type="button" className={`${b.cta} ${b.sm} ${b.dng}`} onClick={() => setDialog('delete')}>
                {t('settings.deleteBtn')}
              </button>
            </div>
          </Card>
          </div>
        </div>
      </Content>

      {dialog === 'logout' && (
        <Modal
          title={t('settings.logoutConfirm')}
          icon={<IconLogout />}
          onClose={close}
          busy={busy}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button type="button" className={`${b.cta} ${b.sm}`} onClick={doLogout} disabled={busy}>
                {busy ? t('settings.loggingOut') : t('settings.logoutBtn')}
              </button>
            </>
          }
        >
          <p className={m.text}>{t('settings.logoutText')}</p>
        </Modal>
      )}

      {dialog === 'delete' && (
        <Modal
          title={t('settings.deleteConfirm')}
          icon={<IconWarn size={24} />}
          onClose={close}
          busy={busy}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={close} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className={`${b.cta} ${b.sm} ${b.dng}`}
                onClick={doDelete}
                disabled={busy || !nickname || confirm.trim() !== nickname}
              >
                {busy ? t('settings.deleting') : t('settings.deleteForever')}
              </button>
            </>
          }
        >
          <p className={m.text}>
            {t('settings.deleteText')} <b style={{ color: '#fff' }}>{nickname}</b>
          </p>
          <input
            className={s.in}
            type="text"
            placeholder={nickname}
            aria-label={t('settings.deleteNickAria')}
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
      {savedToast && <Toast tone="g" title={t('settings.saved')} onDone={() => setSavedToast(false)} />}
    </>
  );
}
