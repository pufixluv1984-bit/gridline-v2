import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { updatePassword } from '@/lib/api/auth';
import { IconLock } from '@/ui/icons';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './authContext';
import { ErrorAlert, PasswordField } from './fields';
import { validatePassword } from './validation';
import s from './Auth.module.css';

/**
 * Новый пароль после перехода по ссылке из письма. Отдельного макета нет —
 * собран из элементов экрана Auth-Reset.
 */
export default function UpdatePasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwErr = touched ? validatePassword(password) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validatePassword(password)) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (auth.status !== 'signed-in') {
    return (
      <AuthLayout centerFooter>
        <div>
          <div className="eyebrow">Восстановление</div>
          <h1>Ссылка устарела</h1>
          <div className={s.lead}>Открой страницу по ссылке из последнего письма или запроси новую.</div>
        </div>
        <Link className={s.cta} to="/auth/reset">
          Запросить новую ссылку
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout centerFooter>
      <span className={s.bigico}>
        <IconLock size={34} />
      </span>
      <div>
        <div className="eyebrow">Восстановление</div>
        <h1>Новый пароль</h1>
        <div className={s.lead}>Придумай новый пароль: минимум 8 символов, буквы и цифры.</div>
      </div>
      {error && <ErrorAlert title={error} />}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} noValidate>
        <PasswordField
          label="Новый пароль"
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={!!pwErr}
        >
          {pwErr && <div className={`${s.help} ${s.helpErr}`}>{pwErr}</div>}
        </PasswordField>
        <button className={s.cta} type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </button>
      </form>
    </AuthLayout>
  );
}
