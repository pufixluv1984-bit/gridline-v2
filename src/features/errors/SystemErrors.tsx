import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import a from '@/features/auth/Auth.module.css';
import s from './NotFound.module.css';

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
          <div className="eyebrow" style={{ color: '#ff7a70' }}>Нет связи</div>
          <h1 className={s.title} style={{ marginTop: 12 }}>Не удалось загрузить данные</h1>
        </div>
        <div className="mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 460 }}>
          {offline ? 'Похоже, пропал интернет. Как только связь вернётся, данные загрузятся сами.' : 'Сервер не ответил. Проверь интернет или попробуй чуть позже — это не из-за тебя.'}
        </div>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'left', padding: '6px 20px', borderRadius: 22, background: '#0f0f12', border: '1px solid var(--line)' }}>
          <div className="kv"><span>Сайт<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>Gridline</span></span><span className="sbadge g">Работает</span></div>
          <div className="kv">
            <span>{offline ? 'Интернет' : 'База данных'}<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{offline ? 'На этом устройстве' : 'Прогнозы, составы, лобби'}</span></span>
            <span className="sbadge r">{offline ? 'Нет сети' : 'Нет ответа'}</span>
          </div>
          <div className="kv"><span>Данные F1<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>Результаты и календарь</span></span><span className="sbadge y">Ждут связи</span></div>
        </div>
        <div className={s.actions}>
          <button type="button" className={a.cta} style={{ width: 'auto', padding: '0 32px' }} onClick={onRetry}>Повторить</button>
          <Link className={`${a.cta} ${a.ghost}`} to="/" style={{ width: 'auto', padding: '0 26px' }} onClick={onRetry}>На главную</Link>
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
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Ошибка</div>
          <h1 className={s.title} style={{ marginTop: 12 }}>Что-то сломалось на нашей стороне</h1>
        </div>
        <div className="mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 460 }}>Попробуй через минуту. Прогнозы и составы в безопасности.</div>
        <div className={s.actions}>
          <button type="button" className={a.cta} style={{ width: 'auto', padding: '0 32px' }} onClick={onRetry}>Повторить</button>
          <a className={`${a.cta} ${a.ghost}`} href="#/" style={{ width: 'auto', padding: '0 26px' }} onClick={onRetry}>На главную</a>
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
    console.error('Сбой экрана', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <CrashPage onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
