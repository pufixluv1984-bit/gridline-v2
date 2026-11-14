/**
 * Единственный модуль, который знает, где лежат фото пилотов, болиды и логотипы (правило 10).
 * Набор владельца распакован в public/assets/ как есть. Фото пилотов: оригиналы в полный рост —
 * public/assets/f1_photos/full/<КОД>.jpg (набор 14.11.2026), из них scripts/driver-photos.py делает кадр
 * «голова и грудь» без фона (f1_photos/<КОД>.png) и public/assets/webp/drivers/ (240×240, для карточек
 * до 120px при 2×). У BOT, PER и OCO пока прежние фото из первого набора. Логотипы в наборе — белые на
 * цветном квадрате; в макетах они белые на прозрачном, поэтому есть производные public/assets/webp/logos/
 * (фон убран по цвету угла). Оригиналы не трогаем.
 * Чтобы перейти на монограммы, достаточно вернуть null из функций ниже — компоненты покажут номер.
 * Трассы сюда не входят: они берутся из макета Tracks.dc.html и подключаются отдельно (фаза 1+).
 */
const base = `${import.meta.env.BASE_URL}assets/`;

/** Коды команд, как в макетах. */
export type TeamCode = 'MCL' | 'MER' | 'FER' | 'RBR' | 'WIL' | 'AST' | 'HAS' | 'RB' | 'ALP' | 'AUD' | 'CAD';

const TEAM_FILES: Record<TeamCode, { car: string; logo: string }> = {
  MCL: { car: 'mclaren', logo: 'mclaren' },
  MER: { car: 'mercedes', logo: 'mercedes' },
  FER: { car: 'ferrari', logo: 'ferrari' },
  // В архиве владельца имена логотипов перепутаны: rb.png — Red Bull Racing, rbr.png — Racing Bulls.
  RBR: { car: 'red_bull_racing', logo: 'rb' },
  WIL: { car: 'williams', logo: 'williams' },
  AST: { car: 'aston_martin', logo: 'aston' },
  HAS: { car: 'haas', logo: 'haas' },
  RB: { car: 'racing_bulls', logo: 'rbr' },
  ALP: { car: 'alpine', logo: 'alpine' },
  AUD: { car: 'audi', logo: 'audi' },
  CAD: { car: 'cadillac', logo: 'cadillac' },
};

/** Пилоты, для которых в наборе есть настоящее фото; у остальных — монограмма с номером. */
const DRIVER_PHOTOS = new Set([
  'ALB', 'ALO', 'ANT', 'BEA', 'BOR', 'BOT', 'CAM', 'COL', 'GAS', 'HAD', 'HAM', 'HUL',
  'LAW', 'LEC', 'LIN', 'NOR', 'OCO', 'PER', 'PIA', 'RUS', 'SAI', 'STR', 'VER',
]);

/** Фото пилота по трёхбуквенному коду (VER, NOR…) или null → монограмма. */
export function driverPhoto(code: string): string | null {
  const c = code.toUpperCase();
  return DRIVER_PHOTOS.has(c) ? `${base}webp/drivers/${c}.webp` : null;
}

export function teamCar(team: TeamCode): string | null {
  return `${base}f1_cars/${TEAM_FILES[team].car}.webp`;
}

/** Логотип команды: белый на прозрачном (как в макетах). */
export function teamLogo(team: TeamCode): string | null {
  return `${base}webp/logos/${TEAM_FILES[team].logo}.webp`;
}

/** Логотип в фирменном цветном квадрате — оригинал из набора владельца. */
export function teamBadge(team: TeamCode): string | null {
  return `${base}f1_team_logos/${TEAM_FILES[team].logo}.png`;
}
