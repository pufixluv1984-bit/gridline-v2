import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';
import { translatingFetch } from '@/i18n/db';

// Единственная точка создания клиента. Компоненты не импортируют его напрямую —
// только модули из src/lib/api/* (docs/ARCHITECTURE.md).
let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!env.supabaseConfigured) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  }
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        // PKCE: код приходит в ?code=, а не в #, поэтому не конфликтует с HashRouter.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      // Названия и ошибки из базы приходят по-русски — переводим их на язык игрока прямо в ответе.
      global: { fetch: translatingFetch },
    });
  }
  return client;
}
