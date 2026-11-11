// Генерируется из базы: `pnpm exec supabase gen types typescript --local > src/lib/database.types.ts`.
// Руками не править. Пока локальная база не поднята, здесь вручную описана только схема миграции 0001,
// чтобы фронт собирался; после первого `supabase start` файл перезаписывается генератором.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nickname: string;
          avatar_color: string;
          in_global_ranking: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { nickname?: string; avatar_color?: string };
        Relationships: [];
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          season_id: number;
          owner_id: string;
          invite_code: string;
          max_members: number;
          bonus_config: Json;
          created_at: string;
        };
        Insert: never;
        Update: { name?: string; max_members?: number; bonus_config?: Json };
        Relationships: [];
      };
      league_members: {
        Row: { league_id: string; user_id: string; role: 'owner' | 'member'; joined_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      seasons: {
        Row: { id: number; year: number; is_current: boolean };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: {
          id: number;
          season_id: number;
          round: number;
          slug: string;
          name: string;
          circuit: string;
          country: string;
          is_sprint: boolean;
          status: 'scheduled' | 'cancelled' | 'void';
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: number;
          event_id: number;
          kind: 'fp1' | 'fp2' | 'fp3' | 'sprint_qualy' | 'sprint' | 'qualy' | 'race';
          starts_at: string;
          deadline_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      server_now: { Args: Record<string, never>; Returns: string };
      shares_league: { Args: { other: string }; Returns: boolean };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      league_role: 'owner' | 'member';
      session_kind: 'fp1' | 'fp2' | 'fp3' | 'sprint_qualy' | 'sprint' | 'qualy' | 'race';
      event_status: 'scheduled' | 'cancelled' | 'void';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
