import type { QueryClient } from '@tanstack/react-query';
import { getSupabase } from '../supabase';
import { profileKeys, type Profile } from './profile';

// Корзина и правила доступа — миграция 0020: писать и удалять можно только в папке <user_id>/.
const BUCKET = 'avatars';
const files = (path: string) => [`${path}-256`, `${path}-512`];

export type AvatarState = { avatar_color: string; avatar_path: string | null; avatar_text: string | null };

/** Сеть пропала или сервер не ответил: окно предложит «Повторить». */
export class AvatarNetworkError extends Error {}

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AvatarNetworkError('Нет связи с сервером.');
  if (/fetch|network|load failed|timeout/i.test(msg)) throw new AvatarNetworkError('Нет связи с сервером.');
  throw new Error('Не получилось сохранить аватар. Попробуй ещё раз.');
}

/** Удаляет из своей папки всё, кроме текущего фото (старые и брошенные файлы). Ошибки не мешают сохранению. */
async function sweep(userId: string, keep: string | null) {
  try {
    const sb = getSupabase();
    const { data } = await sb.storage.from(BUCKET).list(userId, { limit: 100 });
    const keepNames = keep ? files(keep).map((f) => f.split('/')[1]) : [];
    const stale = (data ?? []).map((o) => o.name).filter((n) => !keepNames.includes(n));
    if (stale.length) await sb.storage.from(BUCKET).remove(stale.map((n) => `${userId}/${n}`));
  } catch {
    /* следующее сохранение уберёт */
  }
}

/** Кладёт фото 256 и 512 px, записывает путь в профиль, удаляет старое фото. */
export async function saveAvatarPhoto(userId: string, blobs: { s256: Blob; s512: Blob }): Promise<AvatarState['avatar_path']> {
  const sb = getSupabase();
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const path = `${userId}/${stamp}`;
  try {
    for (const [name, blob] of [[`${path}-256`, blobs.s256], [`${path}-512`, blobs.s512]] as const) {
      const { error } = await sb.storage.from(BUCKET).upload(name, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
    }
    const { error } = await sb.from('profiles').update({ avatar_path: path }).eq('id', userId);
    if (error) throw error;
  } catch (e) {
    void sb.storage.from(BUCKET).remove(files(path)).catch(() => undefined);
    fail(e);
  }
  await sweep(userId, path);
  return path;
}

/** «Убрать»: аватар снова из букв, файлы фото удаляются. */
export async function removeAvatarPhoto(userId: string): Promise<void> {
  const { error } = await getSupabase().from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) fail(error);
  await sweep(userId, null);
}

/** «Аватар без фото»: цвет и буквы; фото, если было, убирается. */
export async function saveAvatarLetters(userId: string, color: string, text: string | null): Promise<void> {
  const { error } = await getSupabase().from('profiles').update({ avatar_color: color, avatar_text: text, avatar_path: null }).eq('id', userId);
  if (error) fail(error);
  await sweep(userId, null);
}

/** Удаление аккаунта: файлы фото уходят вместе с ним. */
export async function removeAllAvatarFiles(userId: string): Promise<void> {
  await sweep(userId, null);
}

/**
 * Мгновенно обновляет аватар игрока во всех экранах из кэша (без перезагрузки и без ожидания сервера),
 * затем экраны тихо перезапрашиваются.
 */
export function patchAvatarEverywhere(qc: QueryClient, userId: string, next: AvatarState) {
  qc.setQueryData<Profile | null>(profileKeys.me(userId), (p) => (p ? { ...p, ...next } : p));
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) as Record<string, unknown>;
      if ('avatar_color' in o && (o.user_id === userId || o.id === userId)) Object.assign(o, next);
      return o;
    }
    return v;
  };
  for (const q of qc.getQueryCache().findAll({ queryKey: ['screen'] })) {
    if (q.state.data !== undefined) qc.setQueryData(q.queryKey, walk(q.state.data));
  }
  void qc.invalidateQueries({ queryKey: ['screen'] });
  void qc.invalidateQueries({ queryKey: ['profile'] });
}
