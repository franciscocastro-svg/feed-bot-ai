ALTER TABLE public.post_templates ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'feed';
CREATE INDEX IF NOT EXISTS idx_post_templates_format ON public.post_templates(user_id, format);