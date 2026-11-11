import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@/lib/api/types';
import { consumeAuthRedirectParams, getSession, onAuthChange } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { AuthContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    env.supabaseConfigured ? { status: 'loading', session: null } : { status: 'unconfigured', session: null },
  );

  useEffect(() => {
    if (!env.supabaseConfigured) return;
    let alive = true;
    const apply = (session: Session | null) => {
      if (!alive) return;
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out', session: null });
    };
    void getSession().then((s) => {
      // Сначала разбираем адрес (ошибку входа запоминаем для экрана входа), потом показываем экран.
      consumeAuthRedirectParams();
      apply(s);
    });
    const off = onAuthChange((_event, session) => apply(session));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
