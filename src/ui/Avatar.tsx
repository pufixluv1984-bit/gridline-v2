import { useState, type CSSProperties } from 'react';
import { avatarUrl } from '@/lib/avatar';
import { initialsOf } from '@/lib/initials';

export type AvatarProps = {
  nickname: string;
  color: string;
  /** profiles.avatar_path: есть — показываем фото, нет — плитку с цветом и буквами. */
  photo?: string | null;
  /** Свои буквы (до двух); по умолчанию — первые буквы ника. */
  text?: string | null;
  size?: number;
  radius?: number | string;
  fontSize?: number;
  className?: string;
  style?: CSSProperties;
};

/** Аватар игрока — один на весь сайт. Текст выводится через React (экранируется), путь фото — через encodeURIComponent. */
export function Avatar({ nickname, color, photo, text, size = 36, radius, fontSize, className = '', style }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = photo && broken !== photo ? avatarUrl(photo, size > 100 ? 512 : 256) : null;
  return (
    <span
      className={`ava ${className}`}
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: fontSize ?? size * 0.34,
        overflow: 'hidden',
        ...(radius !== undefined ? { borderRadius: radius } : {}),
        ...style,
      }}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setBroken(photo!)}
        />
      ) : (
        text || initialsOf(nickname)
      )}
    </span>
  );
}
