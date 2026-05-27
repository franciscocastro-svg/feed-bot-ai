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
          default_image_style: Database["public"]["Enums"]["image_style"] | null
          default_media_type: string | null
          default_niche: string | null
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
          default_image_style?:
            | Database["public"]["Enums"]["image_style"]
            | null
          default_media_type?: string | null
          default_niche?: string | null
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
          default_image_style?:
            | Database["public"]["Enums"]["image_style"]
            | null
          default_media_type?: string | null
          default_niche?: string | null
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
        Relationships: []
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
          created_at: string
          formats: string[]
          id: string
          instagram_account_id: string | null
          last_used_at: string | null
          notes: string | null
          title: string
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          formats?: string[]
          id?: string
          instagram_account_id?: string | null
          last_used_at?: string | null
          notes?: string | null
          title: string
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          formats?: string[]
          id?: string
          instagram_account_id?: string | null
          last_used_at?: string | null
          notes?: string | null
          title?: string
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
          editorial_ready: boolean
          error_message: string | null
          generated_cover_url: string | null
          generated_image_url: string | null
          generated_video_url: string | null
          hashtags: string[] | null
          id: string
          image_style: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id: string | null
          next_retry_at: string | null
          niche: string | null
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
          editorial_ready?: boolean
          error_message?: string | null
          generated_cover_url?: string | null
          generated_image_url?: string | null
          generated_video_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_style?: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id?: string | null
          next_retry_at?: string | null
          niche?: string | null
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
          editorial_ready?: boolean
          error_message?: string | null
          generated_cover_url?: string | null
          generated_image_url?: string | null
          generated_video_url?: string | null
          hashtags?: string[] | null
          id?: string
          image_style?: Database["public"]["Enums"]["image_style"] | null
          instagram_account_id?: string | null
          next_retry_at?: string | null
          niche?: string | null
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
          created_at: string
          cultural_adaptation: boolean
          fetch_interval_minutes: number
          id: string
          last_fetched_at: string | null
          name: string
          niche: string | null
          source_language: string
          source_type: Database["public"]["Enums"]["source_type"]
          translate_to_pt: boolean
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cultural_adaptation?: boolean
          fetch_interval_minutes?: number
          id?: string
          last_fetched_at?: string | null
          name: string
          niche?: string | null
          source_language?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          translate_to_pt?: boolean
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cultural_adaptation?: boolean
          fetch_interval_minutes?: number
          id?: string
          last_fetched_at?: string | null
          name?: string
          niche?: string | null
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
          created_at: string
          error_message: string | null
          id: string
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
          created_at?: string
          error_message?: string | null
          id?: string
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
          created_at?: string
          error_message?: string | null
          id?: string
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
          default_image_style: Database["public"]["Enums"]["image_style"]
          default_media_type: string
          default_niche: string | null
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
          default_image_style?: Database["public"]["Enums"]["image_style"]
          default_media_type?: string
          default_niche?: string | null
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
          default_image_style?: Database["public"]["Enums"]["image_style"]
          default_media_type?: string
          default_niche?: string | null
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
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          approval_status: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          expires_at: string | null
          id: string
          notes: string | null
          plan: string
          price_id: string | null
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plan?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plan?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
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
      check_and_increment_usage: {
        Args: { _resource: string; _user_id: string }
        Returns: Json
      }
      get_current_usage: {
        Args: { _user_id: string }
        Returns: {
          auto_publish_enabled: boolean
          display_name: string
          ig_accounts_limit: number
          ig_accounts_used: number
          images_limit: number
          images_used: number
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
      get_internal_cron_secret: { Args: never; Returns: string }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved: { Args: { _uid: string }; Returns: boolean }
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
      post_status: "scheduled" | "posting" | "posted" | "failed" | "cancelled"
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
      post_status: ["scheduled", "posting", "posted", "failed", "cancelled"],
      source_type: ["rss", "newsapi"],
    },
  },
} as const
