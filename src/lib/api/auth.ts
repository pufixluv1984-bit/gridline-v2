import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { env } from '../env';
import { getSupabase } from '../supabase';
import { t } from '@/i18n';

// Вход только через Google и Discord (решение владельца 11.11.2026): паролей и писем нет.
export type OAuthProvider = 'google' | 'discord';

const AUTH_ERROR_KEY = 'gridline:auth-error';

function friendlyError(e: { message?: string; status?: number } | null | undefined): Error {
  const msg = (e?.message ?? '').toLowerCase();
  if (e?.status === 429) return new Error(t('auth.tooMany'));
  if (msg.includes('fetch') || msg.includes('network')) return new Error(t('auth.noConnection'));
  return new Error(t('common.somethingWrong'));
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: env.siteUrl },
  });
  if (error) throw friendlyError(error);
}

// Выход по кнопке — не «сессия истекла»: окно истёкшей сессии показываем только при неожиданном выходе.
let userSignedOut = false;
export const signedOutByUser = () => userSignedOut;
/** Выход по действию игрока (кнопка «Выйти», удаление аккаунта). */
export const markSignedOutByUser = () => {
  userSignedOut = true;
};

export async function signOut(): Promise<void> {
  userSignedOut = true;
  await getSupabase().auth.signOut();
}

/**
 * Разбирает адрес после возврата от Google/Discord: убирает ?code=… и ?error=…,
 * а текст ошибки (если провайдер или Supabase её вернули) запоминает для экрана входа.
 */
export function consumeAuthRedirectParams(): void {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  if (!p.has('code') && !p.has('error')) return;
  const description = p.get('error_description');
  if (p.has('error')) {
    try {
      sessionStorage.setItem(AUTH_ERROR_KEY, description || t('auth.providerRejected'));
    } catch {
      /* хранилище недоступно — просто не покажем текст */
    }
  }
  for (const k of ['code', 'error', 'error_code', 'error_description']) p.delete(k);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** Текст ошибки входа из прошлого редиректа (читается один раз). */
export function takeAuthError(): string | null {
  try {
    const v = sessionStorage.getItem(AUTH_ERROR_KEY);
    if (v) sessionStorage.removeItem(AUTH_ERROR_KEY);
    return v;
  } catch {
    return null;
  }
}
