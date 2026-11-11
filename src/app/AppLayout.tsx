import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { getMyProfile, profileKeys } from '@/lib/api/profile';
import { Footer } from '@/ui/Footer';
import { Frame } from '@/ui/Frame';
import { Rail } from '@/ui/Rail';

function initialsOf(nick: string | undefined): string {
  if (!nick) return '··';
  const parts = nick.trim().split(/[\s_.-]+/).filter(Boolean);
  const two = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : nick.trim().slice(0, 2);
  return two.toUpperCase();
}

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

  return (
    <Frame rail={<Rail initials={auth.status === 'unconfigured' ? 'DV' : initialsOf(profile.data?.nickname)} />}>
      <Outlet />
      <Footer />
    </Frame>
  );
}
