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
          fav_driver: string | null;
          fav_team: string | null;
          nickname_changed_at: string | null;
          team_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { nickname?: string; avatar_color?: string; fav_driver?: string | null; fav_team?: string | null; team_name?: string | null };
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
        Insert: { name: string; season_id: number; start_event_id?: number | null; max_members?: number; mode?: string; bonus_config?: Json };
        Update: { name?: string; max_members?: number; bonus_config?: Json };
        Relationships: [];
      };
      predictions: {
        Row: { user_id: string; event_id: number; qualy: string[] | null; race: string[] | null; sprint: string[] | null; fastest_lap: string | null; submitted_at: string; updated_at: string };
        Insert: {
          event_id: number; qualy: string[] | null; race: string[] | null; sprint?: string[] | null; fastest_lap?: string | null; first_dnf?: string | null;
          pole_wins?: boolean | null; safety_car?: boolean | null; dnf_many?: boolean | null; boost_block?: string | null;
        };
        Update: { event_id?: number; qualy?: string[] | null; race?: string[] | null; sprint?: string[] | null; fastest_lap?: string | null };
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
      predict_screen: { Args: { ev?: number; league?: string }; Returns: Json };
      home_screen: { Args: { league?: string }; Returns: Json };
      league_screen: { Args: { league: string }; Returns: Json };
      results_screen: { Args: { ev?: number }; Returns: Json };
      schedule_screen: { Args: Record<string, never>; Returns: Json };
      league_preview: { Args: { code: string }; Returns: Json };
      join_league: { Args: { code: string }; Returns: string | null };
      leave_league: { Args: { league: string }; Returns: undefined };
      kick_member: { Args: { league: string; member: string }; Returns: undefined };
      transfer_league: { Args: { league: string; new_owner: string }; Returns: undefined };
      reset_invite_code: { Args: { league: string }; Returns: string };
      data_updated_at: { Args: Record<string, never>; Returns: string | null };
      is_site_admin: { Args: Record<string, never>; Returns: boolean };
      breakdown_screen: { Args: { ev?: number; player?: string }; Returns: Json };
      profile_screen: { Args: { player?: string; season_year?: number }; Returns: Json };
      league_titles: { Args: { league: string }; Returns: Json };
      drivers_screen: { Args: Record<string, never>; Returns: Json };
      driver_screen: { Args: { driver: string }; Returns: Json };
      admin_set_safety_car: { Args: { ev: number; value: boolean }; Returns: number };
      admin_set_result: { Args: { ev: number; session: string; driver_ids: string[]; fastest_lap?: string }; Returns: number };
    };
    Enums: {
      league_role: 'owner' | 'member';
      session_kind: 'fp1' | 'fp2' | 'fp3' | 'sprint_qualy' | 'sprint' | 'qualy' | 'race';
      event_status: 'scheduled' | 'cancelled' | 'void';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
