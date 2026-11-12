import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/RequireAuth';
import { SoonPage } from '@/features/home/SoonPage';
import { AppLayout } from './AppLayout';

// Разбивка по маршрутам (правило 11): каждый экран — отдельный чанк.
const HomePage = lazy(() => import('@/features/home/HomePage'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const NotFoundPage = lazy(() => import('@/features/errors/NotFoundPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const CreateLeaguePage = lazy(() => import('@/features/lobby/CreateLeaguePage'));
const InvitePage = lazy(() => import('@/features/lobby/InvitePage'));
const JoinPage = lazy(() => import('@/features/lobby/JoinPage'));
const PredictPage = lazy(() => import('@/features/predict/PredictPage'));
const LeaguePage = lazy(() => import('@/features/league/LeaguePage'));
const LeagueIndexPage = lazy(() => import('@/features/league/LeaguePage').then((m) => ({ default: m.LeagueIndexPage })));
const SchedulePage = lazy(() => import('@/features/schedule/SchedulePage'));
const ResultsPage = lazy(() => import('@/features/results/ResultsPage'));
const TracksPage = lazy(() => import('@/features/schedule/TracksPage'));
const WaitingPage = lazy(() => import('@/features/lobby/WaitingPage'));
const AdminResultsPage = lazy(() => import('@/features/admin/AdminResultsPage'));
const BreakdownPage = lazy(() => import('@/features/breakdown/BreakdownPage'));
const JoinByCodePage = lazy(() => import('@/features/lobby/JoinPage').then((m) => ({ default: m.JoinByCodePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const guest = (el: ReactNode) => <RedirectIfSignedIn>{el}</RedirectIfSignedIn>;

// Разделы следующих фаз — пока заглушки внутри каркаса.
const SOON: { path: string; title: string; phase: number }[] = [
  { path: 'fantasy/*', title: 'Фэнтези-лига', phase: 4 },
];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="auth">
                <Route path="login" element={guest(<LoginPage />)} />
                {/* Регистрации и сброса пароля нет: вход только через Google/Discord. */}
                <Route path="*" element={<Navigate to="/auth/login" replace />} />
              </Route>
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="settings" element={<SettingsPage />} />
                {/* Экран профиля со статистикой — фаза 3; пока аватар в панели ведёт в настройки. */}
                <Route path="profile" element={<Navigate to="/settings" replace />} />
                <Route path="predict" element={<PredictPage />} />
                <Route path="league" element={<LeagueIndexPage />} />
                <Route path="league/:id" element={<LeaguePage />} />
                <Route path="schedule" element={<SchedulePage />} />
                <Route path="results" element={<ResultsPage />} />
                <Route path="results/:ev" element={<ResultsPage />} />
                <Route path="lobby/create" element={<CreateLeaguePage />} />
                <Route path="lobby/join" element={<JoinByCodePage />} />
                <Route path="lobby/:id/invite" element={<InvitePage />} />
                <Route path="lobby/:id/waiting" element={<WaitingPage />} />
                <Route path="tracks" element={<TracksPage />} />
                <Route path="breakdown" element={<BreakdownPage />} />
                <Route path="breakdown/:ev" element={<BreakdownPage />} />
                {/* Правила начисления прогнозов — на экране прогноза (карточки справа). */}
                <Route path="rules" element={<Navigate to="/predict" replace />} />
                <Route path="admin/results" element={<AdminResultsPage />} />
                {SOON.map((r) => (
                  <Route key={r.path} path={r.path} element={<SoonPage title={r.title} phase={r.phase} />} />
                ))}
              </Route>
              {/* Приглашение по ссылке: экран без боковой панели (макет Lobby-Join), но только после входа. */}
              <Route
                path="join/:code"
                element={
                  <RequireAuth>
                    <JoinPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
