import type { CSSProperties, ReactNode } from 'react';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { env } from '@/lib/env';
import { Frame } from '@/ui/Frame';
import { MiniFooter } from '@/ui/Footer';
import { IconFlag, IconGrid, IconTarget, IconUsers, IconWarn } from '@/ui/icons';
import s from './Auth.module.css';
import { t } from '@/i18n';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { markAnonPick } from '@/i18n/locale';

// Логотипы команд на фоне левой панели: позиции, размеры и прозрачность из макета Auth-Login.
const LOGOS: { team: TeamCode; style: CSSProperties }[] = [
  { team: 'RBR', style: { left: '72%', top: '50%', width: 400, height: 400, transform: 'translate(-50%,-50%) rotate(-10deg)', opacity: 0.22 } },
  { team: 'ALP', style: { left: '50%', top: '8%', transform: 'translate(-50%,-50%) rotate(-18deg)' } },
  { team: 'MER', style: { left: '84%', top: '9%', transform: 'translate(-50%,-50%) rotate(12deg)' } },
  { team: 'CAD', style: { left: '66%', top: '19%', transform: 'translate(-50%,-50%) rotate(-6deg)' } },
  { team: 'FER', style: { left: '35%', top: '38%', transform: 'translate(-50%,-50%) rotate(20deg)' } },
  { team: 'AST', style: { left: '33%', top: '62%', transform: 'translate(-50%,-50%) rotate(-14deg)' } },
  { team: 'RB', style: { left: '60%', top: '90%', transform: 'translate(-50%,-50%) rotate(8deg)' } },
  { team: 'AUD', style: { left: '88%', top: '88%', transform: 'translate(-50%,-50%) rotate(-22deg)' } },
];
const SMALL: CSSProperties = { width: 120, height: 120, opacity: 0.14 };

export function BrandMark() {
  return (
    <div className={s.bl}>
      <span className={s.bmark}>
        <IconGrid />
      </span>
      Gridline
    </div>
  );
}

function BrandPanel() {
  return (
    <div className={s.brandp}>
      <div className={s.logos} aria-hidden="true">
        {LOGOS.map(({ team, style }) => {
          const src = teamLogo(team);
          return src ? <img key={team} src={src} alt="" decoding="async" style={{ ...SMALL, ...style }} /> : null;
        })}
      </div>
      <BrandMark />
      <h2 className={s.bh}>
        {t('auth.heroA')} <em>{t('auth.heroF1')}</em> {t('auth.heroB')}
      </h2>
      <div className={s.bf}>
        <div>
          <i>
            <IconTarget size={16} />
          </i>
          {t('auth.feature1')}
        </div>
        <div>
          <i>
            <IconUsers size={16} />
          </i>
          {t('auth.feature2')}
        </div>
        <div>
          <i>
            <IconFlag size={16} />
          </i>
          {t('auth.feature3')}
        </div>
      </div>
    </div>
  );
}

/** Предупреждение для разработки: без VITE_SUPABASE_* вход не работает. */
function NotConfigured() {
  if (env.supabaseConfigured) return null;
  return (
    <div className={`${s.alert} ${s.info}`} role="status">
      <IconWarn size={20} />
      <div>
        {t('auth.notConfigured')}
      </div>
    </div>
  );
}

export function AuthLayout({ children, centerFooter = false }: { children: ReactNode; centerFooter?: boolean }) {
  return (
    <Frame boxed>
      <div className={s.stage}>
        <BrandPanel />
        <div className={s.fside}>
          <div className={s.lang}>
            <LanguageSwitch compact onChange={markAnonPick} />
          </div>
          <div className={`${s.fcard} rise`}>
            <NotConfigured />
            {children}
          </div>
        </div>
      </div>
      <MiniFooter center={centerFooter} />
    </Frame>
  );
}
