
CREATE TABLE IF NOT EXISTS public.follower_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  followers_count integer NOT NULL,
  follows_count integer,
  media_count integer,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follower_snapshots_acc_time
  ON public.follower_snapshots(instagram_account_id, captured_at DESC);

ALTER TABLE public.follower_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own follower_snapshots select"
  ON public.follower_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own follower_snapshots insert"
  ON public.follower_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
