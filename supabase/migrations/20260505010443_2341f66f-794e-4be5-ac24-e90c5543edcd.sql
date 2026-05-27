ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS generated_cover_url text,
  ADD COLUMN IF NOT EXISTS reel_caption text;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_media_type text NOT NULL DEFAULT 'reel';