import { t, useI18n } from '@/i18n';
import { LOCALES, type Locale } from '@/i18n/locale';

/**
 * Выбор языка: «UA · RU · EN» (compact — на экране входа) или полные названия (в настройках).
 * onChange — дополнительно сохранить выбор в профиль.
 */
export function LanguageSwitch({ compact = false, onChange }: { compact?: boolean; onChange?: (l: Locale) => void }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className="seg" role="radiogroup" aria-label={t('lang.aria')}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={l.id === locale}
          lang={l.id}
          title={l.label}
          className={l.id === locale ? 'on' : ''}
          onClick={() => {
            onChange?.(l.id);
            void setLocale(l.id);
          }}
        >
          {compact ? l.short : l.label}
        </button>
      ))}
    </div>
  );
}
