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
  /** Адрес сайта для редиректов (вход через Google/Discord, письма). */
  siteUrl: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
} as const;
