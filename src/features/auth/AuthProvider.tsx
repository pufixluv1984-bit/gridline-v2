import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@/lib/api/types';
import { getSession, onAuthChange } from '@/lib/api/auth';
import { env } from '@/lib/env';

import { AuthContext, type AuthState } from './authContext';

/** Убираем ?code=… из адреса после входа через Google/Discord или по ссылке из письма. */
function cleanAuthParams() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return;
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

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
      apply(s);
      cleanAuthParams();
    });
    const off = onAuthChange((event, session) => {
      apply(session);
      if (event === 'PASSWORD_RECOVERY') window.location.hash = '#/auth/update-password';
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
