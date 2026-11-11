import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthError, signUp } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { IconCheck, IconMail } from '@/ui/icons';
import { AuthLayout } from './AuthLayout';
import { ErrorAlert, Field, PasswordField, SocialButtons } from './fields';
import { PASSWORD_HINT, passwordScore, validateNickname, validatePassword } from './validation';
import s from './Auth.module.css';

export default function RegisterPage() {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const nickErr = touched ? validateNickname(nickname) : null;
  const pwErr = touched ? validatePassword(password) : null;
  const score = passwordScore(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    setEmailTaken(false);
    if (validateNickname(nickname) || validatePassword(password) || !email.includes('@') || !agree) return;
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, nickname.trim());
      if (needsConfirmation) setSentTo(email.trim());
    } catch (err) {
      if (err instanceof AuthError && err.code === 'email_taken') setEmailTaken(true);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <span className={`${s.bigico} ${s.grn}`}>
          <IconMail size={34} />
        </span>
        <div>
          <div className="eyebrow">Почти готово</div>
          <h1>Подтверди почту</h1>
          <div className={s.lead}>
            Мы отправили письмо на <b>{sentTo}</b>. Перейди по ссылке в нём, и аккаунт заработает. Если письма нет —
            загляни в «Спам».
          </div>
        </div>
        <Link className={s.back} to="/auth/login">
          Вернуться ко входу
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <div className="eyebrow">Новый аккаунт</div>
        <h1>Создать аккаунт</h1>
      </div>
      {error && <ErrorAlert title={error} />}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} noValidate>
        <Field
          label="Имя в игре"
          placeholder="Как тебя называть в таблице"
          autoComplete="nickname"
          maxLength={20}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          error={nickErr}
          help="Его увидят друзья в лобби. Можно поменять в профиле."
        />
        <Field
          label="Почта"
          type="email"
          autoComplete="email"
          placeholder="name@mail.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailTaken(false);
          }}
          invalid={emailTaken || (touched && !email.includes('@'))}
          error={
            emailTaken ? (
              <>
                Этот адрес уже зарегистрирован.{' '}
                <Link className={s.lnk} to="/auth/login">
                  Войти
                </Link>
              </>
            ) : null
          }
        />
        <PasswordField
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={!!pwErr}
        >
          <div className={s.pbar} aria-hidden="true">
            <i style={{ transform: `scaleX(${score / 4})` }} />
          </div>
          <div className={`${s.help} ${pwErr ? s.helpErr : ''}`}>{pwErr ?? PASSWORD_HINT[score]}</div>
        </PasswordField>
        <label className={s.chk}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className={s.box} aria-hidden="true">
            <IconCheck size={14} />
          </span>
          <span style={touched && !agree ? { color: 'var(--neg)' } : undefined}>
            Принимаю правила игры и политику конфиденциальности
          </span>
        </label>
        <button className={s.cta} type="submit" disabled={busy || !env.supabaseConfigured}>
          {busy ? 'Создаём…' : 'Создать аккаунт'}
        </button>
      </form>
      <SocialButtons onError={setError} />
      <div className={s.foot}>
        Уже есть аккаунт?{' '}
        <Link className={s.lnk} to="/auth/login">
          Войти
        </Link>
      </div>
    </AuthLayout>
  );
}
