CREATE TABLE public.account_channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('feed', 'story', 'reel')),
  active boolean,
  min_interval_minutes integer CHECK (
    min_interval_minutes IS NULL OR min_interval_minutes >= 10
  ),
  allowed_hours integer[] CHECK (
    allowed_hours IS NULL
    OR (
      cardinality(allowed_hours) > 0
      AND allowed_hours <@ ARRAY[
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
        12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
      ]::integer[]
    )
  ),
  max_per_day integer CHECK (
    max_per_day IS NULL OR max_per_day = -1 OR max_per_day >= 1
  ),
  keywords text[],
  urgent_keywords text[],
  is_priority boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, instagram_account_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_channel_settings TO authenticated;
GRANT ALL ON public.account_channel_settings TO service_role;

CREATE INDEX account_channel_settings_account_idx
  ON public.account_channel_settings (instagram_account_id, channel);

ALTER TABLE public.account_channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own account channel settings"
  ON public.account_channel_settings
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.instagram_accounts account
      WHERE account.id = instagram_account_id
        AND account.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.instagram_accounts account
      WHERE account.id = instagram_account_id
        AND account.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_account_channel_settings_updated
  BEFORE UPDATE ON public.account_channel_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.account_channel_settings IS
  'Optional channel overrides isolated by Instagram account; missing values inherit dynamically.';