ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS editorial_reel_duration_seconds smallint NOT NULL DEFAULT 20
    CHECK (editorial_reel_duration_seconds IN (6, 20, 30));

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS editorial_reel_duration_seconds smallint
    CHECK (editorial_reel_duration_seconds IS NULL OR editorial_reel_duration_seconds IN (6, 20, 30));