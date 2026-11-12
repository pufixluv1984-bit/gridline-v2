import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@/lib/api/types';
import { consumeAuthRedirectParams, getSession, onAuthChange, signedOutByUser } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { AuthContext, ExpiredContext, type AuthState } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    env.supabaseConfigured ? { status: 'loading', session: null } : { status: 'unconfigured', session: null },
  );

  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!env.supabaseConfigured) return;
    let alive = true;
    let hadSession = false;
    const apply = (session: Session | null) => {
      if (!alive) return;
      if (session) hadSession = true;
      else if (hadSession && !signedOutByUser()) setExpired(true);
      if (session) setExpired(false);
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

  return (
    <AuthContext.Provider value={state}>
      <ExpiredContext.Provider value={expired}>{children}</ExpiredContext.Provider>
    </AuthContext.Provider>
  );
}
