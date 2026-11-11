/** Две буквы для аватара без фото: первые буквы двух слов ника или первые две буквы. */
export function initialsOf(nick: string | undefined | null): string {
  if (!nick) return '··';
  const parts = nick.trim().split(/[\s_.-]+/).filter(Boolean);
  const two = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : nick.trim().slice(0, 2);
  return two.toUpperCase();
}
