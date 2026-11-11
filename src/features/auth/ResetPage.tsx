import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordReset } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { IconBack, IconClock, IconLock, IconMail } from '@/ui/icons';
import { AuthLayout } from './AuthLayout';
import { ErrorAlert, Field } from './fields';
import s from './Auth.module.css';

const RESEND_SECONDS = 60;

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout centerFooter>
        <span className={`${s.bigico} ${s.grn}`}>
          <IconMail size={34} />
        </span>
        <div>
          <div className="eyebrow">Готово</div>
          <h1>Проверь почту</h1>
          <div className={s.lead}>
            Мы отправили ссылку на <b>{email.trim()}</b>. Если письма нет — загляни в «Спам».
          </div>
        </div>
        {error && <ErrorAlert title={error} />}
        <div className={`${s.alert} ${s.info}`}>
          <IconClock size={20} />
          <div>Новое письмо можно запросить через {RESEND_SECONDS} секунд.</div>
        </div>
        <button className={`${s.cta} ${s.ghost}`} type="button" disabled={wait > 0 || busy} onClick={() => send()}>
          {wait > 0 ? `Отправить ещё раз через ${wait} с` : 'Отправить ещё раз'}
        </button>
        <Link className={s.back} to="/auth/login">
          Вернуться ко входу
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
        <h1>Сбросить пароль</h1>
        <div className={s.lead}>Введи почту — пришлём ссылку для нового пароля.</div>
      </div>
      {error && <ErrorAlert title={error} />}
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} noValidate>
        <Field
          label="Почта"
          type="email"
          autoComplete="email"
          placeholder="name@mail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className={s.cta} type="submit" disabled={busy || !env.supabaseConfigured || !email.includes('@')}>
          {busy ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      </form>
      <Link className={s.back} to="/auth/login">
        <IconBack size={16} /> Назад ко входу
      </Link>
    </AuthLayout>
  );
}
