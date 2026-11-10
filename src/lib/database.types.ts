export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      answer_keys: {
        Row: {
          correct_option: Database["public"]["Enums"]["answer_option"]
          question_id: string
          updated_at: string
        }
        Insert: {
          correct_option: Database["public"]["Enums"]["answer_option"]
          question_id: string
          updated_at?: string
        }
        Update: {
          correct_option?: Database["public"]["Enums"]["answer_option"]
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_answers: {
        Row: {
          attempt_id: string
          flagged: boolean
          question_id: string
          selected_option: Database["public"]["Enums"]["answer_option"] | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          flagged?: boolean
          question_id: string
          selected_option?: Database["public"]["Enums"]["answer_option"] | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          flagged?: boolean
          question_id?: string
          selected_option?: Database["public"]["Enums"]["answer_option"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          attempt_no: number
          auto_submitted: boolean
          deadline_at: string
          exam_id: string
          id: string
          max_score: number | null
          retake_grant_id: string | null
          score: number | null
          started_at: string
          submitted_at: string | null
          user_id: string
          window_id: string
        }
        Insert: {
          attempt_no?: number
          auto_submitted?: boolean
          deadline_at: string
          exam_id: string
          id?: string
          max_score?: number | null
          retake_grant_id?: string | null
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          user_id: string
          window_id: string
        }
        Update: {
          attempt_no?: number
          auto_submitted?: boolean
          deadline_at?: string
          exam_id?: string
          id?: string
          max_score?: number | null
          retake_grant_id?: string | null
          score?: number | null
          started_at?: string
          submitted_at?: string | null
          user_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_retake_grant_fk"
            columns: ["retake_grant_id"]
            isOneToOne: false
            referencedRelation: "retake_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "exam_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_windows: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          exam_id: string
          id: string
          is_reopen: boolean
          restricted: boolean
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          exam_id: string
          id?: string
          is_reopen?: boolean
          restricted?: boolean
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          exam_id?: string
          id?: string
          is_reopen?: boolean
          restricted?: boolean
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_windows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_windows_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_windows_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          published_at: string | null
          source_file: string | null
          stream: Database["public"]["Enums"]["exam_stream"]
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          id?: string
          published_at?: string | null
          source_file?: string | null
          stream?: Database["public"]["Enums"]["exam_stream"]
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          published_at?: string | null
          source_file?: string | null
          stream?: Database["public"]["Enums"]["exam_stream"]
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banned_at: string | null
          created_at: string
          full_name: string | null
          id: string
          is_banned: boolean
          is_complete: boolean | null
          role: Database["public"]["Enums"]["user_role"]
          school: string | null
          stream: Database["public"]["Enums"]["stream_type"] | null
          telegram_id: string | null
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          banned_at?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_banned?: boolean
          is_complete?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          school?: string | null
          stream?: Database["public"]["Enums"]["stream_type"] | null
          telegram_id?: string | null
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          banned_at?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_banned?: boolean
          is_complete?: boolean | null
          role?: Database["public"]["Enums"]["user_role"]
          school?: string | null
          stream?: Database["public"]["Enums"]["stream_type"] | null
          telegram_id?: string | null
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          body: string
          created_at: string
          exam_id: string
          id: string
          image_url: string | null
          options: Json
          points: number
          position: number
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          exam_id: string
          id?: string
          image_url?: string | null
          options: Json
          points?: number
          position: number
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          exam_id?: string
          id?: string
          image_url?: string | null
          options?: Json
          points?: number
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      reexam_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          exam_id: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["reexam_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          exam_id: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["reexam_status"]
          user_id?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          exam_id?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["reexam_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reexam_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "reexam_requests_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reexam_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reexam_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retake_grants: {
        Row: {
          created_at: string
          exam_id: string
          granted_by: string | null
          id: string
          request_id: string | null
          used: boolean
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          granted_by?: string | null
          id?: string
          request_id?: string | null
          used?: boolean
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          granted_by?: string | null
          id?: string
          request_id?: string | null
          used?: boolean
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retake_grants_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "retake_grants_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retake_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retake_grants_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "reexam_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retake_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      window_allowed_users: {
        Row: {
          created_at: string
          user_id: string
          window_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          window_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "window_allowed_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "window_allowed_users_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "exam_windows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      exam_status: {
        Row: {
          exam_id: string | null
          last_ends_at: string | null
          live_ends_at: string | null
          next_starts_at: string | null
          server_now: string | null
          status: Database["public"]["Enums"]["exam_state"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_update_profile: {
        Args: {
          p_full_name?: string
          p_role?: Database["public"]["Enums"]["user_role"]
          p_school?: string
          p_stream?: Database["public"]["Enums"]["stream_type"]
          p_user_id: string
        }
        Returns: {
          avatar_url: string | null
          banned_at: string | null
          created_at: string
          full_name: string | null
          id: string
          is_banned: boolean
          is_complete: boolean | null
          role: Database["public"]["Enums"]["user_role"]
          school: string | null
          stream: Database["public"]["Enums"]["stream_type"] | null
          telegram_id: string | null
          telegram_username: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_stream: {
        Args: never
        Returns: Database["public"]["Enums"]["stream_type"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_banned_user: { Args: never; Returns: boolean }
      is_valid_options: { Args: { o: Json }; Returns: boolean }
      server_now: { Args: never; Returns: string }
    }
    Enums: {
      answer_option: "A" | "B" | "C" | "D"
      exam_state: "draft" | "scheduled" | "live" | "closed"
      exam_stream: "natural" | "social" | "both"
      reexam_status: "pending" | "approved" | "rejected"
      stream_type: "natural" | "social"
      user_role: "student" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      answer_option: ["A", "B", "C", "D"],
      exam_state: ["draft", "scheduled", "live", "closed"],
      exam_stream: ["natural", "social", "both"],
      reexam_status: ["pending", "approved", "rejected"],
      stream_type: ["natural", "social"],
      user_role: ["student", "admin"],
    },
  },
} as const
