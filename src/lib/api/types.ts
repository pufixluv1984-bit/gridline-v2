// Типы, которые фронт берёт из Supabase, реэкспортируются отсюда, чтобы компоненты
// не импортировали @supabase/supabase-js напрямую.
export type { Session, User } from '@supabase/supabase-js';
