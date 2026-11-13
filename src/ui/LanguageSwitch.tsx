import { t, useI18n } from '@/i18n';
import { LOCALES, type Locale } from '@/i18n/locale';

/**
 * Выбор языка: «УКР · РУ · ENG» (compact — на экране входа и в окне первого входа) или полные названия (в настройках).
 * wide — на всю ширину, кнопки поровну.
 * onChange — дополнительно сохранить выбор в профиль.
 */
export function LanguageSwitch({ compact = false, wide = false, onChange }: { compact?: boolean; wide?: boolean; onChange?: (l: Locale) => void }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className="seg" role="radiogroup" aria-label={t('lang.aria')} style={wide ? { display: 'flex', width: '100%' } : undefined}>
      {LOCALES.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={l.id === locale}
          lang={l.id}
          title={l.label}
          className={l.id === locale ? 'on' : ''}
          style={wide ? { flex: 1 } : undefined}
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
