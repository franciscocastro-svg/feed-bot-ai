ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS source_language text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS translate_to_pt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cultural_adaptation boolean NOT NULL DEFAULT false;