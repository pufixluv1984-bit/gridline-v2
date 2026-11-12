import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { t, tn } from '@/i18n';
import { dataUpdatedAt } from '@/lib/api/screens';
import { env } from '@/lib/env';
import { ago } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { IconFlagBold } from './icons';
import s from './Footer.module.css';

// Контакты автора (docs/PRODUCT.md, «Решено ещё»).
const TELEGRAM = 'https://t.me/pufixluv';
const X = 'https://x.com/pufixluv';
const VERSION = 'v0.1';
/** Статическая страница public/privacy.html (её же указываем в Google Auth Platform). */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`;

function Author() {
  return (
    <>
      {tn('footer.madeBy', { name: <b>pufixluv</b> })} ·{' '}
      <a href={TELEGRAM} target="_blank" rel="noreferrer">
        Telegram
      </a>{' '}
      ·{' '}
      <a href={X} target="_blank" rel="noreferrer">
        X
      </a>{' '}
      · {VERSION} · {t('footer.season', { year: 2026 })}
    </>
  );
}

/** Полный футер — на экранах с боковой панелью. Текст про неофициальный проект обязателен (правило 10). */
export function Footer() {
  return (
    <footer className={s.foot}>
      <div className={s.top}>
        <div className={s.brand}>
          <div className={s.logo}>
            <span className={s.mark}>
              <IconFlagBold size={18} />
            </span>
            Gridline
          </div>
          <div className={s.tag}>{t('footer.tagline')}</div>
          <DataFreshness />
        </div>
        <nav className={s.cols} aria-label={t('footer.linksAria')}>
          <div className={s.col}>
            <div className={s.colHead}>{t('footer.game')}</div>
            <Link to="/predict">{t('footer.predict')}</Link>
            <Link to="/league">{t('footer.friends')}</Link>
            <Link to="/rules">{t('footer.scoring')}</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>{t('footer.fantasy')}</div>
            <Link to="/fantasy/squad">{t('footer.squad')}</Link>
            <Link to="/fantasy/market">{t('footer.market')}</Link>
            <Link to="/fantasy">{t('footer.leaderboard')}</Link>
            <Link to="/fantasy/rules">{t('footer.fantasyRules')}</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>{t('footer.calendar')}</div>
            <Link to="/schedule">{t('footer.schedule')}</Link>
            <Link to="/results">{t('footer.results')}</Link>
            <Link to="/tracks">{t('footer.tracks')}</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>{t('footer.project')}</div>
            <Link to="/drivers">{t('footer.drivers')}</Link>
            <Link to="/profile">{t('footer.profile')}</Link>
            <Link to="/lobby/create">{t('footer.createLobby')}</Link>
            <a href={TELEGRAM} target="_blank" rel="noreferrer">
              {t('footer.feedback')}
            </a>
            <a href={PRIVACY_URL}>{t('footer.privacy')}</a>
          </div>
        </nav>
      </div>
      <div className={s.bottom}>
        <p>{t('footer.disclaimer')}</p>
        <p>{t('footer.dataSource')}</p>
        <p className={s.by}>
          <Author />
        </p>
      </div>
    </footer>
  );
}

/** Макет Main: «Данные F1 обновлены N минут назад» — время последней успешной синхронизации. */
function DataFreshness() {
  const q = useQuery({ queryKey: ['data-updated-at'], queryFn: dataUpdatedAt, enabled: env.supabaseConfigured, staleTime: 5 * 60_000 });
  const now = useServerNow();
  if (!q.data) return null;
  return (
    <span className={s.pill}>
      <i aria-hidden="true" />
      {t('footer.dataUpdated', { ago: ago(q.data, now) })}
    </span>
  );
}

/** Тонкий футер — на экранах входа и ошибок. */
export function MiniFooter({ center = false }: { center?: boolean }) {
  return (
    <footer className={`${s.mini} ${center ? s.miniCenter : ''}`}>
      <span>{t('footer.disclaimerShort')}</span>
      <span className={s.miniRight}>
        <span>
          {tn('footer.madeByShort', { name: <b style={{ color: '#b4b4bc', fontWeight: 600 }}>pufixluv</b> })} · {VERSION}
        </span>
        <a href={PRIVACY_URL}>{t('footer.privacyShort')}</a>
        <a href={TELEGRAM} target="_blank" rel="noreferrer">
          {t('footer.reportBug')}
        </a>
      </span>
    </footer>
  );
}
