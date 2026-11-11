import { env } from './env';

/** Ссылка-приглашение в лигу: открывает экран вступления (макет Lobby-Join). */
export const inviteLink = (code: string) => `${env.siteUrl}#/join/${code}`;

/** Код из того, что вставил игрок: сам код, «GRID-XXXXXX» или целая ссылка. */
export function parseInviteCode(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const m = s.match(/([A-HJKMNP-Z2-9]{6})\s*$/);
  return m ? m[1]! : null;
}
