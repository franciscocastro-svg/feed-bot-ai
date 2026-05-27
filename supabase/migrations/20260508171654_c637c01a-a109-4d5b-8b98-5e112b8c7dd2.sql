-- 1. Junction table: news_sources <-> instagram_accounts (N:N)
CREATE TABLE public.news_source_instagram_accounts (
  source_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, instagram_account_id)
);

CREATE INDEX idx_nsia_source ON public.news_source_instagram_accounts(source_id);
CREATE INDEX idx_nsia_ig ON public.news_source_instagram_accounts(instagram_account_id);
CREATE INDEX idx_nsia_user ON public.news_source_instagram_accounts(user_id);

ALTER TABLE public.news_source_instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own source-ig links"
ON public.news_source_instagram_accounts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Add instagram_account_id to news_items (nullable, legacy rows stay NULL)
ALTER TABLE public.news_items
  ADD COLUMN instagram_account_id uuid;

CREATE INDEX idx_news_items_ig ON public.news_items(instagram_account_id);