import type { ReactNode } from 'react';
import { PillLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import { t } from '@/i18n';

/** Панель фэнтези-экранов (макеты Fantasy-*): главная кнопка слева, вкладки разделов. */
export function FantasyTabs({ action, extra }: { action?: ReactNode; extra?: ReactNode }) {
  return (
    <Toolbar>
      {action}
      {action && <ToolbarDivider />}
      <PillLink to="/fantasy/squad">{t('fan.tab.squad')}</PillLink>
      <PillLink to="/fantasy" end>{t('fan.tab.board')}</PillLink>
      <PillLink to="/fantasy/market">{t('fan.tab.market')}</PillLink>
      <PillLink to="/fantasy/results">{t('fan.tab.results')}</PillLink>
      <PillLink to="/fantasy/analytics">{t('fan.tab.analytics')}</PillLink>
      <PillLink to="/fantasy/rules">{t('fan.tab.rules')}</PillLink>
      {extra}
    </Toolbar>
  );
}

export const IconCheckSm = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
export const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconSwap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 7h11l-3-3M17 17H6l3 3" />
  </svg>
);
