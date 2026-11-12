import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/features/auth/AuthLayout';
import { Frame } from '@/ui/Frame';
import { MiniFooter } from '@/ui/Footer';
import { IconBack } from '@/ui/icons';
import a from '@/features/auth/Auth.module.css';
import s from './NotFound.module.css';
import { t } from '@/i18n';

/** Макет Error-404. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <Frame>
      <div className={s.stage}>
        <div className={`${s.center} rise`}>
          <BrandMark />
          <div className={s.big}>404</div>
          <h1 className={s.title}>{t('err404.title')}</h1>
          <div className="mute" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 440 }}>
            {t('err404.text')}
          </div>
          <div className={s.actions}>
            <Link className={a.cta} to="/" style={{ width: 'auto', padding: '0 32px' }}>
              {t('common.toHome')}
            </Link>
            <button
              type="button"
              className={`${a.cta} ${a.ghost}`}
              style={{ width: 'auto', padding: '0 26px' }}
              onClick={() => navigate(-1)}
            >
              <IconBack size={16} /> {t('common.back')}
            </button>
          </div>
          <div className="num mute" style={{ fontSize: 12, marginTop: 10, letterSpacing: '.06em' }}>
            {t('err404.code', { path: pathname })}
          </div>
        </div>
      </div>
      <MiniFooter />
    </Frame>
  );
}
