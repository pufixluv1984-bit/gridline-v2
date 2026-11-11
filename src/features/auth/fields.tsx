import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { signInWithProvider, type OAuthProvider } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { IconEye, IconWarn } from '@/ui/icons';
import s from './Auth.module.css';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  labelExtra?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  invalid?: boolean;
};

export function Field({ label, labelExtra, help, error, invalid, className, ...input }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <label className={s.lab} htmlFor={id}>
        {label}
        {labelExtra}
      </label>
      <input
        id={id}
        className={`${s.in} ${invalid || error ? s.err : ''} ${className ?? ''}`}
        aria-invalid={invalid || !!error || undefined}
        aria-describedby={help || error ? helpId : undefined}
        {...input}
      />
      {error ? (
        <div id={helpId} className={`${s.help} ${s.helpErr}`}>
          {error}
        </div>
      ) : help ? (
        <div id={helpId} className={s.help}>
          {help}
        </div>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label = 'Пароль',
  labelExtra,
  children,
  invalid,
  ...input
}: Omit<FieldProps, 'type' | 'label'> & { label?: string; children?: ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={s.lab} htmlFor={id}>
        {label}
        {labelExtra}
      </label>
      <div className={s.inw}>
        <input
          id={id}
          className={`${s.in} ${invalid ? s.err : ''}`}
          type={show ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          {...input}
        />
        <button
          type="button"
          className={`${s.eye} ${show ? s.eyeOn : ''}`}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={show}
          onClick={() => setShow((v) => !v)}
        >
          <IconEye size={20} />
        </button>
      </div>
      {children}
    </div>
  );
}

export function ErrorAlert({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={`${s.alert} ${s.bad}`} role="alert">
      <IconWarn size={20} />
      <div>
        <b>{title}</b>
        {children && <div style={{ marginTop: 3, color: '#ff9c94' }}>{children}</div>}
      </div>
    </div>
  );
}

/** Вход через Google или Discord (docs/PRODUCT.md, «Решено владельцем»). */
export function SocialButtons({ onError }: { onError: (msg: string) => void }) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const go = async (p: OAuthProvider) => {
    setBusy(p);
    try {
      await signInWithProvider(p); // дальше браузер уходит на страницу провайдера
    } catch (e) {
      onError((e as Error).message);
      setBusy(null);
    }
  };
  const disabled = !env.supabaseConfigured || busy !== null;
  return (
    <>
      <div className={s.or}>или</div>
      <div className={s.socr}>
        <button type="button" className={s.soc} disabled={disabled} onClick={() => go('google')}>
          <b aria-hidden="true">G</b>Google
        </button>
        <button type="button" className={s.soc} disabled={disabled} onClick={() => go('discord')}>
          <b aria-hidden="true">D</b>Discord
        </button>
      </div>
    </>
  );
}
