import type { ComponentType } from 'react';
import { IconBars, IconBook, IconCalendar, IconFlag, IconHelmet, IconHome, IconLayers, IconTarget, IconUsers } from './icons';
import type { Key } from '@/i18n';

type Item = { to: string; label: Key; Icon: ComponentType<{ size?: number }> };

// Порядок и подписи — как в макете Main.dc.html (+ «Пилоты» из макета Drivers). «Рейтинг» и «Лига друзей» в макете ведут
// на один экран League; подсвечивается тот, по которому нажали, а без нажатия — «Лига друзей» (так называется экран).
// «Правила» — экран правил фэнтези (макет Fantasy-Rules).
export const ITEMS: Item[] = [
  { to: '/', label: 'nav.home', Icon: IconHome },
  { to: '/predict', label: 'nav.predict', Icon: IconTarget },
  { to: '/league', label: 'nav.ranking', Icon: IconBars },
  { to: '/results', label: 'nav.results', Icon: IconFlag },
  { to: '/drivers', label: 'nav.drivers', Icon: IconHelmet },
  { to: '/schedule', label: 'nav.schedule', Icon: IconCalendar },
  { to: '/fantasy', label: 'nav.fantasy', Icon: IconLayers },
  { to: '/league#friends', label: 'nav.friends', Icon: IconUsers },
  { to: '/fantasy/rules', label: 'nav.rules', Icon: IconBook },
];

export const base = (to: string) => to.split('#')[0]!;

/**
 * Подсвеченный пункт: самый точный по адресу (на /fantasy/rules — «Правила», а не «Фэнтези-лига»).
 * Если у нескольких пунктов один адрес — тот, по которому нажали, иначе последний из них в списке.
 */
export function pickActive(pathname: string, picked: string | null): string | undefined {
  const fits = ITEMS.filter((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(base(i.to))));
  const len = Math.max(0, ...fits.map((i) => base(i.to).length));
  const best = fits.filter((i) => base(i.to).length === len);
  return (best.find((i) => i.to === picked) ?? best[best.length - 1])?.to;
}
