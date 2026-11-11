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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const guest = (el: ReactNode) => <RedirectIfSignedIn>{el}</RedirectIfSignedIn>;

// Разделы следующих фаз — пока заглушки внутри каркаса.
const SOON: { path: string; title: string; phase: number }[] = [
  { path: 'predict', title: 'Прогноз', phase: 1 },
  { path: 'league', title: 'Лига друзей', phase: 1 },
  { path: 'schedule', title: 'Календарь', phase: 1 },
  { path: 'results', title: 'Результаты', phase: 1 },
  { path: 'lobby/*', title: 'Лобби', phase: 1 },
  { path: 'tracks', title: 'Трассы', phase: 1 },
  { path: 'rules', title: 'Правила', phase: 2 },
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
                {SOON.map((r) => (
                  <Route key={r.path} path={r.path} element={<SoonPage title={r.title} phase={r.phase} />} />
                ))}
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
