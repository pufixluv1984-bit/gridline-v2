// Какая лига выбрана на главной и в разделе «Лига друзей» — удобство на этом устройстве (localStorage).
const KEY = 'gridline:league';

export function getCurrentLeague(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCurrentLeague(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно — просто не запоминаем */
  }
}
