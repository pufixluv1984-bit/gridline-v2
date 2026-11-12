// Погода уик-энда: коды WMO (Open-Meteo) → значок и подпись по-русски.
// Значки — символы Юникода, без картинок (в макете — контурные иконки погоды).
import { intlLocale, t } from '@/i18n';

export function weatherIcon(code: number | null): string {
  if (code == null) return '·';
  if (code === 0) return '☀';
  if (code <= 2) return '⛅';
  if (code === 3 || code === 45 || code === 48) return '☁';
  if (code >= 95) return '⛈';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄';
  return '☂';
}

export function weatherText(code: number | null): string {
  if (code == null) return t('weather.none');
  if (code === 0) return t('weather.clear');
  if (code <= 2) return t('weather.partly');
  if (code === 3) return t('weather.overcast');
  if (code === 45 || code === 48) return t('weather.fog');
  if (code >= 95) return t('weather.storm');
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return t('weather.snow');
  if (code >= 51 && code <= 67) return t('weather.rain');
  if (code >= 80 && code <= 82) return t('weather.shower');
  return t('weather.precip');
}

/** «Пт», «Сб», «Вс» для даты YYYY-MM-DD (день по UTC, как отдаёт Open-Meteo). */
export function weekday(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  const s = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', timeZone: 'UTC' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
