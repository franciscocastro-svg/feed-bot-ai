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
      account_settings: {
        Row: {
          ai_tone: string | null
          auto_approve: boolean | null
          brand_handle: string | null
          brand_logo_url: string | null
          brand_name: string | null
          created_at: string
          default_feed_template_id: string | null
          default_image_style: Database["public"]["Enums"]["image_style"] | null
          default_media_type: string | null
          default_niche: string | null
          default_reel_template_id: string | null
          default_story_template_id: string | null
          default_template_id: string | null
          id: string
          instagram_account_id: string
          max_posts_per_day: number | null
          min_post_interval_minutes: number | null
          preferred_post_hours: number[] | null
          reel_audio_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_tone?: string | null
          auto_approve?: boolean | null
          brand_handle?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          default_feed_template_id?: string | null
          default_image_style?:
            | Database["public"]["Enums"]["image_style"]
            | null
          default_media_type?: string | null
          default_niche?: string | null
          default_reel_template_id?: string | null
          default_story_template_id?: string | null
          default_template_id?: string | null
          id?: string
          instagram_account_id: string
          max_posts_per_day?: number | null
          min_post_interval_minutes?: number | null
          preferred_post_hours?: number[] | null
          reel_audio_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_tone?: string | null
          auto_approve?: boolean | null
          brand_handle?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          default_feed_template_id?: string | null
          default_image_style?:
            | Database["public"]["Enums"]["image_style"]
            | null
          default_media_type?: string | null
          default_niche?: string | null
          default_reel_template_id?: string | null
          default_story_template_id?: string | null
          default_template_id?: string | null
          id?: string
          instagram_account_id?: string
          max_posts_per_day?: number | null
          min_post_interval_minutes?: number | null
          preferred_post_hours?: number[] | null
          reel_audio_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_settings_default_feed_template_id_post_templates_fkey"
            columns: ["default_feed_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_settings_default_reel_template_id_post_templates_fkey"
            columns: ["default_reel_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_settings_default_story_template_id_post_templates_fkey"
            columns: ["default_story_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_settings_default_template_id_post_templates_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_expenses: {
        Row: {
          amount_brl: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          recurring: boolean
          spent_at: string
          updated_at: string
        }
        Insert: {
          amount_brl: number
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          recurring?: boolean
          spent_at?: string
          updated_at?: string
        }
        Update: {
          amount_brl?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          recurring?: boolean
          spent_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          created_at: string
          full_access: boolean
          sections: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_access?: boolean
          sections?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_access?: boolean
          sections?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_rewrite_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          hits: number
          last_hit_at: string
          payload: Json
          source_url: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          hits?: number
          last_hit_at?: string
          payload: Json
          source_url?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          hits?: number
          last_hit_at?: string
          payload?: Json
          source_url?: string | null
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          completion_tokens: number
          created_at: string
          estimated_cost_usd: number
          http_status: number | null
          id: string
          latency_ms: number | null
          metadata: Json
          model: string
          operation: string
          prompt_tokens: number
          provider: string
          success: boolean
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          estimated_cost_usd?: number
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model: string
          operation?: string
          prompt_tokens?: number
          provider: string
          success?: boolean
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          estimated_cost_usd?: number
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string
          operation?: string
          prompt_tokens?: number
          provider?: string
          success?: boolean
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      channel_settings: {
        Row: {
          active: boolean
          allowed_hours: number[]
          channel: string
          created_at: string
          id: string
          is_priority: boolean
          keywords: string[]
          max_per_day: number
          min_interval_minutes: number
          updated_at: string
          urgent_keywords: string[]
          user_id: string
        }
        Insert: {
          active?: boolean
          allowed_hours?: number[]
          channel: string
          created_at?: string
          id?: string
          is_priority?: boolean
          keywords?: string[]
          max_per_day?: number
          min_interval_minutes?: number
          updated_at?: string
          urgent_keywords?: string[]
          user_id: string
        }
        Update: {
          active?: boolean
          allowed_hours?: number[]
          channel?: string
          created_at?: string
          id?: string
          is_priority?: boolean
          keywords?: string[]
          max_per_day?: number
          min_interval_minutes?: number
          updated_at?: string
          urgent_keywords?: string[]
          user_id?: string
        }
        Relationships: []
      }
      content_topics: {
        Row: {
          active: boolean
          call_to_action: string | null
          content_pillar: string | null
          created_at: string
          evergreen: boolean
          formats: string[]
          frequency_per_week: number
          funnel_stage: string
          id: string
          instagram_account_id: string | null
          keywords: string[]
          last_used_at: string | null
          notes: string | null
          objective: string
          preferred_days: number[]
          priority: number
          source_type: string
          target_audience: string | null
          title: string
          tone: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          active?: boolean
          call_to_action?: string | null
          content_pillar?: string | null
          created_at?: string
          evergreen?: boolean
          formats?: string[]
          frequency_per_week?: number
          funnel_stage?: string
          id?: string
          instagram_account_id?: string | null
          keywords?: string[]
          last_used_at?: string | null
          notes?: string | null
          objective?: string
          preferred_days?: number[]
          priority?: number
          source_type?: string
          target_audience?: string | null
          title: string
          tone?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          active?: boolean
          call_to_action?: string | null
          content_pillar?: string | null
          created_at?: string
          evergreen?: boolean
          formats?: string[]
          frequency_per_week?: number
          funnel_stage?: string
          id?: string
          instagram_account_id?: string | null
          keywords?: string[]
          last_used_at?: string | null
          notes?: string | null
          objective?: string
          preferred_days?: number[]
          priority?: number
          source_type?: string
          target_audience?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      creator_profiles: {
        Row: {
          created_at: string
          cta_style: string | null
          example_posts: string[]
          expertise_summary: string | null
          extra_notes: string | null
          forbidden_words: string[]
          id: string
          niche_detail: string | null
          signature_phrases: string[]
          target_audience: string | null
          updated_at: string
          user_id: string
          voice_tone: string | null
        }
        Insert: {
          created_at?: string
          cta_style?: string | null
          example_posts?: string[]
          expertise_summary?: string | null
          extra_notes?: string | null
          forbidden_words?: string[]
          id?: string
          niche_detail?: string | null
          signature_phrases?: string[]
          target_audience?: string | null
          updated_at?: string
          user_id: string
          voice_tone?: string | null
        }
        Update: {
          created_at?: string
          cta_style?: string | null
          example_posts?: string[]
          expertise_summary?: string | null
          extra_notes?: string | null
          forbidden_words?: string[]
          id?: string
          niche_detail?: string | null
          signature_phrases?: string[]
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          voice_tone?: string | null
        }
        Relationships: []
      }
      data_deletion_requests: {
        Row: {
          account_ids: string[]
          completed_at: string | null
          confirmation_code: string
          details: Json
          meta_user_id: string
          requested_at: string
          status: string
        }
        Insert: {
          account_ids?: string[]
          completed_at?: string | null
          confirmation_code: string
          details?: Json
          meta_user_id: string
          requested_at?: string
          status?: string
        }
        Update: {
          account_ids?: string[]
          completed_at?: string | null
          confirmation_code?: string
          details?: Json
          meta_user_id?: string
          requested_at?: string
          status?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          audience: string
          body: string
          campaign_type: string
          created_at: string
          created_by: string
          cta_label: string | null
          cta_url: string | null
          error_message: string | null
          heading: string
          id: string
          name: string
          preview_text: string | null
          provider_broadcast_id: string | null
          provider_segment_id: string | null
          recipient_count: number
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          campaign_type?: string
          created_at?: string
          created_by: string
          cta_label?: string | null
          cta_url?: string | null
          error_message?: string | null
          heading: string
          id?: string
          name: string
          preview_text?: string | null
          provider_broadcast_id?: string | null
          provider_segment_id?: string | null
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          campaign_type?: string
          created_at?: string
          created_by?: string
          cta_label?: string | null
          cta_url?: string | null
          error_message?: string | null
          heading?: string
          id?: string
          name?: string
          preview_text?: string | null
          provider_broadcast_id?: string | null
          provider_segment_id?: string | null
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      email_verification_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      follower_snapshots: {
        Row: {
          captured_at: string
          followers_count: number
          follows_count: number | null
          id: string
          instagram_account_id: string
          media_count: number | null
          user_id: string
        }
        Insert: {
          captured_at?: string
          followers_count: number
          follows_count?: number | null
          id?: string
          instagram_account_id: string
          media_count?: number | null
          user_id: string
        }
        Update: {
          captured_at?: string
          followers_count?: number
          follows_count?: number | null
          id?: string
          instagram_account_id?: string
          media_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follower_snapshots_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          access_token: string | null
          active: boolean
          created_at: string
          custom_hashtags: string[]
          id: string
          ig_user_id: string | null
          last_verified_at: string | null
          niche: string | null
          page_id: string | null
          token_expires_at: string | null
          token_secret_id: string | null
          updated_at: string
          user_id: string
          username: string
          verification_status: string | null
        }
        Insert: {
          access_token?: string | null
          active?: boolean
          created_at?: string
          custom_hashtags?: string[]
          id?: string
          ig_user_id?: string | null
          last_verified_at?: string | null
          niche?: string | null
          page_id?: string | null
          token_expires_at?: string | null
          token_secret_id?: string | null
          updated_at?: string
          user_id: string
          username: string
          verification_status?: string | null
        }
        Update: {
          access_token?: string | null
          active?: boolean
          created_at?: string
          custom_hashtags?: string[]
          id?: string
          ig_user_id?: string | null
          last_verified_at?: string | null
          niche?: string | null
          page_id?: string | null
          token_expires_at?: string | null
          token_secret_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          verification_status?: string | null
        }
        Relationships: []
      }
      meta_api_usage: {
        Row: {
          app_call_count: number
          app_total_cputime: number
          app_total_time: number
          buc_call_count: number
          buc_estimated_time_to_regain_access: number
          buc_total_cputime: number
          buc_total_time: number
          captured_at: string
          created_at: string
          id: string
          instagram_account_id: string
          max_usage_percent: number
          raw_app_usage: Json | null
          raw_buc_usage: Json | null
          user_id: string
        }
        Insert: {
          app_call_count?: number
          app_total_cputime?: number
          app_total_time?: number
          buc_call_count?: number
          buc_estimated_time_to_regain_access?: number
          buc_total_cputime?: number
          buc_total_time?: number
          captured_at?: string
          created_at?: string
          id?: string
          instagram_account_id: string
          max_usage_percent?: number
          raw_app_usage?: Json | null
          raw_buc_usage?: Json | null
          user_id: string
        }
        Update: {
          app_call_count?: number
          app_total_cputime?: number
          app_total_time?: number
          buc_call_count?: number
          buc_estimated_time_to_regain_access?: number
          buc_total_cputime?: number
          buc_total_time?: number
          captured_at?: string
          created_at?: string
          id?: string
          instagram_account_id?: string
          max_usage_percent?: number
          raw_app_usage?: Json | null
          raw_buc_usage?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          caption: string | null
          chosen_audio_track_id: string | null
          chosen_audio_url: string | null
          content_format: string | null
          content_type: string
          created_at: string
          dedupe_title_key: string | null
          dedupe_url_key: string | null
          editorial_ready: boolean
          error_message: string | null
          generated_cover_url: string | null
          generated_image_url: string | null
          generated_reel_cover_url: string | null
          generated_video_url: string | null
          hashtags: string[] | null
          id: string
          image_style: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id: string | null
          next_retry_at: string | null
          niche: string | null
          original_canonical_url: string | null
          original_content: string | null
          original_image_url: string | null
          original_title: string
          original_url: string
          published_at: string | null
          reel_caption: string | null
          retry_count: number
          rewritten_summary: string | null
          rewritten_title: string | null
          source_id: string | null
          source_name: string | null
          status: Database["public"]["Enums"]["news_status"]
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          chosen_audio_track_id?: string | null
          chosen_audio_url?: string | null
          content_format?: string | null
          content_type?: string
          created_at?: string
          dedupe_title_key?: string | null
          dedupe_url_key?: string | null
          editorial_ready?: boolean
          error_message?: string | null
          generated_cover_url?: string | null
          generated_image_url?: string | null
          generated_reel_cover_url?: string | null
          generated_video_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_style?: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id?: string | null
          next_retry_at?: string | null
          niche?: string | null
          original_canonical_url?: string | null
          original_content?: string | null
          original_image_url?: string | null
          original_title: string
          original_url: string
          published_at?: string | null
          reel_caption?: string | null
          retry_count?: number
          rewritten_summary?: string | null
          rewritten_title?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: Database["public"]["Enums"]["news_status"]
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          chosen_audio_track_id?: string | null
          chosen_audio_url?: string | null
          content_format?: string | null
          content_type?: string
          created_at?: string
          dedupe_title_key?: string | null
          dedupe_url_key?: string | null
          editorial_ready?: boolean
          error_message?: string | null
          generated_cover_url?: string | null
          generated_image_url?: string | null
          generated_reel_cover_url?: string | null
          generated_video_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_style?: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id?: string | null
          next_retry_at?: string | null
          niche?: string | null
          original_canonical_url?: string | null
          original_content?: string | null
          original_image_url?: string | null
          original_title?: string
          original_url?: string
          published_at?: string | null
          reel_caption?: string | null
          retry_count?: number
          rewritten_summary?: string | null
          rewritten_title?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: Database["public"]["Enums"]["news_status"]
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_source_instagram_accounts: {
        Row: {
          created_at: string
          instagram_account_id: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          instagram_account_id: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          instagram_account_id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          active: boolean
          country: string
          created_at: string
          cultural_adaptation: boolean
          exclude_terms: string[]
          fetch_interval_minutes: number
          id: string
          include_terms: string[]
          language: string
          last_error: string | null
          last_error_at: string | null
          last_fetched_at: string | null
          last_items_created: number
          last_items_found: number
          last_new_item_at: string | null
          last_run_summary: Json
          last_success_at: string | null
          name: string
          niche: string | null
          quality_score: number
          query: string | null
          source_config: Json
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_language: string
          source_type: Database["public"]["Enums"]["source_type"]
          translate_to_pt: boolean
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          country?: string
          created_at?: string
          cultural_adaptation?: boolean
          exclude_terms?: string[]
          fetch_interval_minutes?: number
          id?: string
          include_terms?: string[]
          language?: string
          last_error?: string | null
          last_error_at?: string | null
          last_fetched_at?: string | null
          last_items_created?: number
          last_items_found?: number
          last_new_item_at?: string | null
          last_run_summary?: Json
          last_success_at?: string | null
          name: string
          niche?: string | null
          quality_score?: number
          query?: string | null
          source_config?: Json
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_language?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          translate_to_pt?: boolean
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          cultural_adaptation?: boolean
          exclude_terms?: string[]
          fetch_interval_minutes?: number
          id?: string
          include_terms?: string[]
          language?: string
          last_error?: string | null
          last_error_at?: string | null
          last_fetched_at?: string | null
          last_items_created?: number
          last_items_found?: number
          last_new_item_at?: string | null
          last_run_summary?: Json
          last_success_at?: string | null
          name?: string
          niche?: string | null
          quality_score?: number
          query?: string | null
          source_config?: Json
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_language?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          translate_to_pt?: boolean
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_limits: {
        Row: {
          auto_publish_enabled: boolean
          created_at: string
          display_name: string
          is_negotiable: boolean
          max_cut_video_minutes: number
          max_cuts_per_day: number
          max_cuts_per_job: number
          max_ig_accounts: number
          max_images_per_month: number
          max_posts_per_day: number
          max_reels_per_month: number
          max_rss_sources: number
          max_templates: number
          plan: string
          price_brl: number | null
          sort_order: number
          support_level: string
          translation_enabled: boolean
          trial_days: number | null
          updated_at: string
        }
        Insert: {
          auto_publish_enabled?: boolean
          created_at?: string
          display_name: string
          is_negotiable?: boolean
          max_cut_video_minutes?: number
          max_cuts_per_day?: number
          max_cuts_per_job?: number
          max_ig_accounts: number
          max_images_per_month: number
          max_posts_per_day: number
          max_reels_per_month: number
          max_rss_sources: number
          max_templates: number
          plan: string
          price_brl?: number | null
          sort_order?: number
          support_level?: string
          translation_enabled?: boolean
          trial_days?: number | null
          updated_at?: string
        }
        Update: {
          auto_publish_enabled?: boolean
          created_at?: string
          display_name?: string
          is_negotiable?: boolean
          max_cut_video_minutes?: number
          max_cuts_per_day?: number
          max_cuts_per_job?: number
          max_ig_accounts?: number
          max_images_per_month?: number
          max_posts_per_day?: number
          max_reels_per_month?: number
          max_rss_sources?: number
          max_templates?: number
          plan?: string
          price_brl?: number | null
          sort_order?: number
          support_level?: string
          translation_enabled?: boolean
          trial_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      post_templates: {
        Row: {
          background_url: string | null
          config: Json
          created_at: string
          format: string
          id: string
          is_default: boolean
          kind: string
          name: string
          preset_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          background_url?: string | null
          config?: Json
          created_at?: string
          format?: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          preset_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          background_url?: string | null
          config?: Json
          created_at?: string
          format?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          preset_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          marketing_consent: boolean
          marketing_consent_at: string | null
          marketing_unsubscribed_at: string | null
          state: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_unsubscribed_at?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_unsubscribed_at?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      reel_audio_tracks: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_url: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_url: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_url?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_render_jobs: {
        Row: {
          attempts: number
          audio_url: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          cover_url: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          news_item_id: string
          output_url: string | null
          scheduled_post_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          audio_url?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          cover_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          news_item_id: string
          output_url?: string | null
          scheduled_post_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          audio_url?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          cover_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          news_item_id?: string
          output_url?: string | null
          scheduled_post_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      release_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          highlight: boolean
          id: string
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          highlight?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          highlight?: boolean
          id?: string
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          comments: number | null
          container_created_at: string | null
          container_last_checked_at: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_creation_id: string | null
          ig_media_id: string | null
          impressions: number | null
          insights_updated_at: string | null
          instagram_account_id: string | null
          likes: number | null
          media_type: string
          news_item_id: string
          permalink: string | null
          posted_at: string | null
          reach: number | null
          retry_count: number
          saves: number | null
          scheduled_for: string
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          comments?: number | null
          container_created_at?: string | null
          container_last_checked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_creation_id?: string | null
          ig_media_id?: string | null
          impressions?: number | null
          insights_updated_at?: string | null
          instagram_account_id?: string | null
          likes?: number | null
          media_type?: string
          news_item_id: string
          permalink?: string | null
          posted_at?: string | null
          reach?: number | null
          retry_count?: number
          saves?: number | null
          scheduled_for: string
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          comments?: number | null
          container_created_at?: string | null
          container_last_checked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_creation_id?: string | null
          ig_media_id?: string | null
          impressions?: number | null
          insights_updated_at?: string | null
          instagram_account_id?: string | null
          likes?: number | null
          media_type?: string
          news_item_id?: string
          permalink?: string | null
          posted_at?: string | null
          reach?: number | null
          retry_count?: number
          saves?: number | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      source_fetch_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          diagnostics: Json
          duration_ms: number
          error_message: string | null
          id: string
          items_after_freshness: number
          items_after_relevance: number
          items_created: number
          items_duplicates: number
          items_found: number
          items_without_image: number
          sample_items: Json
          source_id: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_name: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          diagnostics?: Json
          duration_ms?: number
          error_message?: string | null
          id?: string
          items_after_freshness?: number
          items_after_relevance?: number
          items_created?: number
          items_duplicates?: number
          items_found?: number
          items_without_image?: number
          sample_items?: Json
          source_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_name?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          diagnostics?: Json
          duration_ms?: number
          error_message?: string | null
          id?: string
          items_after_freshness?: number
          items_after_relevance?: number
          items_created?: number
          items_duplicates?: number
          items_found?: number
          items_without_image?: number
          sample_items?: Json
          source_id?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_name?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_fetch_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          audio_duration_seconds: number | null
          audio_url: string | null
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          audio_duration_seconds?: number | null
          audio_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Update: {
          audio_duration_seconds?: number | null
          audio_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_sender_role: string
          status: string
          subject: string
          unread_for_admin: boolean
          unread_for_user: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_sender_role?: string
          status?: string
          subject: string
          unread_for_admin?: boolean
          unread_for_user?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_sender_role?: string
          status?: string
          subject?: string
          unread_for_admin?: boolean
          unread_for_user?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          created_at: string
          id: string
          images_generated: number
          period_month: string
          reels_generated: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          images_generated?: number
          period_month: string
          reels_generated?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          images_generated?: number
          period_month?: string
          reels_generated?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_release_views: {
        Row: {
          id: string
          release_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          release_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          release_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_release_views_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "release_notes"
            referencedColumns: ["id"]
          },
        ]
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
      user_settings: {
        Row: {
          ai_tone: string | null
          auto_approve: boolean
          auto_approve_enabled_at: string | null
          brand_handle: string | null
          brand_logo_url: string | null
          brand_name: string | null
          created_at: string
          default_feed_template_id: string | null
          default_image_style: Database["public"]["Enums"]["image_style"]
          default_media_type: string
          default_niche: string | null
          default_reel_template_id: string | null
          default_story_template_id: string | null
          default_template_id: string | null
          max_posts_per_day: number
          meta_usage_pause_threshold: number
          min_post_interval_minutes: number
          preferred_post_hours: number[] | null
          reel_audio_url: string | null
          topics_enabled: boolean
          topics_posts_per_day: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_tone?: string | null
          auto_approve?: boolean
          auto_approve_enabled_at?: string | null
          brand_handle?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          default_feed_template_id?: string | null
          default_image_style?: Database["public"]["Enums"]["image_style"]
          default_media_type?: string
          default_niche?: string | null
          default_reel_template_id?: string | null
          default_story_template_id?: string | null
          default_template_id?: string | null
          max_posts_per_day?: number
          meta_usage_pause_threshold?: number
          min_post_interval_minutes?: number
          preferred_post_hours?: number[] | null
          reel_audio_url?: string | null
          topics_enabled?: boolean
          topics_posts_per_day?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_tone?: string | null
          auto_approve?: boolean
          auto_approve_enabled_at?: string | null
          brand_handle?: string | null
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          default_feed_template_id?: string | null
          default_image_style?: Database["public"]["Enums"]["image_style"]
          default_media_type?: string
          default_niche?: string | null
          default_reel_template_id?: string | null
          default_story_template_id?: string | null
          default_template_id?: string | null
          max_posts_per_day?: number
          meta_usage_pause_threshold?: number
          min_post_interval_minutes?: number
          preferred_post_hours?: number[] | null
          reel_audio_url?: string | null
          topics_enabled?: boolean
          topics_posts_per_day?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_default_feed_template_id_post_templates_fkey"
            columns: ["default_feed_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_default_reel_template_id_post_templates_fkey"
            columns: ["default_reel_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_default_story_template_id_post_templates_fkey"
            columns: ["default_story_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_default_template_id_post_templates_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "post_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          approval_reason: string | null
          approval_status: string
          approved_at: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          expires_at: string | null
          id: string
          last_code_sent_at: string | null
          notes: string | null
          plan: string
          price_id: string | null
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
          verification_attempts: number
          verification_blocked_until: string | null
        }
        Insert: {
          approval_reason?: string | null
          approval_status?: string
          approved_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          last_code_sent_at?: string | null
          notes?: string | null
          plan?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
          verification_attempts?: number
          verification_blocked_until?: string | null
        }
        Update: {
          approval_reason?: string | null
          approval_status?: string
          approved_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          last_code_sent_at?: string | null
          notes?: string | null
          plan?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
          verification_attempts?: number
          verification_blocked_until?: string | null
        }
        Relationships: []
      }
      video_cut_brand_profiles: {
        Row: {
          created_at: string
          default_preset_key: string
          font_family: string
          highlight_color: string
          instagram_account_id: string
          outline_color: string
          primary_color: string
          subtitle_position: string
          updated_at: string
          user_id: string
          watermark_enabled: boolean
          watermark_text: string | null
        }
        Insert: {
          created_at?: string
          default_preset_key?: string
          font_family?: string
          highlight_color?: string
          instagram_account_id: string
          outline_color?: string
          primary_color?: string
          subtitle_position?: string
          updated_at?: string
          user_id: string
          watermark_enabled?: boolean
          watermark_text?: string | null
        }
        Update: {
          created_at?: string
          default_preset_key?: string
          font_family?: string
          highlight_color?: string
          instagram_account_id?: string
          outline_color?: string
          primary_color?: string
          subtitle_position?: string
          updated_at?: string
          user_id?: string
          watermark_enabled?: boolean
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_cut_brand_profiles_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: true
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_cut_clips: {
        Row: {
          caption: string | null
          clarity_score: number | null
          clip_index: number
          created_at: string
          duration_seconds: number
          edit_config: Json
          emotion_score: number | null
          end_seconds: number
          error_message: string | null
          format: string
          hashtags: string[]
          hook: string | null
          hook_score: number | null
          hook_text: string | null
          id: string
          instagram_account_id: string
          job_id: string
          news_item_id: string | null
          provider_trace: Json
          quality_report: Json
          reason: string | null
          render_version: number
          scheduled_post_id: string | null
          score: number
          start_seconds: number
          status: string
          subtitle_error: boolean
          subtitle_style: string
          thumbnail_url: string | null
          title: string | null
          transcript: Json | null
          transcript_text: string | null
          updated_at: string
          user_id: string
          video_url: string | null
          viral_score: number | null
        }
        Insert: {
          caption?: string | null
          clarity_score?: number | null
          clip_index: number
          created_at?: string
          duration_seconds?: number
          edit_config?: Json
          emotion_score?: number | null
          end_seconds?: number
          error_message?: string | null
          format?: string
          hashtags?: string[]
          hook?: string | null
          hook_score?: number | null
          hook_text?: string | null
          id?: string
          instagram_account_id: string
          job_id: string
          news_item_id?: string | null
          provider_trace?: Json
          quality_report?: Json
          reason?: string | null
          render_version?: number
          scheduled_post_id?: string | null
          score?: number
          start_seconds?: number
          status?: string
          subtitle_error?: boolean
          subtitle_style?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: Json | null
          transcript_text?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
          viral_score?: number | null
        }
        Update: {
          caption?: string | null
          clarity_score?: number | null
          clip_index?: number
          created_at?: string
          duration_seconds?: number
          edit_config?: Json
          emotion_score?: number | null
          end_seconds?: number
          error_message?: string | null
          format?: string
          hashtags?: string[]
          hook?: string | null
          hook_score?: number | null
          hook_text?: string | null
          id?: string
          instagram_account_id?: string
          job_id?: string
          news_item_id?: string | null
          provider_trace?: Json
          quality_report?: Json
          reason?: string | null
          render_version?: number
          scheduled_post_id?: string | null
          score?: number
          start_seconds?: number
          status?: string
          subtitle_error?: boolean
          subtitle_style?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: Json | null
          transcript_text?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
          viral_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_cut_clips_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_cut_clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_cut_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_cut_clips_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_cut_clips_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_cut_jobs: {
        Row: {
          analysis: Json
          analysis_mode: string | null
          analysis_warning: string | null
          attempts: number
          auto_publish: boolean
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          custom_prompt: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_required: boolean
          format: string
          formats: string[] | null
          generated_clips: number
          hook_enabled: boolean
          id: string
          instagram_account_id: string
          local_file_name: string | null
          local_file_size_bytes: number | null
          local_render_expires_at: string | null
          max_attempts: number
          preset_key: string
          processing_mode: string
          progress: number
          provider_trace: Json
          remove_silences: boolean
          requested_clips: number
          reserved_clips: number
          rights_confirmed: boolean
          smart_crop: boolean
          source_expires_at: string
          source_file_name: string | null
          source_kind: string
          source_storage_bucket: string | null
          source_storage_path: string | null
          source_title: string | null
          source_video_url: string | null
          started_at: string | null
          status: string
          subtitle_style: string
          updated_at: string
          user_id: string
          youtube_url: string
          zoom_effect: boolean
        }
        Insert: {
          analysis?: Json
          analysis_mode?: string | null
          analysis_warning?: string | null
          attempts?: number
          auto_publish?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          custom_prompt?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          fallback_required?: boolean
          format?: string
          formats?: string[] | null
          generated_clips?: number
          hook_enabled?: boolean
          id?: string
          instagram_account_id: string
          local_file_name?: string | null
          local_file_size_bytes?: number | null
          local_render_expires_at?: string | null
          max_attempts?: number
          preset_key?: string
          processing_mode?: string
          progress?: number
          provider_trace?: Json
          remove_silences?: boolean
          requested_clips?: number
          reserved_clips?: number
          rights_confirmed?: boolean
          smart_crop?: boolean
          source_expires_at?: string
          source_file_name?: string | null
          source_kind?: string
          source_storage_bucket?: string | null
          source_storage_path?: string | null
          source_title?: string | null
          source_video_url?: string | null
          started_at?: string | null
          status?: string
          subtitle_style?: string
          updated_at?: string
          user_id: string
          youtube_url: string
          zoom_effect?: boolean
        }
        Update: {
          analysis?: Json
          analysis_mode?: string | null
          analysis_warning?: string | null
          attempts?: number
          auto_publish?: boolean
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          custom_prompt?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          fallback_required?: boolean
          format?: string
          formats?: string[] | null
          generated_clips?: number
          hook_enabled?: boolean
          id?: string
          instagram_account_id?: string
          local_file_name?: string | null
          local_file_size_bytes?: number | null
          local_render_expires_at?: string | null
          max_attempts?: number
          preset_key?: string
          processing_mode?: string
          progress?: number
          provider_trace?: Json
          remove_silences?: boolean
          requested_clips?: number
          reserved_clips?: number
          rights_confirmed?: boolean
          smart_crop?: boolean
          source_expires_at?: string
          source_file_name?: string | null
          source_kind?: string
          source_storage_bucket?: string | null
          source_storage_path?: string | null
          source_title?: string | null
          source_video_url?: string | null
          started_at?: string | null
          status?: string
          subtitle_style?: string
          updated_at?: string
          user_id?: string
          youtube_url?: string
          zoom_effect?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "video_cut_jobs_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_cut_rerender_requests: {
        Row: {
          attempts: number
          clip_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          locked_at: string | null
          locked_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          clip_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          locked_at?: string | null
          locked_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          clip_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          locked_at?: string | null
          locked_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_cut_rerender_requests_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "video_cut_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_cut_rerender_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_cut_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_cut_usage_daily: {
        Row: {
          reserved_count: number
          updated_at: string
          usage_date: string
          used_count: number
          user_id: string
        }
        Insert: {
          reserved_count?: number
          updated_at?: string
          usage_date?: string
          used_count?: number
          user_id: string
        }
        Update: {
          reserved_count?: number
          updated_at?: string
          usage_date?: string
          used_count?: number
          user_id?: string
        }
        Relationships: []
      }
      worker_health: {
        Row: {
          capabilities: Json
          last_seen_at: string
          queue_mode: string
          version: string | null
          worker_id: string
        }
        Insert: {
          capabilities?: Json
          last_seen_at?: string
          queue_mode: string
          version?: string | null
          worker_id: string
        }
        Update: {
          capabilities?: Json
          last_seen_at?: string
          queue_mode?: string
          version?: string | null
          worker_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_ai_usage_daily: {
        Row: {
          average_latency_ms: number | null
          calls: number | null
          completion_tokens: number | null
          estimated_cost_usd: number | null
          failed_calls: number | null
          last_used_at: string | null
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          successful_calls: number | null
          total_tokens: number | null
          usage_day: string | null
        }
        Relationships: []
      }
      meta_api_usage_latest: {
        Row: {
          app_call_count: number | null
          app_total_cputime: number | null
          app_total_time: number | null
          buc_call_count: number | null
          buc_estimated_time_to_regain_access: number | null
          buc_total_cputime: number | null
          buc_total_time: number | null
          captured_at: string | null
          id: string | null
          instagram_account_id: string | null
          max_usage_percent: number | null
          raw_app_usage: Json | null
          raw_buc_usage: Json | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_user_details: { Args: { _uid: string }; Returns: Json }
      admin_has_permission: { Args: { _section: string }; Returns: boolean }
      admin_overview: {
        Args: never
        Returns: {
          approval_status: string
          auto_approve: boolean
          created_at: string
          display_name: string
          email: string
          expires_at: string
          ig_accounts: number
          ig_token_expires: string
          last_activity: string
          news_pending: number
          plan: string
          posts_failed: number
          posts_published: number
          posts_scheduled: number
          sources_active: number
          sub_status: string
          user_id: string
        }[]
      }
      can_create_resource: {
        Args: { _resource: string; _user_id: string }
        Returns: Json
      }
      can_manage_admin_permissions: { Args: never; Returns: boolean }
      check_and_increment_usage: {
        Args: { _resource: string; _user_id: string }
        Returns: Json
      }
      claim_expired_video_cut_sources: {
        Args: { _limit?: number }
        Returns: {
          bucket: string
          job_id: string
          storage_path: string
        }[]
      }
      claim_reel_jobs: {
        Args: { _limit?: number; _worker: string }
        Returns: {
          attempts: number
          audio_url: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          cover_url: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          news_item_id: string
          output_url: string | null
          scheduled_post_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reel_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_video_cut_jobs: {
        Args: { _limit?: number; _worker: string }
        Returns: {
          analysis: Json
          analysis_mode: string | null
          analysis_warning: string | null
          attempts: number
          auto_publish: boolean
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          custom_prompt: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_required: boolean
          format: string
          formats: string[] | null
          generated_clips: number
          hook_enabled: boolean
          id: string
          instagram_account_id: string
          local_file_name: string | null
          local_file_size_bytes: number | null
          local_render_expires_at: string | null
          max_attempts: number
          preset_key: string
          processing_mode: string
          progress: number
          provider_trace: Json
          remove_silences: boolean
          requested_clips: number
          reserved_clips: number
          rights_confirmed: boolean
          smart_crop: boolean
          source_expires_at: string
          source_file_name: string | null
          source_kind: string
          source_storage_bucket: string | null
          source_storage_path: string | null
          source_title: string | null
          source_video_url: string | null
          started_at: string | null
          status: string
          subtitle_style: string
          updated_at: string
          user_id: string
          youtube_url: string
          zoom_effect: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "video_cut_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_video_cut_rerenders: {
        Args: { _limit?: number; _worker: string }
        Returns: {
          attempts: number
          clip_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          locked_at: string | null
          locked_by: string | null
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "video_cut_rerender_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_local_video_cut_job: {
        Args: {
          _audio_storage_path: string
          _custom_prompt?: string
          _duration_seconds: number
          _format?: string
          _formats?: string[]
          _hook_enabled?: boolean
          _instagram_account_id: string
          _preset_key?: string
          _remove_silences?: boolean
          _requested_clips: number
          _rights_confirmed: boolean
          _smart_crop?: boolean
          _source_file_name: string
          _source_file_size_bytes: number
          _subtitle_style?: string
          _zoom_effect?: boolean
        }
        Returns: {
          analysis: Json
          analysis_mode: string | null
          analysis_warning: string | null
          attempts: number
          auto_publish: boolean
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          custom_prompt: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_required: boolean
          format: string
          formats: string[] | null
          generated_clips: number
          hook_enabled: boolean
          id: string
          instagram_account_id: string
          local_file_name: string | null
          local_file_size_bytes: number | null
          local_render_expires_at: string | null
          max_attempts: number
          preset_key: string
          processing_mode: string
          progress: number
          provider_trace: Json
          remove_silences: boolean
          requested_clips: number
          reserved_clips: number
          rights_confirmed: boolean
          smart_crop: boolean
          source_expires_at: string
          source_file_name: string | null
          source_kind: string
          source_storage_bucket: string | null
          source_storage_path: string | null
          source_title: string | null
          source_video_url: string | null
          started_at: string | null
          status: string
          subtitle_style: string
          updated_at: string
          user_id: string
          youtube_url: string
          zoom_effect: boolean
        }
        SetofOptions: {
          from: "*"
          to: "video_cut_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_video_cut_job:
        | {
            Args: {
              _instagram_account_id: string
              _requested_clips: number
              _rights_confirmed: boolean
              _youtube_url: string
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _format?: string
              _instagram_account_id: string
              _requested_clips: number
              _rights_confirmed: boolean
              _youtube_url: string
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _auto_publish?: boolean
              _format?: string
              _instagram_account_id: string
              _remove_silences?: boolean
              _requested_clips: number
              _rights_confirmed: boolean
              _smart_crop?: boolean
              _subtitle_style?: string
              _youtube_url: string
              _zoom_effect?: boolean
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _auto_publish?: boolean
              _format?: string
              _formats?: string[]
              _hook_enabled?: boolean
              _instagram_account_id: string
              _remove_silences?: boolean
              _requested_clips: number
              _rights_confirmed: boolean
              _smart_crop?: boolean
              _subtitle_style?: string
              _youtube_url: string
              _zoom_effect?: boolean
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_video_cut_upload_job:
        | {
            Args: {
              _instagram_account_id: string
              _requested_clips: number
              _rights_confirmed: boolean
              _source_title?: string
              _video_url: string
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _format?: string
              _instagram_account_id: string
              _requested_clips: number
              _rights_confirmed: boolean
              _source_title?: string
              _video_url: string
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _auto_publish?: boolean
              _format?: string
              _instagram_account_id: string
              _remove_silences?: boolean
              _requested_clips: number
              _rights_confirmed: boolean
              _smart_crop?: boolean
              _source_title?: string
              _subtitle_style?: string
              _video_url: string
              _zoom_effect?: boolean
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _auto_publish?: boolean
              _format?: string
              _formats?: string[]
              _hook_enabled?: boolean
              _instagram_account_id: string
              _remove_silences?: boolean
              _requested_clips: number
              _rights_confirmed: boolean
              _smart_crop?: boolean
              _source_title?: string
              _subtitle_style?: string
              _video_url: string
              _zoom_effect?: boolean
            }
            Returns: {
              analysis: Json
              analysis_mode: string | null
              analysis_warning: string | null
              attempts: number
              auto_publish: boolean
              claimed_at: string | null
              claimed_by: string | null
              completed_at: string | null
              created_at: string
              custom_prompt: string | null
              duration_seconds: number | null
              error_message: string | null
              fallback_required: boolean
              format: string
              formats: string[] | null
              generated_clips: number
              hook_enabled: boolean
              id: string
              instagram_account_id: string
              local_file_name: string | null
              local_file_size_bytes: number | null
              local_render_expires_at: string | null
              max_attempts: number
              preset_key: string
              processing_mode: string
              progress: number
              provider_trace: Json
              remove_silences: boolean
              requested_clips: number
              reserved_clips: number
              rights_confirmed: boolean
              smart_crop: boolean
              source_expires_at: string
              source_file_name: string | null
              source_kind: string
              source_storage_bucket: string | null
              source_storage_path: string | null
              source_title: string | null
              source_video_url: string | null
              started_at: string | null
              status: string
              subtitle_style: string
              updated_at: string
              user_id: string
              youtube_url: string
              zoom_effect: boolean
            }
            SetofOptions: {
              from: "*"
              to: "video_cut_jobs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_video_cut_upload_job_v2: {
        Args: {
          _auto_publish?: boolean
          _format?: string
          _formats?: string[]
          _hook_enabled?: boolean
          _instagram_account_id: string
          _remove_silences?: boolean
          _requested_clips: number
          _rights_confirmed: boolean
          _smart_crop?: boolean
          _source_title?: string
          _storage_path: string
          _subtitle_style?: string
          _zoom_effect?: boolean
        }
        Returns: {
          analysis: Json
          analysis_mode: string | null
          analysis_warning: string | null
          attempts: number
          auto_publish: boolean
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          custom_prompt: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_required: boolean
          format: string
          formats: string[] | null
          generated_clips: number
          hook_enabled: boolean
          id: string
          instagram_account_id: string
          local_file_name: string | null
          local_file_size_bytes: number | null
          local_render_expires_at: string | null
          max_attempts: number
          preset_key: string
          processing_mode: string
          progress: number
          provider_trace: Json
          remove_silences: boolean
          requested_clips: number
          reserved_clips: number
          rights_confirmed: boolean
          smart_crop: boolean
          source_expires_at: string
          source_file_name: string | null
          source_kind: string
          source_storage_bucket: string | null
          source_storage_path: string | null
          source_title: string | null
          source_video_url: string | null
          started_at: string | null
          status: string
          subtitle_style: string
          updated_at: string
          user_id: string
          youtube_url: string
          zoom_effect: boolean
        }
        SetofOptions: {
          from: "*"
          to: "video_cut_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_instagram_account_data: {
        Args: { _confirmation_code: string; _meta_user_id: string }
        Returns: Json
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_reel_render_job_for_post: {
        Args: { _scheduled_post_id: string }
        Returns: undefined
      }
      finalize_local_video_cut_job: {
        Args: { _job_id: string }
        Returns: boolean
      }
      finalize_video_cut_job_usage: {
        Args: { _generated_count?: number; _job_id: string }
        Returns: undefined
      }
      get_current_usage: {
        Args: { _user_id: string }
        Returns: {
          auto_publish_enabled: boolean
          cuts_limit: number
          cuts_reserved_today: number
          cuts_used_today: number
          display_name: string
          ig_accounts_limit: number
          ig_accounts_used: number
          images_limit: number
          images_used: number
          max_cut_video_minutes: number
          max_cuts_per_job: number
          plan: string
          posts_per_day_limit: number
          posts_today: number
          reels_limit: number
          reels_used: number
          rss_sources_limit: number
          rss_sources_used: number
          translation_enabled: boolean
        }[]
      }
      get_effective_account_settings: {
        Args: { _account_id: string }
        Returns: Json
      }
      get_instagram_account_secret: {
        Args: { _account_id: string }
        Returns: string
      }
      get_internal_cron_secret: { Args: never; Returns: string }
      get_media_worker_health: {
        Args: never
        Returns: {
          healthy: boolean
          last_seen_at: string
          queue_mode: string
          version: string
        }[]
      }
      get_subscription_status: {
        Args: { _user_id: string }
        Returns: {
          approval_status: string
          cancel_at_period_end: boolean
          current_period_end: string
          days_remaining: number
          effective_plan: string
          is_expired: boolean
          is_trial: boolean
          plan: string
          status: string
        }[]
      }
      get_unseen_releases: {
        Args: never
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          highlight: boolean
          id: string
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
          version: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "release_notes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_plan: { Args: { _user_id: string }; Returns: string }
      get_user_plan_limits: {
        Args: { _user_id: string }
        Returns: {
          auto_publish_enabled: boolean
          created_at: string
          display_name: string
          is_negotiable: boolean
          max_cut_video_minutes: number
          max_cuts_per_day: number
          max_cuts_per_job: number
          max_ig_accounts: number
          max_images_per_month: number
          max_posts_per_day: number
          max_reels_per_month: number
          max_rss_sources: number
          max_templates: number
          plan: string
          price_brl: number | null
          sort_order: number
          support_level: string
          translation_enabled: boolean
          trial_days: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "plan_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_video_cut_usage: {
        Args: { _user_id: string }
        Returns: {
          display_name: string
          max_cut_video_minutes: number
          max_cuts_per_day: number
          max_cuts_per_job: number
          plan: string
          reserved_today: number
          used_today: number
        }[]
      }
      has_active_entitlement: { Args: { _uid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: { _uid: string }; Returns: boolean }
      mark_pending_email_verification: {
        Args: { _user_id: string }
        Returns: boolean
      }
      mark_video_cut_source_deleted: {
        Args: { _job_id: string; _storage_path: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_dedupe_text: { Args: { _value: string }; Returns: string }
      normalize_dedupe_url: { Args: { _value: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      regenerate_video_cut_job: {
        Args: { _custom_prompt?: string; _job_id: string; _preset_key?: string }
        Returns: {
          analysis: Json
          analysis_mode: string | null
          analysis_warning: string | null
          attempts: number
          auto_publish: boolean
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          custom_prompt: string | null
          duration_seconds: number | null
          error_message: string | null
          fallback_required: boolean
          format: string
          formats: string[] | null
          generated_clips: number
          hook_enabled: boolean
          id: string
          instagram_account_id: string
          local_file_name: string | null
          local_file_size_bytes: number | null
          local_render_expires_at: string | null
          max_attempts: number
          preset_key: string
          processing_mode: string
          progress: number
          provider_trace: Json
          remove_silences: boolean
          requested_clips: number
          reserved_clips: number
          rights_confirmed: boolean
          smart_crop: boolean
          source_expires_at: string
          source_file_name: string | null
          source_kind: string
          source_storage_bucket: string | null
          source_storage_path: string | null
          source_title: string | null
          source_video_url: string | null
          started_at: string | null
          status: string
          subtitle_style: string
          updated_at: string
          user_id: string
          youtube_url: string
          zoom_effect: boolean
        }
        SetofOptions: {
          from: "*"
          to: "video_cut_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_video_cut_rerender: {
        Args: {
          _clip_id: string
          _end_seconds: number
          _hook_text?: string
          _start_seconds: number
          _subtitle_style: string
          _transcript_text?: string
        }
        Returns: string
      }
      set_account_template_default: {
        Args: { _account_id: string; _format: string; _template_id: string }
        Returns: Json
      }
      set_admin_permissions: {
        Args: {
          _full_access?: boolean
          _is_admin: boolean
          _sections?: string[]
          _target_user_id: string
        }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      verify_email_code: { Args: { _code: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      image_style: "template" | "ai"
      news_status:
        | "pending"
        | "processing"
        | "processed"
        | "approved"
        | "scheduled"
        | "posted"
        | "failed"
        | "rejected"
      post_status:
        | "scheduled"
        | "posting"
        | "posted"
        | "failed"
        | "cancelled"
        | "awaiting_container"
      source_kind: "rss" | "site" | "url" | "person" | "topic" | "google_news"
      source_type: "rss" | "newsapi"
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
      app_role: ["admin", "user"],
      image_style: ["template", "ai"],
      news_status: [
        "pending",
        "processing",
        "processed",
        "approved",
        "scheduled",
        "posted",
        "failed",
        "rejected",
      ],
      post_status: [
        "scheduled",
        "posting",
        "posted",
        "failed",
        "cancelled",
        "awaiting_container",
      ],
      source_kind: ["rss", "site", "url", "person", "topic", "google_news"],
      source_type: ["rss", "newsapi"],
    },
  },
} as const
