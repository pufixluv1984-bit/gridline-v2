import { createContext, useContext } from 'react';
import type { Session } from '@/lib/api/types';

export type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'signed-in'; session: Session }
  | { status: 'signed-out'; session: null }
  /** VITE_SUPABASE_* не заданы — каркас без базы. */
  | { status: 'unconfigured'; session: null };

export const AuthContext = createContext<AuthState>({ status: 'loading', session: null });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
