ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text;

CREATE UNIQUE INDEX IF NOT EXISTS news_items_user_url_unique 
  ON public.news_items (user_id, original_url);