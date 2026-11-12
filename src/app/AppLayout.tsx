import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation } from 'react-router-dom';
import { NetworkErrorPage, ScreenBoundary } from '@/features/errors/SystemErrors';
import { Welcome } from '@/features/profile/Welcome';
import { setOffline, useSystemStatus } from '@/lib/systemStatus';
import { useAuth } from '@/features/auth/authContext';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
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

  const net = useSystemStatus();
  const qc = useQueryClient();
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
