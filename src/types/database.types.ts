export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RolesRow = {
  id: number;
  code: string;
  name: string;
};

type UsersRow = {
  id: number;
  role_id: number;
  full_name: string;
  user_name: string;
  email: string;
  password_hash: string;
  job_title: string | null;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

export type Database = {
  public: {
    Tables: {
      ROLES: {
        Row: RolesRow;
        Insert: Omit<RolesRow, 'id'> & { id?: number };
        Update: Partial<RolesRow>;
        Relationships: [];
      };
      USERS: {
        Row: UsersRow;
        Insert: {
          id?: number;
          role_id: number;
          full_name: string;
          user_name: string;
          email: string;
          password_hash: string;
          job_title?: string | null;
          failed_attempts?: number;
          locked_until?: string | null;
          last_login_at?: string | null;
          is_active?: boolean;
          must_change_password?: boolean;
        };
        Update: Partial<UsersRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
