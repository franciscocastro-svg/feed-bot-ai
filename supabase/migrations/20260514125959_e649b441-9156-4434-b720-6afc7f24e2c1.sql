ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_news_items_retry
  ON public.news_items (status, next_retry_at)
  WHERE status = 'failed';