import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NetworkErrorPage, ScreenBoundary } from '@/features/errors/SystemErrors';
import { Welcome } from '@/features/profile/Welcome';
import { setOffline, useSystemStatus } from '@/lib/systemStatus';
import { useAuth } from '@/features/auth/authContext';
import { getMyProfile, profileKeys, updateProfile, type Profile } from '@/lib/api/profile';
import { useI18n } from '@/i18n';
import { isLocale, takeAnonPick } from '@/i18n/locale';
import { Avatar } from '@/ui/Avatar';
import { Footer } from '@/ui/Footer';
import { Frame } from '@/ui/Frame';
import { Rail } from '@/ui/Rail';

/** Экраны с боковой панелью и полным футером. */
export function AppLayout() {
  const auth = useAuth();
  const userId = auth.session?.user.id;
  const profile = useQuery({
    queryKey: profileKeys.me(userId ?? 'none'),
    queryFn: () => getMyProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const qc = useQueryClient();
  // Язык — из профиля (общий для всех устройств). Профиля без языка или выбор на экране входа — записываем текущий.
  const { locale, setLocale } = useI18n();
  const saved = profile.data?.locale;
  useEffect(() => {
    if (!userId || saved === undefined) return; // undefined — профиль не загружен или в базе ещё нет колонки
    if (saved === null || takeAnonPick()) {
      if (saved !== locale) {
        qc.setQueryData<Profile | null>(profileKeys.me(userId), (pr) => (pr ? { ...pr, locale } : pr));
        void updateProfile(userId, { locale }).catch(() => undefined);
      }
    } else if (isLocale(saved) && saved !== locale) {
      void setLocale(saved);
    }
  }, [userId, saved, locale, setLocale, qc]);

  const net = useSystemStatus();
  const { pathname } = useLocation();
  const retry = () => {
    setOffline(false);
    void qc.refetchQueries({ type: 'active' });
  };

  return (
    <Frame
      rail={
        <Rail
          avatar={
            <Avatar
              nickname={auth.status === 'unconfigured' ? 'DV' : (profile.data?.nickname ?? '')}
              color={profile.data?.avatar_color ?? 'var(--gold)'}
              photo={profile.data?.avatar_path}
              text={profile.data?.avatar_text}
              size={44}
              radius={14}
              fontSize={15}
            />
          }
        />
      }
    >
      {net === 'offline' ? (
        <NetworkErrorPage onRetry={retry} offline={typeof navigator !== 'undefined' && navigator.onLine === false} />
      ) : (
        <ScreenBoundary resetKey={pathname}>
          <Outlet />
        </ScreenBoundary>
      )}
      <Footer />
      {auth.status === 'signed-in' && <Welcome profile={profile.data} />}
    </Frame>
  );
}
