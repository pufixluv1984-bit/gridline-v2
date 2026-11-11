import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthError, signInWithPassword } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { AuthLayout } from './AuthLayout';
import { ErrorAlert, Field, PasswordField, SocialButtons } from './fields';
import s from './Auth.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; text?: string; fields: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
      // Переход на главную сделает RedirectIfSignedIn, когда придёт сессия.
    } catch (err) {
      const a = err instanceof AuthError ? err : new AuthError('Что-то пошло не так. Попробуй ещё раз.', 'unknown');
      setError({
        title: a.message,
        text: a.code === 'invalid_credentials' ? 'Проверь данные и попробуй ещё раз.' : undefined,
        fields: a.code === 'invalid_credentials',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div>
        <div className="eyebrow">Добро пожаловать</div>
        <h1>Войти в Gridline</h1>
      </div>
      {error && <ErrorAlert title={error.title}>{error.text}</ErrorAlert>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} noValidate>
        <Field
          label="Почта"
          type="email"
          autoComplete="email"
          placeholder="name@mail.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={error?.fields}
        />
        <PasswordField
          labelExtra={<Link to="/auth/reset">Забыли пароль?</Link>}
          placeholder="Пароль"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={error?.fields}
        />
        <button className={s.cta} type="submit" disabled={busy || !env.supabaseConfigured || !email || !password}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <SocialButtons onError={(m) => setError({ title: m, fields: false })} />
      <div className={s.foot}>
        Нет аккаунта?{' '}
        <Link className={s.lnk} to="/auth/register">
          Создать
        </Link>
      </div>
    </AuthLayout>
  );
}
