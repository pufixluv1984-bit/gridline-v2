import { useState } from 'react';
import { takeAuthError } from '@/lib/api/auth';
import { PRIVACY_URL } from '@/ui/Footer';
import { AuthLayout } from './AuthLayout';
import { ErrorAlert, SocialButtons } from './fields';
import s from './Auth.module.css';
import { t } from '@/i18n';

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
        <div className="eyebrow">{t('auth.welcome')}</div>
        <h1>{t('auth.title')}</h1>
        <div className={s.lead}>
          {t('auth.lead')}
        </div>
      </div>
      {error && <ErrorAlert title={t('auth.failed')}>{error}</ErrorAlert>}
      <SocialButtons onError={setError} />
      <div className={s.foot}>
        {t('auth.consent')}{' '}
        <a className={s.lnk} href={PRIVACY_URL}>
          {t('auth.consentLink')}
        </a>
        .
      </div>
    </AuthLayout>
  );
}
