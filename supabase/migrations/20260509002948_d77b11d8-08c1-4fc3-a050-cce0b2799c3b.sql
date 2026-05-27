ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS min_post_interval_minutes integer NOT NULL DEFAULT 30;