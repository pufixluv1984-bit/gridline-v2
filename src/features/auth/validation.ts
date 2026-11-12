import { t } from '@/i18n';
// Те же ограничения, что и в базе (check в миграции 0001). Интерфейс только подсказывает,
// окончательно проверяет база (правило 1).
export const NICKNAME_RE = /^[A-Za-zА-Яа-яЁё0-9 _.-]{2,20}$/;

export function validateNickname(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 2) return t('nick.min');
  if (v.length > 20) return t('nick.max');
  if (!NICKNAME_RE.test(v)) return t('nick.chars');
  return null;
}
