// Фото профиля: проверка файла, кадрирование и сжатие в браузере, адрес картинки.
// Хранение — корзина Supabase Storage `avatars` (миграция 0020): <user_id>/<stamp>-256 и -512.
import { env } from './env';
import { intlLocale, t } from '@/i18n';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIN_SIDE = 256;
export const AVATAR_SIZES = [256, 512] as const;
export const AVATAR_COLORS = ['#ffd400', '#e8211a', '#ff8000', '#27f4d2', '#3671c6', '#b66dff', '#ff87bc', '#7fe0a0'];

/** Публичный адрес фото. path проверен базой (`<uuid>/[A-Za-z0-9_-]+`), но всё равно кодируем. */
export function avatarUrl(path: string, size: 256 | 512): string {
  const safe = path.split('/').map(encodeURIComponent).join('/');
  return `${env.supabaseUrl}/storage/v1/object/public/avatars/${safe}-${size}`;
}

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

/** Тип картинки по первым байтам (не по расширению и не по file.type). SVG и всё прочее — null. GIF — анимированная аватарка. */
export function sniffImage(head: Uint8Array): ImageKind | null {
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'png';
  const ascii = (from: number, s: string) => [...s].every((c, i) => b(from + i) === c.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'gif';
  return null;
}

export function formatMb(bytes: number): string {
  return t('avatar.mb', { n: (bytes / 1024 / 1024).toLocaleString(intlLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) });
}

export type FileProblem =
  | { kind: 'too_big'; size: number }
  | { kind: 'format' }
  | { kind: 'too_small'; width: number; height: number }
  | { kind: 'broken' };

export function problemText(p: FileProblem): { title: string; text: string } {
  switch (p.kind) {
    case 'too_big':
      return { title: t('avatar.tooBig'), text: t('avatar.tooBigText', { size: formatMb(p.size) }) };
    case 'format':
      return { title: t('avatar.format'), text: t('avatar.formatText') };
    case 'too_small':
      return { title: t('avatar.tooSmall'), text: t('avatar.tooSmallText', { w: p.width, h: p.height }) };
    case 'broken':
      return { title: t('avatar.broken'), text: t('avatar.brokenText') };
  }
}

/** Размер кадра: фото вписано так, чтобы закрывать рамку целиком при zoom = 1. */
export type CropView = { box: number; zoom: number; x: number; y: number };

/** Минимальный масштаб, при котором картинка закрывает квадратную рамку box. */
export function coverScale(w: number, h: number, box: number): number {
  return box / Math.min(w, h);
}

/** Сдвиг x/y (центр фото относительно центра рамки, в px экрана) не даёт рамке выйти за край фото. */
export function clampOffset(w: number, h: number, v: CropView): { x: number; y: number } {
  const k = coverScale(w, h, v.box) * v.zoom;
  const mx = Math.max(0, (w * k - v.box) / 2);
  const my = Math.max(0, (h * k - v.box) / 2);
  return { x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
}

/** Квадрат исходного фото (в его пикселях), который виден в рамке. */
export function cropRect(w: number, h: number, v: CropView): { sx: number; sy: number; side: number } {
  const k = coverScale(w, h, v.box) * v.zoom;
  const { x, y } = clampOffset(w, h, v);
  const side = v.box / k;
  return { sx: w / 2 - x / k - side / 2, sy: h / 2 - y / k - side / 2, side };
}

/** Квадрат фото в WebP (если браузер умеет) или JPEG. */
export async function renderAvatar(img: CanvasImageSource, rect: { sx: number; sy: number; side: number }, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, rect.sx, rect.sy, rect.side, rect.side, 0, 0, size, size);
  const toBlob = (type: string) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.86));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg');
  if (!jpeg) throw new Error('encode');
  return jpeg;
}

/** Буквы аватара без фото: до двух букв или цифр. */
export function cleanLetters(raw: string): string {
  return [...raw.replace(/[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9]/g, '')].slice(0, 2).join('').toUpperCase();
}

/** Поля аватара из строки ответа экрана: `<Avatar {...avatarOf(row)} />`. */
export function avatarOf(p: { nickname: string; avatar_color: string; avatar_path?: string | null; avatar_text?: string | null }) {
  return { nickname: p.nickname, color: p.avatar_color, photo: p.avatar_path, text: p.avatar_text };
}
