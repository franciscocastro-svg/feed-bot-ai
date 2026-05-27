
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS price_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_subs_user_env ON public.user_subscriptions(user_id, environment);
CREATE INDEX IF NOT EXISTS idx_user_subs_stripe_sub ON public.user_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Allow user to insert own subscription row (for free tier on signup, already handled by handle_new_user)
-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
