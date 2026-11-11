// Публичные значения из VITE_*. Здесь только адрес проекта и anon/publishable ключ —
// service_role в браузер не попадает никогда (правило 2).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const looksPlaceholder = (v: string | undefined) => !v || v.includes('YOUR_');

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  /** Supabase настроен: есть адрес и ключ, не заглушки из .env.example. */
  supabaseConfigured: !looksPlaceholder(url) && !looksPlaceholder(anonKey),
  /**
   * Адрес сайта для редиректов (вход через Google/Discord). Должен совпадать с записью
   * в Supabase → Redirect URLs буква в букву: для корня — без слэша (`http://localhost:5173`),
   * на Pages — с ним (`https://…/gridline-v2/`). Иначе Supabase вернёт на Site URL.
   */
  siteUrl: siteUrlFor(import.meta.env.BASE_URL, window.location.origin),
} as const;

export function siteUrlFor(base: string, origin: string): string {
  const url = new URL(base, origin).toString();
  return base === '/' ? url.replace(/\/$/, '') : url;
}
