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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          exam_id: string | null
          id: number
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          exam_id?: string | null
          id?: never
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          exam_id?: string | null
          id?: never
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "admin_audit_log_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          reexam_of: string | null
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
          reexam_of?: string | null
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
          reexam_of?: string | null
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
          {
            foreignKeyName: "exams_reexam_of_fkey"
            columns: ["reexam_of"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exams_reexam_of_fkey"
            columns: ["reexam_of"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
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
          ban_reason?: string | null
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
          ban_reason?: string | null
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
          reason_category: Database["public"]["Enums"]["reexam_reason"]
          reexam_id: string | null
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
          reason_category?: Database["public"]["Enums"]["reexam_reason"]
          reexam_id?: string | null
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
          reason_category?: Database["public"]["Enums"]["reexam_reason"]
          reexam_id?: string | null
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
            foreignKeyName: "reexam_requests_reexam_id_fkey"
            columns: ["reexam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "reexam_requests_reexam_id_fkey"
            columns: ["reexam_id"]
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
      reexam_students: {
        Row: {
          added_by: string | null
          created_at: string
          exam_id: string
          request_id: string | null
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          exam_id: string
          request_id?: string | null
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          exam_id?: string
          request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reexam_students_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reexam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exam_status"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "reexam_students_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reexam_students_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "reexam_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reexam_students_user_id_fkey"
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
          note: string | null
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
          note?: string | null
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
          note?: string | null
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
      admin_add_reexam_students: {
        Args: { p_reexam_id: string; p_user_ids: string[] }
        Returns: number
      }
      admin_add_window: {
        Args: {
          p_ends_at: string
          p_exam_id: string
          p_starts_at: string
          p_user_ids?: string[]
        }
        Returns: string
      }
      admin_create_reexam: { Args: { p_exam_id: string }; Returns: string }
      admin_exam_control: { Args: { p_exam_id: string }; Returns: Json }
      admin_exam_results: { Args: { p_exam_id: string }; Returns: Json }
      admin_extend_window: {
        Args: { p_ends_at: string; p_window_id: string }
        Returns: Json
      }
      admin_get_exam: { Args: { p_exam_id: string }; Returns: Json }
      admin_get_student: { Args: { p_user_id: string }; Returns: Json }
      admin_grant_retake: {
        Args: { p_exam_id: string; p_note?: string; p_user_id: string }
        Returns: string
      }
      admin_list_exams: {
        Args: never
        Returns: {
          attempt_count: number
          created_at: string
          duration_minutes: number
          id: string
          last_ends_at: string
          live_ends_at: string
          next_starts_at: string
          published_at: string
          question_count: number
          reexam_of: string
          released: boolean
          status: Database["public"]["Enums"]["exam_state"]
          stream: Database["public"]["Enums"]["exam_stream"]
          subject: string
          title: string
          window_ends_at: string
          window_starts_at: string
        }[]
      }
      admin_list_reexam_requests: {
        Args: { p_status?: Database["public"]["Enums"]["reexam_status"] }
        Returns: Json
      }
      admin_list_students: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_stream?: Database["public"]["Enums"]["stream_type"]
        }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_remove_reexam_student: {
        Args: { p_reexam_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_review_reexam_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: Json
      }
      admin_revoke_retake: { Args: { p_grant_id: string }; Returns: undefined }
      admin_set_ban: {
        Args: { p_banned: boolean; p_reason?: string; p_user_id: string }
        Returns: Json
      }
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
          ban_reason: string | null
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
      create_exam: { Args: { payload: Json }; Returns: string }
      current_stream: {
        Args: never
        Returns: Database["public"]["Enums"]["stream_type"]
      }
      delete_exam: { Args: { p_exam_id: string }; Returns: undefined }
      get_leaderboard: {
        Args: { p_exam_id: string; p_limit?: number }
        Returns: Json
      }
      get_my_result: { Args: { p_exam_id: string }; Returns: Json }
      get_open_attempt: { Args: { p_exam_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_banned_user: { Args: never; Returns: boolean }
      is_valid_options: { Args: { o: Json }; Returns: boolean }
      public_home: { Args: never; Returns: Json }
      regrade_exam: { Args: { p_exam_id: string }; Returns: number }
      request_reexam: {
        Args: {
          p_category?: Database["public"]["Enums"]["reexam_reason"]
          p_exam_id: string
          p_reason: string
        }
        Returns: Json
      }
      save_answer: {
        Args: {
          p_attempt_id: string
          p_flagged?: boolean
          p_option: Database["public"]["Enums"]["answer_option"]
          p_question_id: string
        }
        Returns: Json
      }
      save_answers: {
        Args: { p_answers: Json; p_attempt_id: string }
        Returns: Json
      }
      server_now: { Args: never; Returns: string }
      start_exam: { Args: { p_exam_id: string }; Returns: Json }
      student_dashboard: { Args: never; Returns: Json }
      submit_exam: {
        Args: { p_answers?: Json; p_attempt_id: string }
        Returns: Json
      }
      update_answer_keys: {
        Args: { p_exam_id: string; p_keys: Json }
        Returns: Json
      }
      update_exam: {
        Args: { p_exam_id: string; payload: Json }
        Returns: string
      }
    }
    Enums: {
      answer_option: "A" | "B" | "C" | "D"
      exam_state: "draft" | "scheduled" | "live" | "closed"
      exam_stream: "natural" | "social" | "both"
      reexam_reason: "network_power" | "illness" | "device" | "other"
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
      reexam_reason: ["network_power", "illness", "device", "other"],
      reexam_status: ["pending", "approved", "rejected"],
      stream_type: ["natural", "social"],
      user_role: ["student", "admin"],
    },
  },
} as const
