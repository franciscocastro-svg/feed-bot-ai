ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'feed';

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS generated_video_url text;