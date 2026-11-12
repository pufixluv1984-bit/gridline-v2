// Общие игровые элементы экранов: таймер, плитка пилота, аватар игрока.
import type { CSSProperties } from 'react';
import { driverPhoto, teamLogo, type TeamCode } from '@/lib/assets';
import { countdownParts } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';

/** Таймер «ставки закроются через…» от серверного времени. */
export function Countdown({ to, small = false, seconds = true }: { to: string; small?: boolean; seconds?: boolean }) {
  const now = useServerNow();
  const c = countdownParts(Date.parse(to) - now);
  const cells: [string, string][] = [
    [c.d, small ? 'ДН' : 'ДНЕЙ'],
    [c.h, small ? 'ЧАС' : 'ЧАСОВ'],
    [c.m, 'МИН'],
  ];
  if (seconds) cells.push([c.s, 'СЕК']);
  return (
    <div className={`tcells ${small ? 'sm' : ''}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} role="timer" aria-label="До закрытия приёма прогнозов">
      {cells.map(([v, l], i) => (
        <div key={l} className={`tcell ${i === cells.length - 1 && !c.done ? 'live' : ''}`}>
          <b>{v}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

type DriverLike = { code: string; number: number | null; color: string; team_code: string; name?: string };

/** Плитка пилота: фото из набора владельца или номер (монограмма), логотип команды на фоне. */
export function DriverTile({
  driver,
  size = 72,
  className = '',
}: {
  driver: DriverLike | null;
  size?: number;
  className?: string;
}) {
  if (!driver) {
    return (
      <div className={`ph emp ${className}`} style={{ width: size, height: size, '--c': '#3a3a42' } as CSSProperties}>
        <span className="npc">+</span>
      </div>
    );
  }
  const photo = driverPhoto(driver.code);
  const logo = teamLogo(driver.team_code as TeamCode);
  return (
    <div
      className={`ph ${className}`}
      style={{ width: size, height: size, borderRadius: size <= 44 ? 12 : 20, '--c': driver.color } as CSSProperties}
    >
      {logo && <img className="tl" src={logo} alt="" loading="lazy" decoding="async" />}
      {photo ? (
        <img src={photo} alt={driver.name ?? driver.code} loading="lazy" decoding="async" width={size} height={size} />
      ) : (
        <span className="npc">{driver.number ?? driver.code}</span>
      )}
    </div>
  );
}

/** Аватар игрока (фото или буквы на цвете профиля) — общий компонент из ./Avatar. */
export { Avatar } from './Avatar';

/** Скелет-заглушка на время загрузки. */
export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skel" style={{ height: h, width: w }} aria-hidden="true" />;
}
