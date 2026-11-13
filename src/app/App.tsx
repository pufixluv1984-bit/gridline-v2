import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isNetworkError, setOffline } from '@/lib/systemStatus';
import { Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/RequireAuth';
import { SoonPage } from '@/features/home/SoonPage';
import { AppLayout } from './AppLayout';
import { I18nProvider } from '@/i18n/I18nProvider';
import { translateDeep } from '@/i18n/db';
import { lazyScreen } from '@/lib/newVersion';

// Разбивка по маршрутам (правило 11): каждый экран — отдельный чанк.
const HomePage = lazyScreen(() => import('@/features/home/HomePage'));
const LoginPage = lazyScreen(() => import('@/features/auth/LoginPage'));
const NotFoundPage = lazyScreen(() => import('@/features/errors/NotFoundPage'));
const SettingsPage = lazyScreen(() => import('@/features/settings/SettingsPage'));
const ProfilePage = lazyScreen(() => import('@/features/profile/ProfilePage'));
const DriversPage = lazyScreen(() => import('@/features/drivers/DriversPage'));
const DriverProfilePage = lazyScreen(() => import('@/features/drivers/DriverProfilePage'));
const FantasyLeaderboard = lazyScreen(() => import('@/features/fantasy/LeaderboardPage'));
const FantasySquad = lazyScreen(() => import('@/features/fantasy/SquadPage'));
const FantasyMarket = lazyScreen(() => import('@/features/fantasy/MarketPage'));
const FantasyResults = lazyScreen(() => import('@/features/fantasy/ResultsPage'));
const FantasyAnalytics = lazyScreen(() => import('@/features/fantasy/AnalyticsPage'));
const FantasyRules = lazyScreen(() => import('@/features/fantasy/RulesPage'));
const CreateLeaguePage = lazyScreen(() => import('@/features/lobby/CreateLeaguePage'));
const InvitePage = lazyScreen(() => import('@/features/lobby/InvitePage'));
const JoinPage = lazyScreen(() => import('@/features/lobby/JoinPage'));
const PredictPage = lazyScreen(() => import('@/features/predict/PredictPage'));
const LeaguePage = lazyScreen(() => import('@/features/league/LeaguePage'));
const LeagueIndexPage = lazyScreen(() => import('@/features/league/LeaguePage').then((m) => ({ default: m.LeagueIndexPage })));
const SchedulePage = lazyScreen(() => import('@/features/schedule/SchedulePage'));
const ResultsPage = lazyScreen(() => import('@/features/results/ResultsPage'));
const TracksPage = lazyScreen(() => import('@/features/schedule/TracksPage'));
const WaitingPage = lazyScreen(() => import('@/features/lobby/WaitingPage'));
const AdminResultsPage = lazyScreen(() => import('@/features/admin/AdminResultsPage'));
const BreakdownPage = lazyScreen(() => import('@/features/breakdown/BreakdownPage'));
const JoinByCodePage = lazyScreen(() => import('@/features/lobby/JoinPage').then((m) => ({ default: m.JoinByCodePage })));

const queryClient = new QueryClient({
  // Сеть пропала или база не отвечает — экран «Нет связи» (макет Error-Network) вместо пустых карточек.
  queryCache: new QueryCache({
    onError: (e) => {
      if (isNetworkError(e)) setOffline(true);
    },
    onSuccess: () => setOffline(false),
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Смена языка: названия из базы в уже загруженных данных переводятся на месте, без повторных запросов.
const retranslateCache = () => {
  for (const q of queryClient.getQueryCache().getAll()) {
    const d = q.state.data;
    const next = translateDeep(d);
    if (next !== d) queryClient.setQueryData(q.queryKey, next);
  }
};

const guest = (el: ReactNode) => <RedirectIfSignedIn>{el}</RedirectIfSignedIn>;

// Разделы следующих фаз — пока заглушки внутри каркаса.
const SOON: { path: string; title: string; phase: number }[] = [
];

export function App() {
  return (
    <I18nProvider onLoaded={retranslateCache}>
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
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/:id" element={<ProfilePage />} />
                <Route path="drivers" element={<DriversPage />} />
                <Route path="drivers/:id" element={<DriverProfilePage />} />
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
                <Route path="fantasy" element={<FantasyLeaderboard />} />
                <Route path="fantasy/squad" element={<FantasySquad />} />
                <Route path="fantasy/market" element={<FantasyMarket />} />
                <Route path="fantasy/results" element={<FantasyResults />} />
                <Route path="fantasy/analytics" element={<FantasyAnalytics />} />
                <Route path="fantasy/rules" element={<FantasyRules />} />
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
    </I18nProvider>
  );
}
