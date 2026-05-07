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
      activities: {
        Row: {
          action: string
          actor_id: string | null
          agency_id: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          agency_id: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          agency_id?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agencies: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          portal_domain: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          portal_domain?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          portal_domain?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      candidate_email_links: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          match_confidence: number
          match_strategy: Database["public"]["Enums"]["match_strategy"]
          matched_address: string | null
          message_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["match_status"]
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          match_confidence: number
          match_strategy: Database["public"]["Enums"]["match_strategy"]
          matched_address?: string | null
          message_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["match_status"]
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          match_confidence?: number
          match_strategy?: Database["public"]["Enums"]["match_strategy"]
          matched_address?: string | null
          message_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["match_status"]
        }
        Relationships: [
          {
            foreignKeyName: "candidate_email_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_email_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_email_links_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_pipeline_entries: {
        Row: {
          agency_id: string
          assigned_to: string | null
          candidate_id: string
          created_at: string | null
          entered_stage_at: string | null
          id: string
          job_id: string
          notes: string | null
          stage_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          candidate_id: string
          created_at?: string | null
          entered_stage_at?: string | null
          id?: string
          job_id: string
          notes?: string | null
          stage_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          candidate_id?: string
          created_at?: string | null
          entered_stage_at?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          stage_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_pipeline_entries_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_pipeline_entries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_pipeline_entries_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_pipeline_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_pipeline_entries_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          agency_id: string
          availability: string | null
          created_at: string | null
          created_by: string | null
          current_company: string | null
          current_title: string | null
          desired_salary_max: number | null
          desired_salary_min: number | null
          email: string | null
          embedding: string | null
          first_name: string
          github_url: string | null
          id: string
          last_name: string
          linkedin_url: string | null
          location: string | null
          notes: string | null
          phone: string | null
          portfolio_url: string | null
          resume_text: string | null
          resume_url: string | null
          skills: string[] | null
          source: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
          years_experience: number | null
        }
        Insert: {
          agency_id: string
          availability?: string | null
          created_at?: string | null
          created_by?: string | null
          current_company?: string | null
          current_title?: string | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email?: string | null
          embedding?: string | null
          first_name: string
          github_url?: string | null
          id?: string
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          skills?: string[] | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Update: {
          agency_id?: string
          availability?: string | null
          created_at?: string | null
          created_by?: string | null
          current_company?: string | null
          current_title?: string | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email?: string | null
          embedding?: string | null
          first_name?: string
          github_url?: string | null
          id?: string
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          portfolio_url?: string | null
          resume_text?: string | null
          resume_url?: string | null
          skills?: string[] | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          agency_id: string
          arr: number | null
          billing_address: Json | null
          contract_status: string | null
          created_at: string | null
          created_by: string | null
          hq_location: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          notes: string | null
          portal_slug: string | null
          portal_token: string | null
          size: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          agency_id: string
          arr?: number | null
          billing_address?: Json | null
          contract_status?: string | null
          created_at?: string | null
          created_by?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          portal_slug?: string | null
          portal_token?: string | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          agency_id?: string
          arr?: number | null
          billing_address?: Json | null
          contract_status?: string | null
          created_at?: string | null
          created_by?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          portal_slug?: string | null
          portal_token?: string | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          agency_id: string
          company_id: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          is_primary: boolean | null
          last_name: string
          linkedin_url: string | null
          notes: string | null
          phone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean | null
          last_name: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean | null
          last_name?: string
          linkedin_url?: string | null
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      education: {
        Row: {
          agency_id: string
          candidate_id: string
          created_at: string
          degree: string
          field: string
          grad_year: string
          id: string
          position: number
          school: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          candidate_id: string
          created_at?: string
          degree: string
          field: string
          grad_year: string
          id?: string
          position?: number
          school: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          candidate_id?: string
          created_at?: string
          degree?: string
          field?: string
          grad_year?: string
          id?: string
          position?: number
          school?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "education_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          agency_id: string
          bcc_addrs: string[]
          body_html_s3_key: string | null
          body_text_s3_key: string | null
          cc_addrs: string[]
          direction: Database["public"]["Enums"]["email_direction"]
          from_addr: string
          id: string
          internet_message_id: string | null
          labels_or_categories: string[]
          provider: Database["public"]["Enums"]["email_provider"]
          provider_message_id: string
          raw_headers_s3_key: string | null
          sent_at: string
          snippet: string | null
          subject: string | null
          thread_id: string
          to_addrs: string[]
          user_id: string
        }
        Insert: {
          agency_id: string
          bcc_addrs?: string[]
          body_html_s3_key?: string | null
          body_text_s3_key?: string | null
          cc_addrs?: string[]
          direction: Database["public"]["Enums"]["email_direction"]
          from_addr: string
          id?: string
          internet_message_id?: string | null
          labels_or_categories?: string[]
          provider: Database["public"]["Enums"]["email_provider"]
          provider_message_id: string
          raw_headers_s3_key?: string | null
          sent_at: string
          snippet?: string | null
          subject?: string | null
          thread_id: string
          to_addrs?: string[]
          user_id: string
        }
        Update: {
          agency_id?: string
          bcc_addrs?: string[]
          body_html_s3_key?: string | null
          body_text_s3_key?: string | null
          cc_addrs?: string[]
          direction?: Database["public"]["Enums"]["email_direction"]
          from_addr?: string
          id?: string
          internet_message_id?: string | null
          labels_or_categories?: string[]
          provider?: Database["public"]["Enums"]["email_provider"]
          provider_message_id?: string
          raw_headers_s3_key?: string | null
          sent_at?: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string
          to_addrs?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          agency_id: string
          first_msg_at: string | null
          id: string
          last_msg_at: string | null
          participant_count: number
          provider: Database["public"]["Enums"]["email_provider"]
          provider_thread_id: string
          subject: string | null
          user_id: string
        }
        Insert: {
          agency_id: string
          first_msg_at?: string | null
          id?: string
          last_msg_at?: string | null
          participant_count?: number
          provider: Database["public"]["Enums"]["email_provider"]
          provider_thread_id: string
          subject?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string
          first_msg_at?: string | null
          id?: string
          last_msg_at?: string | null
          participant_count?: number
          provider?: Database["public"]["Enums"]["email_provider"]
          provider_thread_id?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ikhaya_tenant_ms_tenants: {
        Row: {
          admin_consented: boolean
          admin_consented_at: string | null
          admin_consented_by_email: string | null
          ikhaya_agency_id: string
          ms_tenant_id: string
        }
        Insert: {
          admin_consented?: boolean
          admin_consented_at?: string | null
          admin_consented_by_email?: string | null
          ikhaya_agency_id: string
          ms_tenant_id: string
        }
        Update: {
          admin_consented?: boolean
          admin_consented_at?: string | null
          admin_consented_by_email?: string | null
          ikhaya_agency_id?: string
          ms_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ikhaya_tenant_ms_tenants_ikhaya_agency_id_fkey"
            columns: ["ikhaya_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          agency_id: string
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          employment_type: string | null
          fee_flat: number | null
          fee_pct: number | null
          fee_type: string | null
          filled_date: string | null
          headcount: number | null
          id: string
          location: string | null
          owner_id: string | null
          portal_visible: boolean | null
          priority: string | null
          remote_policy: string | null
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          status: string | null
          target_fill_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          employment_type?: string | null
          fee_flat?: number | null
          fee_pct?: number | null
          fee_type?: string | null
          filled_date?: string | null
          headcount?: number | null
          id?: string
          location?: string | null
          owner_id?: string | null
          portal_visible?: boolean | null
          priority?: string | null
          remote_policy?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          target_fill_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          employment_type?: string | null
          fee_flat?: number | null
          fee_pct?: number | null
          fee_type?: string | null
          filled_date?: string | null
          headcount?: number | null
          id?: string
          location?: string | null
          owner_id?: string | null
          portal_visible?: boolean | null
          priority?: string | null
          remote_policy?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          target_fill_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          agency_id: string
          client_name: string | null
          color: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          job_id: string | null
          name: string
          position: number
          sla_days: number | null
        }
        Insert: {
          agency_id: string
          client_name?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          job_id?: string | null
          name: string
          position: number
          sla_days?: number | null
        }
        Update: {
          agency_id?: string
          client_name?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          job_id?: string | null
          name?: string
          position?: number
          sla_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          agency_id: string
          candidate_id: string
          company_id: string | null
          created_at: string | null
          fee_amount: number | null
          fee_pct: number | null
          guarantee_days: number | null
          guarantee_end_date: string | null
          id: string
          job_id: string
          notes: string | null
          placed_by: string | null
          salary: number | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          candidate_id: string
          company_id?: string | null
          created_at?: string | null
          fee_amount?: number | null
          fee_pct?: number | null
          guarantee_days?: number | null
          guarantee_end_date?: string | null
          id?: string
          job_id: string
          notes?: string | null
          placed_by?: string | null
          salary?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          candidate_id?: string
          company_id?: string | null
          created_at?: string | null
          fee_amount?: number | null
          fee_pct?: number | null
          guarantee_days?: number | null
          guarantee_end_date?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          placed_by?: string | null
          salary?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "placements_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_feedback: {
        Row: {
          agency_id: string
          candidate_id: string | null
          comment: string | null
          company_id: string
          created_at: string | null
          entry_id: string | null
          feedback_type: string | null
          id: string
          job_id: string | null
          rating: number | null
          submitted_by_email: string | null
          submitted_by_name: string | null
        }
        Insert: {
          agency_id: string
          candidate_id?: string | null
          comment?: string | null
          company_id: string
          created_at?: string | null
          entry_id?: string | null
          feedback_type?: string | null
          id?: string
          job_id?: string | null
          rating?: number | null
          submitted_by_email?: string | null
          submitted_by_name?: string | null
        }
        Update: {
          agency_id?: string
          candidate_id?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string | null
          entry_id?: string | null
          feedback_type?: string | null
          id?: string
          job_id?: string | null
          rating?: number | null
          submitted_by_email?: string | null
          submitted_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_feedback_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "candidate_pipeline_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_connections: {
        Row: {
          access_token_expires_at: string
          agency_id: string
          backfill_completed_at: string | null
          created_at: string
          delta_cursor: string | null
          email: string
          id: string
          ms_tenant_id: string | null
          provider: Database["public"]["Enums"]["email_provider"]
          provider_sub: string
          realtime_expires_at: string | null
          realtime_subscription_id: string | null
          refresh_token_secret_ref: string
          scopes: string[]
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_expires_at: string
          agency_id: string
          backfill_completed_at?: string | null
          created_at?: string
          delta_cursor?: string | null
          email: string
          id?: string
          ms_tenant_id?: string | null
          provider: Database["public"]["Enums"]["email_provider"]
          provider_sub: string
          realtime_expires_at?: string | null
          realtime_subscription_id?: string | null
          refresh_token_secret_ref: string
          scopes?: string[]
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_expires_at?: string
          agency_id?: string
          backfill_completed_at?: string | null
          created_at?: string
          delta_cursor?: string | null
          email?: string
          id?: string
          ms_tenant_id?: string | null
          provider?: Database["public"]["Enums"]["email_provider"]
          provider_sub?: string
          realtime_expires_at?: string | null
          realtime_subscription_id?: string | null
          refresh_token_secret_ref?: string
          scopes?: string[]
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          agency_id: string
          created_at: string | null
          filters: Json
          id: string
          name: string
          query: string
          result_count: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          filters?: Json
          id?: string
          name: string
          query?: string
          result_count?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          filters?: Json
          id?: string
          name?: string
          query?: string
          result_count?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_events: {
        Row: {
          agency_id: string
          cursor_after: string | null
          cursor_before: string | null
          error_body: Json | null
          error_code: string | null
          event_type: string
          id: number
          matches_created: number
          messages_processed: number
          occurred_at: string
          provider: Database["public"]["Enums"]["email_provider"]
          user_id: string
        }
        Insert: {
          agency_id: string
          cursor_after?: string | null
          cursor_before?: string | null
          error_body?: Json | null
          error_code?: string | null
          event_type: string
          id?: number
          matches_created?: number
          messages_processed?: number
          occurred_at?: string
          provider: Database["public"]["Enums"]["email_provider"]
          user_id: string
        }
        Update: {
          agency_id?: string
          cursor_after?: string | null
          cursor_before?: string | null
          error_body?: Json | null
          error_code?: string | null
          event_type?: string
          id?: number
          matches_created?: number
          messages_processed?: number
          occurred_at?: string
          provider?: Database["public"]["Enums"]["email_provider"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agency_id: string
          assignee_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          entity_id: string
          entity_type: string
          id: string
          priority: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          entity_id: string
          entity_type: string
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          agency_id: string
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          phone: string | null
          role: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          last_login_at?: string | null
          phone?: string | null
          role: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          phone?: string | null
          role?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_history: {
        Row: {
          agency_id: string
          bullets: Json
          candidate_id: string
          company: string
          created_at: string
          end_date: string | null
          id: string
          location: string | null
          position: number
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          bullets?: Json
          candidate_id: string
          company: string
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          position?: number
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          bullets?: Json
          candidate_id?: string
          company?: string
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          position?: number
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_agency_id: { Args: never; Returns: string }
      job_funnel_stats: {
        Args: { p_agency_id: string; p_job_id: string }
        Returns: {
          avg_days_in_stage: number
          candidate_count: number
          client_name: string
          color: string
          stage_id: string
          stage_name: string
          stage_position: number
        }[]
      }
      match_candidates: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_agency_id: string
          query_embedding: string
        }
        Returns: {
          current_company: string
          current_title: string
          email: string
          first_name: string
          id: string
          last_name: string
          location: string
          similarity: number
          skills: string[]
          status: string
          years_experience: number
        }[]
      }
      search_candidates: {
        Args: {
          p_agency_id: string
          p_limit?: number
          p_offset?: number
          p_query: string
          p_skills?: string[]
          p_status?: string
        }
        Returns: {
          current_company: string
          current_title: string
          email: string
          first_name: string
          id: string
          last_name: string
          location: string
          rank: number
          skills: string[]
          status: string
          years_experience: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      email_direction: "inbound" | "outbound"
      email_provider: "google" | "microsoft"
      match_status: "active" | "pending_review" | "rejected"
      match_strategy: "exact" | "alt" | "thread" | "fuzzy"
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
  public: {
    Enums: {
      email_direction: ["inbound", "outbound"],
      email_provider: ["google", "microsoft"],
      match_status: ["active", "pending_review", "rejected"],
      match_strategy: ["exact", "alt", "thread", "fuzzy"],
    },
  },
} as const
