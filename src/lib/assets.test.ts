import { describe, expect, it } from 'vitest';
import { driverPhoto, teamBadge, teamCar, teamLogo } from './assets';

describe('assets', () => {
  it('фото пилота из webp-папки, регистр не важен', () => {
    expect(driverPhoto('ver')).toBe('/assets/webp/drivers/VER.webp');
  });
  it('нет фото — null (монограмма)', () => {
    expect(driverPhoto('LIN')).toBeNull();
    expect(driverPhoto('XXX')).toBeNull();
  });
  it('болид и логотип по коду команды', () => {
    expect(teamCar('RB')).toBe('/assets/f1_cars/racing_bulls.webp');
    expect(teamLogo('AST')).toBe('/assets/webp/logos/aston.webp');
    expect(teamBadge('AST')).toBe('/assets/f1_team_logos/aston.png');
  });
  it('Red Bull и Racing Bulls не перепутаны', () => {
    expect(teamLogo('RBR')).toBe('/assets/webp/logos/rb.webp');
    expect(teamLogo('RB')).toBe('/assets/webp/logos/rbr.webp');
  });
});
