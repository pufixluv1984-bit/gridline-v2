import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import a from '@/features/auth/Auth.module.css';
import s from './NotFound.module.css';
import { t } from '@/i18n';
import { isStaleChunkError, reloadForNewVersion } from '@/lib/newVersion';

const IconWifiOff = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19" r=".8" />
  </svg>
);
const IconBolt = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 3 4 14h7l-1 7 9-11h-7z" />
  </svg>
);

/** Макет Error-Network: «Нет связи — не удалось загрузить данные», статусы сервисов, «Повторить». */
export function NetworkErrorPage({ onRetry, offline }: { onRetry: () => void; offline: boolean }) {
  return (
    <div className={s.stage} style={{ minHeight: 640 }} role="alert">
      <div className={`${s.center} rise`}>
        <span className="bigico red"><IconWifiOff /></span>
        <div>
          <div className="eyebrow" style={{ color: '#ff7a70' }}>{t('errNet.eyebrow')}</div>
          <h1 className={s.title} style={{ marginTop: 12 }}>{t('errNet.title')}</h1>
        </div>
        <div className="mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 460 }}>
          {offline ? t('errNet.offline') : t('errNet.server')}
        </div>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'left', padding: '6px 20px', borderRadius: 22, background: '#0f0f12', border: '1px solid var(--line)' }}>
          <div className="kv"><span>{t('errNet.site')}<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>Gridline</span></span><span className="sbadge g">{t('errNet.works')}</span></div>
          <div className="kv">
            <span>{offline ? t('errNet.internet') : t('errNet.database')}<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{offline ? t('errNet.thisDevice') : t('errNet.databaseSub')}</span></span>
            <span className="sbadge r">{offline ? t('errNet.noNetwork') : t('errNet.noAnswer')}</span>
          </div>
          <div className="kv"><span>{t('errNet.f1data')}<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{t('errNet.f1dataSub')}</span></span><span className="sbadge y">{t('errNet.waiting')}</span></div>
        </div>
        <div className={s.actions}>
          <button type="button" className={a.cta} style={{ width: 'auto', padding: '0 32px' }} onClick={onRetry}>{t('common.retry')}</button>
          <Link className={`${a.cta} ${a.ghost}`} to="/" style={{ width: 'auto', padding: '0 26px' }} onClick={onRetry}>{t('common.toHome')}</Link>
        </div>
      </div>
    </div>
  );
}

/** Макет Error-States: «Ошибка сервера — что-то сломалось на нашей стороне». */
export function CrashPage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={s.stage} style={{ minHeight: 640 }} role="alert">
      <div className={`${s.center} rise`}>
        <span className="bigico yel"><IconBolt /></span>
        <div>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>{t('errCrash.eyebrow')}</div>
          <h1 className={s.title} style={{ marginTop: 12 }}>{t('errCrash.title')}</h1>
        </div>
        <div className="mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 460 }}>{t('errCrash.text')}</div>
        <div className={s.actions}>
          <button type="button" className={a.cta} style={{ width: 'auto', padding: '0 32px' }} onClick={onRetry}>{t('common.retry')}</button>
          <a className={`${a.cta} ${a.ghost}`} href="#/" style={{ width: 'auto', padding: '0 26px' }} onClick={onRetry}>{t('common.toHome')}</a>
        </div>
      </div>
    </div>
  );
}

/** Ловит сбой отрисовки экрана: вместо белой страницы — экран ошибки с «Повторить». */
export class ScreenBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    // Переход на другой экран сбрасывает ошибку.
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Сайт обновился, пока вкладка была открыта: файла экрана старой версии уже нет — берём новую версию.
    if (isStaleChunkError(error) && reloadForNewVersion()) return;
    console.error('Screen crash', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <CrashPage onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
