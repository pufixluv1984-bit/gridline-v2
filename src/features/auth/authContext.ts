import { createContext, useContext } from 'react';
import type { Session } from '@/lib/api/types';

export type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'signed-in'; session: Session }
  | { status: 'signed-out'; session: null }
  /** VITE_SUPABASE_* не заданы — каркас без базы. */
  | { status: 'unconfigured'; session: null };

export const AuthContext = createContext<AuthState>({ status: 'loading', session: null });

/** Сессия пропала сама (истёк токен, вышли на другом устройстве) — окно «Сессия истекла» (макет Overlays). */
export const ExpiredContext = createContext(false);
export function useSessionExpired(): boolean {
  return useContext(ExpiredContext);
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
