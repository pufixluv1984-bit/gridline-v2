// Те же ограничения, что и в базе (check в миграции 0001). Интерфейс только подсказывает,
// окончательно проверяет база (правило 1).
export const NICKNAME_RE = /^[A-Za-zА-Яа-яЁё0-9 _.-]{2,20}$/;

export function validateNickname(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 2) return 'Минимум 2 символа.';
  if (v.length > 20) return 'Не длиннее 20 символов.';
  if (!NICKNAME_RE.test(v)) return 'Только буквы, цифры, пробел, точка, дефис и подчёркивание.';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Минимум 8 символов.';
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw) || !/\d/.test(pw)) return 'Нужны и буквы, и цифры.';
  return null;
}

/** Оценка надёжности пароля для полоски на экране регистрации: 0…4. */
export function passwordScore(pw: string): number {
  if (pw.length < 8) return pw.length === 0 ? 0 : 1;
  let score = 1;
  if (/[a-zа-яё]/i.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-zа-яё\d]/i.test(pw)) score++;
  if (pw.length >= 12) score++;
  return Math.min(score, 4);
}

export const PASSWORD_HINT: Record<number, string> = {
  0: 'Минимум 8 символов, буквы и цифры.',
  1: 'Надёжность: слабая. Нужно минимум 8 символов, буквы и цифры.',
  2: 'Надёжность: средняя. Добавь символ или сделай длиннее.',
  3: 'Надёжность: хорошая. Сделай от 12 символов — будет отлично.',
  4: 'Надёжность: отличная.',
};
