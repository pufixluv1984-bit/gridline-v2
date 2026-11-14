import type { QueryClient } from '@tanstack/react-query';

/**
 * Несколько вкладок одного браузера видят одни и те же данные лиг: изменение в одной вкладке (сброс кода
 * приглашения, настройки лиги, вступление, выход, сохранённый прогноз) сразу обновляет экраны лиг и главную
 * в остальных. Экраны с черновиками (прогноз, фэнтези-состав) не трогаем: обновление стёрло бы несохранённое.
 * Другие браузеры и устройства подтягивают изменения при возврате на вкладку (refetchOnWindowFocus ниже).
 */
export const SHARED_SCREENS = [
  ['screen', 'league'],
  ['screen', 'home'],
] as const;

const CHANNEL = 'gridline:sync';

export function installTabSync(qc: QueryClient): () => void {
  for (const key of SHARED_SCREENS) qc.setQueryDefaults(key, { refetchOnWindowFocus: 'always' });
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => {
    for (const key of SHARED_SCREENS) void qc.invalidateQueries({ queryKey: key });
  };
  return () => channel.postMessage('changed');
}
