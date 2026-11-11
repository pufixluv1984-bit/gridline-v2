import { useState } from 'react';
import { takeAuthError } from '@/lib/api/auth';
import { PRIVACY_URL } from '@/ui/Footer';
import { AuthLayout } from './AuthLayout';
import { ErrorAlert, SocialButtons } from './fields';
import s from './Auth.module.css';

/**
 * Вход. По решению владельца (11.11.2026) только Google и Discord: без паролей, писем и SMTP.
 * Аккаунт и профиль создаются при первом входе (триггер handle_new_user в базе).
 * Макет Auth-Login, без формы почты и пароля.
 */
export default function LoginPage() {
  const [error, setError] = useState<string | null>(() => takeAuthError());

  return (
    <AuthLayout>
      <div>
        <div className="eyebrow">Добро пожаловать</div>
        <h1>Войти в Gridline</h1>
        <div className={s.lead}>
          Входи через Google или Discord. При первом входе аккаунт создастся сам, ник можно будет поменять в профиле.
        </div>
      </div>
      {error && <ErrorAlert title="Не получилось войти">{error}</ErrorAlert>}
      <SocialButtons onError={setError} />
      <div className={s.foot}>
        Пароль не нужен. Входя, ты соглашаешься с{' '}
        <a className={s.lnk} href={PRIVACY_URL}>
          политикой конфиденциальности
        </a>
        .
      </div>
    </AuthLayout>
  );
}
