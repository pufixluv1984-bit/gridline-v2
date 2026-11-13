import { lazy, Suspense } from 'react';
import type { Profile } from '@/lib/api/profile';

const WelcomeWindow = lazy(() => import('./WelcomeWindow'));

/**
 * «Добро пожаловать» (макет Overlays, расширенный): при первом входе — аватар, ник, язык, любимые команда и пилот.
 * Можно пропустить; окно показывается один раз на аккаунт (profiles.setup_done_at, миграция 0025),
 * только новым игрокам. Пока миграции нет (поля нет в профиле), окно не показывается.
 */
export function Welcome({ profile }: { profile: Profile | null | undefined }) {
  const show = !!profile && profile.setup_done_at === null;
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <WelcomeWindow profile={profile} />
    </Suspense>
  );
}

