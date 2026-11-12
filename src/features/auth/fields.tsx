import { useState, type ReactNode } from 'react';
import { signInWithProvider, type OAuthProvider } from '@/lib/api/auth';
import { env } from '@/lib/env';
import { IconWarn } from '@/ui/icons';
import s from './Auth.module.css';
import { t } from '@/i18n';

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

/** Вход только через Google или Discord (решение владельца 11.11.2026, docs/PRODUCT.md). */
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
    <div className={s.socr}>
      <button type="button" className={s.soc} disabled={disabled} onClick={() => go('google')}>
        <b aria-hidden="true">G</b>
        {busy === 'google' ? t('common.opening') : 'Google'}
      </button>
      <button type="button" className={s.soc} disabled={disabled} onClick={() => go('discord')}>
        <b aria-hidden="true">D</b>
        {busy === 'discord' ? t('common.opening') : 'Discord'}
      </button>
    </div>
  );
}
