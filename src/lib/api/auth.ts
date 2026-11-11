import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { env } from '../env';
import { getSupabase } from '../supabase';

export type OAuthProvider = 'google' | 'discord';

/** Ошибка входа с текстом для игрока. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'email_taken' | 'email_not_confirmed' | 'weak_password' | 'rate_limit' | 'network' | 'unknown',
  ) {
    super(message);
  }
}

function toAuthError(e: { message?: string; code?: string; status?: number } | null | undefined): AuthError {
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return new AuthError('Неверная почта или пароль', 'invalid_credentials');
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return new AuthError('Почта ещё не подтверждена. Открой письмо и перейди по ссылке.', 'email_not_confirmed');
  if (code === 'user_already_exists' || code === 'email_exists')
    return new AuthError('Этот адрес уже зарегистрирован.', 'email_taken');
  if (code === 'weak_password' || msg.includes('password should'))
    return new AuthError('Пароль слишком простой: минимум 8 символов, буквы и цифры.', 'weak_password');
  if (e?.status === 429 || code.includes('rate_limit'))
    return new AuthError('Слишком много попыток. Подожди минуту и попробуй снова.', 'rate_limit');
  if (msg.includes('fetch') || msg.includes('network'))
    return new AuthError('Нет связи с сервером. Проверь интернет.', 'network');
  return new AuthError('Что-то пошло не так. Попробуй ещё раз.', 'unknown');
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw toAuthError(error);
}

/** Регистрация. Ник уходит в метаданные, профиль создаёт триггер в базе. */
export async function signUp(email: string, password: string, nickname: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { nickname }, emailRedirectTo: env.siteUrl },
  });
  if (error) throw toAuthError(error);
  // При включённом подтверждении почты Supabase не сообщает, что адрес занят,
  // а возвращает пользователя без identities.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new AuthError('Этот адрес уже зарегистрирован.', 'email_taken');
  }
  return { needsConfirmation: !data.session };
}

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: env.siteUrl },
  });
  if (error) throw toAuthError(error);
}

export async function sendPasswordReset(email: string): Promise<void> {
  // После перехода по ссылке supabase-js присылает событие PASSWORD_RECOVERY,
  // по нему приложение открывает экран нового пароля.
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: env.siteUrl });
  if (error) throw toAuthError(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw toAuthError(error);
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
