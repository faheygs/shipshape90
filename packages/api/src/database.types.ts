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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_comments: {
        Row: {
          activity_id: string
          author_profile_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          author_profile_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          author_profile_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_entries: {
        Row: {
          actor_profile_id: string
          body: string | null
          challenge_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          visibility: string
        }
        Insert: {
          actor_profile_id: string
          body?: string | null
          challenge_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          visibility?: string
        }
        Update: {
          actor_profile_id?: string
          body?: string | null
          challenge_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_entries_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reactions: {
        Row: {
          activity_id: string
          created_at: string
          profile_id: string
          reaction: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          profile_id: string
          reaction?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          profile_id?: string
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reactions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      body_logs: {
        Row: {
          body_fat_percentage: number | null
          challenge_id: string | null
          created_at: string
          id: string
          logged_on: string
          note: string | null
          photo_path: string | null
          profile_id: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          body_fat_percentage?: number | null
          challenge_id?: string | null
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          photo_path?: string | null
          profile_id: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          body_fat_percentage?: number | null
          challenge_id?: string | null
          created_at?: string
          id?: string
          logged_on?: string
          note?: string | null
          photo_path?: string | null
          profile_id?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_logs_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_invites: {
        Row: {
          challenge_id: string
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          revoked_at: string | null
          use_count: number
        }
        Insert: {
          challenge_id: string
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          use_count?: number
        }
        Update: {
          challenge_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_invites_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_measurements: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          measured_on: string
          member_id: string
          metric: string
          updated_at: string
          value: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          measured_on?: string
          member_id: string
          metric: string
          updated_at?: string
          value: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          measured_on?: string
          member_id?: string
          metric?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_measurements_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_measurements_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_members: {
        Row: {
          challenge_id: string
          created_at: string
          forfeiture_reason: string | null
          id: string
          joined_at: string | null
          prize_eligible: boolean
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          scoring_time_zone: string
          status: Database["public"]["Enums"]["member_status"]
          withdrawn_at: string | null
        }
        Insert: {
          challenge_id: string
          created_at?: string
          forfeiture_reason?: string | null
          id?: string
          joined_at?: string | null
          prize_eligible?: boolean
          profile_id: string
          role?: Database["public"]["Enums"]["member_role"]
          scoring_time_zone?: string
          status?: Database["public"]["Enums"]["member_status"]
          withdrawn_at?: string | null
        }
        Update: {
          challenge_id?: string
          created_at?: string
          forfeiture_reason?: string | null
          id?: string
          joined_at?: string | null
          prize_eligible?: boolean
          profile_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          scoring_time_zone?: string
          status?: Database["public"]["Enums"]["member_status"]
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_members_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_join_queue: {
        Row: {
          allow_auto_switch: boolean
          challenge_id: string
          failure_reason: string | null
          processed_at: string | null
          profile_id: string
          queued_at: string
          scoring_time_zone: string
          status: string
        }
        Insert: {
          allow_auto_switch?: boolean
          challenge_id: string
          failure_reason?: string | null
          processed_at?: string | null
          profile_id: string
          queued_at?: string
          scoring_time_zone: string
          status?: string
        }
        Update: {
          allow_auto_switch?: boolean
          challenge_id?: string
          failure_reason?: string | null
          processed_at?: string | null
          profile_id?: string
          queued_at?: string
          scoring_time_zone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_join_queue_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_join_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_saves: {
        Row: {
          challenge_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_saves_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_saves_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          category: string
          cover_path: string | null
          created_at: string
          description: string
          ends_on: string
          id: string
          join_policy: string
          name: string
          owner_id: string | null
          participant_limit: number | null
          prize_description: string | null
          registration_closes_at: string | null
          rules_locked_at: string | null
          rules_summary: string
          rules_version: number
          slug: string
          starts_on: string
          status: Database["public"]["Enums"]["challenge_status"]
          time_zone: string
          updated_at: string
          visibility: Database["public"]["Enums"]["challenge_visibility"]
        }
        Insert: {
          category?: string
          cover_path?: string | null
          created_at?: string
          description?: string
          ends_on: string
          id?: string
          join_policy?: string
          name: string
          owner_id: string
          participant_limit?: number | null
          prize_description?: string | null
          registration_closes_at?: string | null
          rules_locked_at?: string | null
          rules_summary?: string
          rules_version?: number
          slug: string
          starts_on: string
          status?: Database["public"]["Enums"]["challenge_status"]
          time_zone?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["challenge_visibility"]
        }
        Update: {
          category?: string
          cover_path?: string | null
          created_at?: string
          description?: string
          ends_on?: string
          id?: string
          join_policy?: string
          name?: string
          owner_id?: string | null
          participant_limit?: number | null
          prize_description?: string | null
          registration_closes_at?: string | null
          rules_locked_at?: string | null
          rules_summary?: string
          rules_version?: number
          slug?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["challenge_status"]
          time_zone?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["challenge_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "challenges_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          completed_at: string
          created_at: string
          evidence_id: string | null
          id: string
          idempotency_key: string
          member_id: string
          note: string | null
          occurrence_id: string
          value: number | null
        }
        Insert: {
          completed_at: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          idempotency_key: string
          member_id: string
          note?: string | null
          occurrence_id: string
          value?: number | null
        }
        Update: {
          completed_at?: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          idempotency_key?: string
          member_id?: string
          note?: string | null
          occurrence_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: true
            referencedRelation: "task_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_event_outbox: {
        Row: {
          aggregate_id: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          lease_id: string | null
          leased_at: string | null
          payload: Json
          published_at: string | null
          topic: string
        }
        Insert: {
          aggregate_id: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          lease_id?: string | null
          leased_at?: string | null
          payload: Json
          published_at?: string | null
          topic: string
        }
        Update: {
          aggregate_id?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          lease_id?: string | null
          leased_at?: string | null
          payload?: Json
          published_at?: string | null
          topic?: string
        }
        Relationships: []
      }
      evidence_assets: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          media_type: string
          member_id: string
          storage_path: string
          visibility: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          media_type: string
          member_id: string
          storage_path: string
          visibility?: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          media_type?: string
          member_id?: string
          storage_path?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_assets_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_assets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          handle: string | null
          id: string
          is_public: boolean
          time_zone: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          handle?: string | null
          id: string
          is_public?: boolean
          time_zone?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          handle?: string | null
          id?: string
          is_public?: boolean
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      score_ledger: {
        Row: {
          challenge_id: string
          created_at: string
          effective_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          idempotency_key: string
          member_id: string
          metadata: Json
          occurrence_id: string | null
          points: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          effective_date: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          idempotency_key: string
          member_id: string
          metadata?: Json
          occurrence_id?: string | null
          points: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          effective_date?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          idempotency_key?: string
          member_id?: string
          metadata?: Json
          occurrence_id?: string | null
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_ledger_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_ledger_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "task_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      task_catalog: {
        Row: {
          allowed_units: string[]
          category: string
          created_at: string
          default_proof_policy: Database["public"]["Enums"]["proof_policy"]
          default_target_value: number | null
          default_unit: string | null
          description: string
          id: string
          is_public: boolean
          owner_id: string | null
          safety_note: string | null
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          allowed_units?: string[]
          category: string
          created_at?: string
          default_proof_policy?: Database["public"]["Enums"]["proof_policy"]
          default_target_value?: number | null
          default_unit?: string | null
          description?: string
          id?: string
          is_public?: boolean
          owner_id?: string | null
          safety_note?: string | null
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          allowed_units?: string[]
          category?: string
          created_at?: string
          default_proof_policy?: Database["public"]["Enums"]["proof_policy"]
          default_target_value?: number | null
          default_unit?: string | null
          description?: string
          id?: string
          is_public?: boolean
          owner_id?: string | null
          safety_note?: string | null
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_catalog_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_definitions: {
        Row: {
          catalog_task_id: string | null
          challenge_id: string
          created_at: string
          id: string
          instructions: string
          ordinal: number
          points: number
          proof_policy: Database["public"]["Enums"]["proof_policy"]
          required: boolean
          rules_version: number
          schedule: Json
          target_value: number | null
          task_type: string
          title: string
          unit: string | null
        }
        Insert: {
          catalog_task_id?: string | null
          challenge_id: string
          created_at?: string
          id?: string
          instructions?: string
          ordinal: number
          points?: number
          proof_policy?: Database["public"]["Enums"]["proof_policy"]
          required?: boolean
          rules_version: number
          schedule: Json
          target_value?: number | null
          task_type: string
          title: string
          unit?: string | null
        }
        Update: {
          catalog_task_id?: string | null
          challenge_id?: string
          created_at?: string
          id?: string
          instructions?: string
          ordinal?: number
          points?: number
          proof_policy?: Database["public"]["Enums"]["proof_policy"]
          required?: boolean
          rules_version?: number
          schedule?: Json
          target_value?: number | null
          task_type?: string
          title?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_definitions_catalog_task_id_fkey"
            columns: ["catalog_task_id"]
            isOneToOne: false
            referencedRelation: "task_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_definitions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      task_occurrences: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          local_date: string
          member_id: string
          status: Database["public"]["Enums"]["occurrence_status"]
          task_definition_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          local_date: string
          member_id: string
          status?: Database["public"]["Enums"]["occurrence_status"]
          task_definition_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          local_date?: string
          member_id?: string
          status?: Database["public"]["Enums"]["occurrence_status"]
          task_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_occurrences_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_occurrences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_occurrences_task_definition_id_fkey"
            columns: ["task_definition_id"]
            isOneToOne: false
            referencedRelation: "task_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      winner_rules: {
        Row: {
          bonus_calculation: string | null
          bonus_metric: string
          challenge_id: string
          created_at: string
          id: string
          primary_metric: string
          rules_version: number
          threshold: number | null
          tie_breakers: Json
        }
        Insert: {
          bonus_calculation?: string | null
          bonus_metric?: string
          challenge_id: string
          created_at?: string
          id?: string
          primary_metric: string
          rules_version: number
          threshold?: number | null
          tie_breakers?: Json
        }
        Update: {
          bonus_calculation?: string | null
          bonus_metric?: string
          challenge_id?: string
          created_at?: string
          id?: string
          primary_metric?: string
          rules_version?: number
          threshold?: number | null
          tie_breakers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "winner_rules_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          avatar_path: string | null
          challenge_id: string | null
          display_name: string | null
          member_id: string | null
          perfect_days: number | null
          total_points: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_ledger_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "challenge_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_realtime_outbox_events: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          event_type: string
          id: string
          lease_id: string
          payload: Json
          topic: string
        }[]
      }
      complete_realtime_outbox_event: {
        Args: { p_event_id: string; p_lease_id: string }
        Returns: boolean
      }
      complete_task: {
        Args: {
          command_idempotency_key: string
          target_evidence_id?: string
          target_occurrence_id: string
          task_completed_at?: string
          task_note?: string
          task_value?: number
        }
        Returns: {
          awarded_points: number
          checkin_id: string
        }[]
      }
      create_challenge_draft:
        | {
            Args: {
              challenge_bonus_calculation: string
              challenge_bonus_metric: string
              challenge_description: string
              challenge_ends_on: string
              challenge_join_policy: string
              challenge_name: string
              challenge_reward: string
              challenge_starts_on: string
              challenge_visibility: Database["public"]["Enums"]["challenge_visibility"]
              configured_tasks: Json
            }
            Returns: string
          }
        | {
            Args: {
              challenge_description: string
              challenge_ends_on: string
              challenge_join_policy: string
              challenge_name: string
              challenge_reward: string
              challenge_scoring_method: string
              challenge_starts_on: string
              challenge_visibility: Database["public"]["Enums"]["challenge_visibility"]
              configured_tasks: Json
            }
            Returns: string
          }
        | {
            Args: {
              challenge_description: string
              challenge_ends_on: string
              challenge_join_policy: string
              challenge_name: string
              challenge_reward: string
              challenge_starts_on: string
              challenge_visibility: Database["public"]["Enums"]["challenge_visibility"]
              configured_tasks: Json
            }
            Returns: string
          }
      create_challenge_invite: {
        Args: {
          target_challenge_id: string
          target_expires_at?: string
          target_max_uses?: number
        }
        Returns: string
      }
      get_my_perfect_day_streak: {
        Args: { target_challenge_id: string }
        Returns: number
      }
      has_challenge_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["member_role"][]
          target_challenge_id: string
        }
        Returns: boolean
      }
      is_challenge_member: {
        Args: { target_challenge_id: string }
        Returns: boolean
      }
      is_profile_handle_available: {
        Args: { candidate_handle: string }
        Returns: boolean
      }
      join_challenge: {
        Args: { submitted_invite_code?: string; target_challenge_id: string }
        Returns: string
      }
      leave_challenge: {
        Args: { target_challenge_id: string }
        Returns: string
      }
      disable_push_device: {
        Args: { submitted_token: string }
        Returns: boolean
      }
      disable_all_push_devices: {
        Args: never
        Returns: number
      }
      has_enabled_push_device: {
        Args: never
        Returns: boolean
      }
      prepare_account_deletion: {
        Args: never
        Returns: Json
      }
      get_my_notification_unread_count: {
        Args: never
        Returns: number
      }
      list_my_notifications: {
        Args: { page_size?: number }
        Returns: {
          action_path: string | null
          body: string
          challenge_id: string | null
          created_at: string
          id: string
          notification_type: string
          payload: Json
          read_at: string | null
          title: string
        }[]
      }
      mark_all_notifications_read: {
        Args: never
        Returns: number
      }
      mark_notification_read: {
        Args: { target_notification_id: string }
        Returns: boolean
      }
      delete_my_notification: {
        Args: { target_notification_id: string }
        Returns: boolean
      }
      clear_my_notifications: {
        Args: never
        Returns: number
      }
      register_push_device: {
        Args: { submitted_platform: string; submitted_token: string }
        Returns: string
      }
      close_owned_challenge: {
        Args: { close_action: string; target_challenge_id: string }
        Returns: string
      }
      get_challenge_management: {
        Args: { target_challenge_id: string }
        Returns: {
          active_members: number
          average_completion: number
          challenge_id: string
          challenge_status: string
          description: string
          ends_on: string
          join_policy: string
          name: string
          pending_requests: number
          queued_members: number
          rules_locked: boolean
          starts_on: string
          total_points: number
          visibility: Database["public"]["Enums"]["challenge_visibility"]
        }[]
      }
      switch_challenge: {
        Args: { submitted_invite_code?: string; target_challenge_id: string }
        Returns: string
      }
      list_body_logs: {
        Args: { target_challenge_id?: string }
        Returns: {
          body_fat_percentage: number
          challenge_id: string
          created_at: string
          id: string
          logged_on: string
          note: string
          photo_path: string
          weight: number
        }[]
      }
      list_challenge_leaderboard: {
        Args: { target_challenge_id: string }
        Returns: {
          avatar_path: string
          baseline_value: number
          bonus_calculation: string
          bonus_metric: string
          bonus_points: number
          completion_percentage: number
          display_name: string
          is_current_user: boolean
          latest_value: number
          member_id: string
          outcome_value: number
          perfect_days: number
          profile_id: string
          rank: number
          scoring_method: string
          total_points: number
          total_score: number
        }[]
      }
      list_challenge_tasks: {
        Args: { target_challenge_id: string }
        Returns: {
          instructions: string
          ordinal: number
          points: number
          proof_policy: Database["public"]["Enums"]["proof_policy"]
          required: boolean
          target_value: number
          task_definition_id: string
          task_type: string
          title: string
          unit: string
        }[]
      }
      list_challenge_management_invites: {
        Args: { target_challenge_id: string }
        Returns: {
          code: string
          created_at: string
          expires_at: string | null
          invite_id: string
          max_uses: number | null
          revoked_at: string | null
          use_count: number
        }[]
      }
      list_challenge_management_members: {
        Args: { target_challenge_id: string }
        Returns: {
          avatar_path: string | null
          completion_percentage: number
          display_name: string
          handle: string
          joined_at: string | null
          member_id: string
          member_status: Database["public"]["Enums"]["member_status"]
          perfect_days: number
          prize_eligible: boolean
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          total_points: number
        }[]
      }
      list_challenge_management_queue: {
        Args: { target_challenge_id: string }
        Returns: {
          allow_auto_switch: boolean
          avatar_path: string | null
          display_name: string
          handle: string
          profile_id: string
          queue_status: string
          queued_at: string
          scoring_time_zone: string
        }[]
      }
      list_challenges: {
        Args: never
        Returns: {
          bonus_calculation: string
          bonus_metric: string
          category: string
          challenge_status: string
          cover_path: string
          description: string
          ends_on: string
          id: string
          is_owner: boolean
          is_queued: boolean
          is_saved: boolean
          join_policy: string
          membership_status: string
          name: string
          participant_count: number
          prize_description: string
          queue_status: string | null
          scoring_method: string
          slug: string
          starts_on: string
          visibility: Database["public"]["Enums"]["challenge_visibility"]
        }[]
      }
      list_my_challenge_history: {
        Args: never
        Returns: {
          challenge_id: string
          challenge_name: string
          completed_tasks: number
          completion_percentage: number
          days_participated: number
          ends_on: string
          final_rank: number | null
          forfeiture_reason: string | null
          joined_at: string
          membership_status: string
          participant_count: number
          perfect_days: number
          prize_eligible: boolean
          result_status: string
          scheduled_tasks: number
          starts_on: string
          total_points: number
          withdrawn_at: string | null
        }[]
      }
      list_challenge_day: {
        Args: { target_challenge_id: string; target_local_date: string }
        Returns: {
          completed_at: string | null
          instructions: string
          occurrence_id: string
          points: number
          proof_policy: Database["public"]["Enums"]["proof_policy"]
          status: Database["public"]["Enums"]["occurrence_status"]
          target_value: number | null
          task_definition_id: string
          task_type: string
          title: string
          unit: string | null
        }[]
      }
      list_challenge_history: {
        Args: { target_challenge_id: string }
        Returns: {
          completed_count: number
          day_points: number
          local_date: string
          missed_count: number
          pending_count: number
          task_count: number
        }[]
      }
      list_today_tasks: {
        Args: { requested_local_date?: string; target_challenge_id: string }
        Returns: {
          completed_at: string
          instructions: string
          occurrence_id: string
          points: number
          proof_policy: Database["public"]["Enums"]["proof_policy"]
          status: Database["public"]["Enums"]["occurrence_status"]
          target_value: number
          task_definition_id: string
          task_type: string
          title: string
          unit: string
        }[]
      }
      amend_challenge_day: {
        Args: {
          completed_occurrence_ids: string[]
          target_challenge_id: string
          target_local_date: string
        }
        Returns: {
          completed_count: number
          day_points: number
          score_delta: number
        }[]
      }
      publish_challenge: {
        Args: { target_challenge_id: string }
        Returns: string
      }
      record_challenge_measurement: {
        Args: {
          measurement_date?: string
          measurement_value: number
          target_challenge_id: string
        }
        Returns: string
      }
      release_realtime_outbox_event: {
        Args: { p_event_id: string; p_lease_id: string }
        Returns: boolean
      }
      resolve_challenge_invite: {
        Args: { submitted_invite_code: string }
        Returns: {
          bonus_calculation: string
          bonus_metric: string
          category: string
          challenge_id: string
          cover_path: string
          description: string
          ends_on: string
          name: string
          participant_count: number
          prize_description: string
          scoring_method: string
          starts_on: string
        }[]
      }
      save_body_log: {
        Args: {
          log_body_fat_percentage?: number
          log_date?: string
          log_note?: string
          log_photo_path?: string
          log_weight?: number
          target_challenge_id?: string
        }
        Returns: string
      }
      save_own_profile: {
        Args: {
          profile_avatar_path?: string | null
          profile_display_name: string
          profile_handle: string
          profile_time_zone?: string
        }
        Returns: undefined
      }
      remove_challenge_member: {
        Args: { target_challenge_id: string; target_member_id: string }
        Returns: string
      }
      review_challenge_join_request: {
        Args: {
          approve_request: boolean
          target_challenge_id: string
          target_member_id: string
        }
        Returns: Database["public"]["Enums"]["member_status"]
      }
      revoke_challenge_invite: {
        Args: { target_invite_id: string }
        Returns: string
      }
      set_challenge_saved: {
        Args: { should_save: boolean; target_challenge_id: string }
        Returns: boolean
      }
      set_challenge_queued: {
        Args: {
          allow_switch_at_start?: boolean
          should_queue: boolean
          target_challenge_id: string
        }
        Returns: boolean
      }
      submit_challenge_day: {
        Args: {
          selected_occurrence_ids: string[]
          target_challenge_id: string
          target_local_date: string
        }
        Returns: {
          awarded_points: number
          completed_count: number
        }[]
      }
    }
    Enums: {
      challenge_status:
        | "draft"
        | "registration"
        | "active"
        | "review"
        | "complete"
        | "archived"
      challenge_visibility: "public" | "unlisted" | "private"
      ledger_entry_type:
        | "task_complete"
        | "perfect_day"
        | "streak_bonus"
        | "missed_penalty"
        | "manual_adjustment"
      member_role: "owner" | "moderator" | "participant"
      member_status: "pending" | "active" | "left" | "removed" | "completed"
      occurrence_status:
        | "pending"
        | "complete"
        | "missed"
        | "excused"
        | "pending_review"
      proof_policy: "none" | "optional" | "required"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      challenge_status: [
        "draft",
        "registration",
        "active",
        "review",
        "complete",
        "archived",
      ],
      challenge_visibility: ["public", "unlisted", "private"],
      ledger_entry_type: [
        "task_complete",
        "perfect_day",
        "streak_bonus",
        "missed_penalty",
        "manual_adjustment",
      ],
      member_role: ["owner", "moderator", "participant"],
      member_status: ["pending", "active", "left", "removed", "completed"],
      occurrence_status: [
        "pending",
        "complete",
        "missed",
        "excused",
        "pending_review",
      ],
      proof_policy: ["none", "optional", "required"],
    },
  },
} as const
