// Время хранится в UTC, показывается в поясе игрока (правило 4). Даты и подписи — на языке сайта.
import { intlLocale, t, type Key } from '@/i18n';

export const userTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

const pad = (n: number) => String(n).padStart(2, '0');

/** Остаток до момента в днях/часах/минутах/секундах (строки с ведущим нулём). */
export function countdownParts(msLeft: number) {
  const ms = Math.max(0, msLeft);
  return {
    d: pad(Math.floor(ms / 864e5)),
    h: pad(Math.floor(ms / 36e5) % 24),
    m: pad(Math.floor(ms / 6e4) % 60),
    s: pad(Math.floor(ms / 1e3) % 60),
    done: ms === 0,
  };
}

/** «сб, 21 ноября, 07:00» в поясе игрока. */
export function formatDateTime(iso: string, timeZone = userTimeZone()): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric', month: 'long', timeZone }).format(d);
  return `${day}, ${formatTime(iso, timeZone)}`;
}

/** «07:00» в поясе игрока. */
export function formatTime(iso: string, timeZone = userTimeZone()): string {
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
}

/** «сб, 21 нояб.» — коротко для строк расписания. */
export function formatDayShort(iso: string, timeZone = userTimeZone()): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(new Date(iso));
}

/** «20–22 нояб.» или «30 нояб. – 2 дек.» по первой и последней сессии этапа. */
export function formatRange(fromIso: string, toIso: string, timeZone = userTimeZone()): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const month = (d: Date) => new Intl.DateTimeFormat(intlLocale(), { month: 'short', timeZone }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', timeZone }).format(d);
  return month(f) === month(t) ? `${day(f)}–${day(t)} ${month(t)}` : `${day(f)} ${month(f)} – ${day(t)} ${month(t)}`;
}

const SESSION_KEYS: Record<string, Key> = {
  fp1: 'session.fp1',
  fp2: 'session.fp2',
  fp3: 'session.fp3',
  sprint_qualy: 'session.sprint_qualy',
  sprint: 'session.sprint',
  qualy: 'session.qualy',
  race: 'session.race',
};
/** Названия сессий на языке сайта: SESSION_NAMES.qualy → «Квалификация» / «Кваліфікація» / «Qualifying». */
export const SESSION_NAMES: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, k) => (typeof k === 'string' && k in SESSION_KEYS ? t(SESSION_KEYS[k]!) : undefined),
});

/** «2 минуты назад», «3 часа назад» — для подписи «данные обновлены». */
export function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 6e4));
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('time.hoursAgo', { n: h });
  const d = Math.round(h / 24);
  return t('time.daysAgo', { n: d });
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Время круга: 71717 мс → «1:11.717», 59001 → «59.001». */
export function lapTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return m ? `${m}:${s.padStart(6, '0')}` : s;
}
