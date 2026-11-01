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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          reason: string | null
          requested_by: string
          risk_level: string
          status: string
          task_id: string
          tool: string
          tool_input: Json
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string | null
          requested_by: string
          risk_level: string
          status?: string
          task_id: string
          tool: string
          tool_input: Json
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          reason?: string | null
          requested_by?: string
          risk_level?: string
          status?: string
          task_id?: string
          tool?: string
          tool_input?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_automations: {
        Row: {
          created_at: string
          enabled: boolean
          fail_count: number
          frequency: string
          id: string
          kind: string
          last_result: Json | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fail_count?: number
          frequency: string
          id?: string
          kind: string
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string
          owner_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fail_count?: number
          frequency?: string
          id?: string
          kind?: string
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string
          owner_id?: string
        }
        Relationships: []
      }
      agent_cron_key: {
        Row: {
          id: number
          key: string
        }
        Insert: {
          id?: number
          key?: string
        }
        Update: {
          id?: number
          key?: string
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          agent_type: string
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          agent_type: string
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          agent_type?: string
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      agent_steps: {
        Row: {
          actor_user_id: string
          agent_type: string
          created_at: string
          error: string | null
          id: string
          input_summary: Json | null
          kind: string
          result_summary: Json | null
          risk_level: string | null
          status: string
          target: string | null
          task_id: string
          tool: string | null
        }
        Insert: {
          actor_user_id: string
          agent_type: string
          created_at?: string
          error?: string | null
          id?: string
          input_summary?: Json | null
          kind: string
          result_summary?: Json | null
          risk_level?: string | null
          status?: string
          target?: string | null
          task_id: string
          tool?: string | null
        }
        Update: {
          actor_user_id?: string
          agent_type?: string
          created_at?: string
          error?: string | null
          id?: string
          input_summary?: Json | null
          kind?: string
          result_summary?: Json | null
          risk_level?: string | null
          status?: string
          target?: string | null
          task_id?: string
          tool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_type: string
          approval_required: boolean
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          interpreted_intent: string | null
          messages: Json
          objective: string
          result: string | null
          risk_level: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_type: string
          approval_required?: boolean
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          interpreted_intent?: string | null
          messages?: Json
          objective: string
          result?: string | null
          risk_level?: string
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_type?: string
          approval_required?: boolean
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          interpreted_intent?: string | null
          messages?: Json
          objective?: string
          result?: string | null
          risk_level?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      construction_stages: {
        Row: {
          id: string
          render_url: string | null
          stage_data: Json
          stage_name: string
          stage_number: number
          status: string
          visualization_id: string
        }
        Insert: {
          id?: string
          render_url?: string | null
          stage_data?: Json
          stage_name: string
          stage_number: number
          status?: string
          visualization_id: string
        }
        Update: {
          id?: string
          render_url?: string | null
          stage_data?: Json
          stage_name?: string
          stage_number?: number
          status?: string
          visualization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_stages_visualization_id_fkey"
            columns: ["visualization_id"]
            isOneToOne: false
            referencedRelation: "construction_visualizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_visualizations: {
        Row: {
          analysis: Json | null
          approx_area_sqft: number | null
          building_type: string | null
          created_at: string
          floor_count: number | null
          id: string
          location: string | null
          model: Json | null
          name: string
          project_id: string | null
          settings: Json
          source_type: string | null
          status: string
          unit_system: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          approx_area_sqft?: number | null
          building_type?: string | null
          created_at?: string
          floor_count?: number | null
          id?: string
          location?: string | null
          model?: Json | null
          name: string
          project_id?: string | null
          settings?: Json
          source_type?: string | null
          status?: string
          unit_system?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json | null
          approx_area_sqft?: number | null
          building_type?: string | null
          created_at?: string
          floor_count?: number | null
          id?: string
          location?: string | null
          model?: Json | null
          name?: string
          project_id?: string | null
          settings?: Json
          source_type?: string | null
          status?: string
          unit_system?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_visualizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          admin_reply: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          replied_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          replied_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          replied_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      detected_elements: {
        Row: {
          confidence: number
          created_at: string
          element_type: string
          floor: number | null
          geometry_data: Json
          id: string
          source: string
          user_verified: boolean
          visualization_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          element_type: string
          floor?: number | null
          geometry_data: Json
          id?: string
          source: string
          user_verified?: boolean
          visualization_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          element_type?: string
          floor?: number | null
          geometry_data?: Json
          id?: string
          source?: string
          user_verified?: boolean
          visualization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "detected_elements_visualization_id_fkey"
            columns: ["visualization_id"]
            isOneToOne: false
            referencedRelation: "construction_visualizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          last_sent_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          sent_at: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          last_sent_at?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          sent_at?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          last_sent_at?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          sent_at?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_resources: {
        Row: {
          category: string
          content: string | null
          content_bn: string | null
          created_at: string
          id: string
          is_published: boolean
          language: string | null
          resource_type: string
          slug: string
          source_name: string | null
          source_url: string | null
          summary: string | null
          summary_bn: string | null
          tags: string[] | null
          title: string
          title_bn: string | null
        }
        Insert: {
          category?: string
          content?: string | null
          content_bn?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          language?: string | null
          resource_type?: string
          slug: string
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          summary_bn?: string | null
          tags?: string[] | null
          title: string
          title_bn?: string | null
        }
        Update: {
          category?: string
          content?: string | null
          content_bn?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          language?: string | null
          resource_type?: string
          slug?: string
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          summary_bn?: string | null
          tags?: string[] | null
          title?: string
          title_bn?: string | null
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          boq_updates: boolean
          deadline_alerts: boolean
          deadline_days_before: number
          document_uploads: boolean
          email_enabled: boolean
          material_price: boolean
          member_joined: boolean
          team_invites: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          boq_updates?: boolean
          deadline_alerts?: boolean
          deadline_days_before?: number
          document_uploads?: boolean
          email_enabled?: boolean
          material_price?: boolean
          member_joined?: boolean
          team_invites?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          boq_updates?: boolean
          deadline_alerts?: boolean
          deadline_days_before?: number
          document_uploads?: boolean
          email_enabled?: boolean
          material_price?: boolean
          member_joined?: boolean
          team_invites?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          message: string | null
          project_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          message?: string | null
          project_id?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          message?: string | null
          project_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_note: string | null
          amount: number
          billing_cycle: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          payment_method: string | null
          payment_provider: string
          plan_id: string | null
          sender_number: string | null
          status: string
          subscription_id: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          admin_note?: string | null
          amount: number
          billing_cycle?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          payment_method?: string | null
          payment_provider?: string
          plan_id?: string | null
          sender_number?: string | null
          status?: string
          subscription_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          admin_note?: string | null
          amount?: number
          billing_cycle?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          payment_method?: string | null
          payment_provider?: string
          plan_id?: string | null
          sender_number?: string | null
          status?: string
          subscription_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          features: Json
          id: string
          is_active: boolean
          is_popular: boolean
          limits: Json
          name: string
          price_monthly: number
          price_yearly: number
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          limits?: Json
          name: string
          price_monthly?: number
          price_yearly?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          limits?: Json
          name?: string
          price_monthly?: number
          price_yearly?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          referral_code: string | null
          referred_by: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          referral_code?: string | null
          referred_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          project_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          project_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          project_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          project_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          project_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          last_active_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          last_active_at?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          last_active_at?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          bnbc_loads: Json | null
          budget: number | null
          client_name: string | null
          created_at: string
          end_date: string | null
          estimate: Json | null
          file_name: string | null
          id: string
          inputs: Json | null
          is_public: boolean
          location: string | null
          name: string
          project_type: string | null
          share_token: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bnbc_loads?: Json | null
          budget?: number | null
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          estimate?: Json | null
          file_name?: string | null
          id?: string
          inputs?: Json | null
          is_public?: boolean
          location?: string | null
          name: string
          project_type?: string | null
          share_token?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bnbc_loads?: Json | null
          budget?: number | null
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          estimate?: Json | null
          file_name?: string | null
          id?: string
          inputs?: Json | null
          is_public?: boolean
          location?: string | null
          name?: string
          project_type?: string | null
          share_token?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          display_name: string | null
          id: string
          stars: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stars: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          stars?: number
          user_id?: string
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          base_amount: number
          commission_amount: number
          created_at: string
          flag_reason: string | null
          id: string
          payment_id: string | null
          rate: number
          referral_id: string
          referred_user_id: string
          referrer_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          base_amount: number
          commission_amount: number
          created_at?: string
          flag_reason?: string | null
          id?: string
          payment_id?: string | null
          rate: number
          referral_id: string
          referred_user_id: string
          referrer_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          created_at?: string
          flag_reason?: string | null
          id?: string
          payment_id?: string | null
          rate?: number
          referral_id?: string
          referred_user_id?: string
          referrer_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          commission_amount: number
          created_at: string
          id: string
          plan: string | null
          referred_user_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          id?: string
          plan?: string | null
          referred_user_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          id?: string
          plan?: string | null
          referred_user_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      site_logs: {
        Row: {
          activities: string | null
          created_at: string
          id: string
          issues: string | null
          log_date: string
          manpower: Json | null
          materials: Json | null
          photos: Json | null
          project_id: string | null
          updated_at: string
          user_id: string
          weather: string | null
        }
        Insert: {
          activities?: string | null
          created_at?: string
          id?: string
          issues?: string | null
          log_date?: string
          manpower?: Json | null
          materials?: Json | null
          photos?: Json | null
          project_id?: string | null
          updated_at?: string
          user_id: string
          weather?: string | null
        }
        Update: {
          activities?: string | null
          created_at?: string
          id?: string
          issues?: string | null
          log_date?: string
          manpower?: Json | null
          materials?: Json | null
          photos?: Json | null
          project_id?: string | null
          updated_at?: string
          user_id?: string
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          contact_email: string | null
          created_at: string
          description: string | null
          featured: boolean
          id: string
          logo_url: string | null
          name: string
          status: string
          submitted_by: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          logo_url?: string | null
          name: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancelled_at: string | null
          created_at: string
          id: string
          payment_provider: string | null
          plan_id: string
          provider_subscription_id: string | null
          renewal_date: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          payment_provider?: string | null
          plan_id: string
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          payment_provider?: string | null
          plan_id?: string
          provider_subscription_id?: string | null
          renewal_date?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_analyses: {
        Row: {
          boq_items: Json | null
          created_at: string
          deadlines: Json | null
          id: string
          risks: Json | null
          source_text: string | null
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          boq_items?: Json | null
          created_at?: string
          deadlines?: Json | null
          id?: string
          risks?: Json | null
          source_text?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          boq_items?: Json | null
          created_at?: string
          deadlines?: Json | null
          id?: string
          risks?: Json | null
          source_text?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_courses: {
        Row: {
          category: string
          created_at: string
          description: string | null
          description_bn: string | null
          difficulty: string
          duration_minutes: number
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          title: string
          title_bn: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          description_bn?: string | null
          difficulty?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          title: string
          title_bn?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          description_bn?: string | null
          difficulty?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          title_bn?: string | null
        }
        Relationships: []
      }
      training_lessons: {
        Row: {
          content: string | null
          content_bn: string | null
          course_id: string
          created_at: string
          duration_minutes: number
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          title: string
          title_bn: string | null
        }
        Insert: {
          content?: string | null
          content_bn?: string | null
          course_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          title: string
          title_bn?: string | null
        }
        Update: {
          content?: string | null
          content_bn?: string | null
          course_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          title_bn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string | null
          id: string
          lesson_id: string
          progress_percent: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lesson_id: string
          progress_percent?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          lesson_id?: string
          progress_percent?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          ai_credits: number
          bbs_generations: number
          boq_generations: number
          created_at: string
          drawings: number
          id: string
          period: string
          projects: number
          reports: number
          storage_mb: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credits?: number
          bbs_generations?: number
          boq_generations?: number
          created_at?: string
          drawings?: number
          id?: string
          period?: string
          projects?: number
          reports?: number
          storage_mb?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credits?: number
          bbs_generations?: number
          boq_generations?: number
          created_at?: string
          drawings?: number
          id?: string
          period?: string
          projects?: number
          reports?: number
          storage_mb?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feature_settings: {
        Row: {
          enabled: boolean
          feature_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_workspace: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      visualization_exports: {
        Row: {
          created_at: string
          export_type: string
          file_url: string | null
          id: string
          status: string
          visualization_id: string
        }
        Insert: {
          created_at?: string
          export_type: string
          file_url?: string | null
          id?: string
          status?: string
          visualization_id: string
        }
        Update: {
          created_at?: string
          export_type?: string
          file_url?: string | null
          id?: string
          status?: string
          visualization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visualization_exports_visualization_id_fkey"
            columns: ["visualization_id"]
            isOneToOne: false
            referencedRelation: "construction_visualizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visualization_files: {
        Row: {
          created_at: string
          derived_from: string | null
          error: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          height: number | null
          id: string
          processing_status: string
          role: string
          user_id: string
          visualization_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          derived_from?: string | null
          error?: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          height?: number | null
          id?: string
          processing_status?: string
          role?: string
          user_id: string
          visualization_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          derived_from?: string | null
          error?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          processing_status?: string
          role?: string
          user_id?: string
          visualization_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visualization_files_derived_from_fkey"
            columns: ["derived_from"]
            isOneToOne: false
            referencedRelation: "visualization_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visualization_files_visualization_id_fkey"
            columns: ["visualization_id"]
            isOneToOne: false
            referencedRelation: "construction_visualizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visualization_jobs: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          status: string
          steps: Json
          updated_at: string
          user_id: string
          visualization_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          status?: string
          steps?: Json
          updated_at?: string
          user_id: string
          visualization_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          status?: string
          steps?: Json
          updated_at?: string
          user_id?: string
          visualization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visualization_jobs_visualization_id_fkey"
            columns: ["visualization_id"]
            isOneToOne: false
            referencedRelation: "construction_visualizations"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          account_number: string
          admin_note: string | null
          amount: number
          approved_at: string | null
          id: string
          method: string
          paid_at: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          account_number: string
          admin_note?: string | null
          amount: number
          approved_at?: string | null
          id?: string
          method: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          account_number?: string
          admin_note?: string | null
          amount?: number
          approved_at?: string | null
          id?: string
          method?: string
          paid_at?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_project_invitation: { Args: { _token: string }; Returns: string }
      approve_payment: { Args: { _payment_id: string }; Returns: string }
      available_commission_balance: {
        Args: { _user_id: string }
        Returns: number
      }
      cancel_my_subscription: { Args: never; Returns: undefined }
      cancel_viz_job: { Args: { _job: string }; Returns: undefined }
      claim_referral: { Args: { _code: string }; Returns: string }
      decline_project_invitation: { Args: { _token: string }; Returns: boolean }
      generate_deadline_notifications: {
        Args: { _today?: string; _user?: string }
        Returns: number
      }
      generate_my_deadline_notifications: { Args: never; Returns: number }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      my_affiliate_stats: { Args: never; Returns: Json }
      record_referral_commission: {
        Args: { _payment_id: string }
        Returns: undefined
      }
      refresh_referral_totals: {
        Args: { _referral: string }
        Returns: undefined
      }
      reject_payment: {
        Args: { _note?: string; _payment_id: string }
        Returns: undefined
      }
      request_withdrawal: {
        Args: { _account_number: string; _amount: number; _method: string }
        Returns: string
      }
      review_commission: {
        Args: { _approve: boolean; _commission_id: string; _note?: string }
        Returns: undefined
      }
      try_uuid: { Args: { _t: string }; Returns: string }
      viz_can_read: { Args: { _user: string; _viz: string }; Returns: boolean }
      viz_can_write: { Args: { _user: string; _viz: string }; Returns: boolean }
      viz_role: { Args: { _user: string; _viz: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      project_role: "admin" | "engineer" | "viewer"
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
      app_role: ["admin", "user"],
      project_role: ["admin", "engineer", "viewer"],
    },
  },
} as const
