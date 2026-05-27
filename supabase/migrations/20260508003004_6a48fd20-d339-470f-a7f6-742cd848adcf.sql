
-- Plan limits table
CREATE TABLE public.plan_limits (
  plan TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  price_brl NUMERIC,
  is_negotiable BOOLEAN NOT NULL DEFAULT false,
  trial_days INTEGER,
  max_ig_accounts INTEGER NOT NULL,
  max_posts_per_day INTEGER NOT NULL,
  max_rss_sources INTEGER NOT NULL, -- -1 = unlimited
  max_reels_per_month INTEGER NOT NULL,
  max_images_per_month INTEGER NOT NULL,
  max_templates INTEGER NOT NULL, -- -1 = unlimited
  auto_publish_enabled BOOLEAN NOT NULL DEFAULT false,
  support_level TEXT NOT NULL DEFAULT 'email',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view plan_limits"
  ON public.plan_limits FOR SELECT
  USING (true);

CREATE POLICY "admins manage plan_limits"
  ON public.plan_limits FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_plan_limits_updated_at
  BEFORE UPDATE ON public.plan_limits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed plans
INSERT INTO public.plan_limits (plan, display_name, price_brl, is_negotiable, trial_days, max_ig_accounts, max_posts_per_day, max_rss_sources, max_reels_per_month, max_images_per_month, max_templates, auto_publish_enabled, support_level, sort_order) VALUES
  ('free',     'Free (Trial 7 dias)', 0,     false, 7,    1,  7,  2,  5,   10,   1,  false, 'email',        1),
  ('starter',  'Starter',             437,   false, NULL, 1,  27, 5,  30,  100,  3,  true,  'email',        2),
  ('pro',      'Pro',                 1247,  false, NULL, 3,  50, 20, 150, 500,  10, true,  'prioritario',  3),
  ('business', 'Business',            NULL,  true,  NULL, 10, 50, -1, 500, 2000, -1, true,  'whatsapp',     4);

-- Usage counters (per user / per month)
CREATE TABLE public.usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_month DATE NOT NULL, -- first day of month
  reels_generated INTEGER NOT NULL DEFAULT 0,
  images_generated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_month)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own usage"
  ON public.usage_counters FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "service writes usage"
  ON public.usage_counters FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_usage_counters_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_usage_counters_user_month ON public.usage_counters(user_id, period_month);

-- Get user's current plan
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(plan, 'free') FROM public.user_subscriptions WHERE user_id = _user_id LIMIT 1
$$;

-- Get plan limits for a user (returns row from plan_limits)
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(_user_id UUID)
RETURNS public.plan_limits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pl.* FROM public.plan_limits pl
  WHERE pl.plan = public.get_user_plan(_user_id)
$$;

-- Get current usage + limits combined (for UI)
CREATE OR REPLACE FUNCTION public.get_current_usage(_user_id UUID)
RETURNS TABLE (
  plan TEXT,
  display_name TEXT,
  reels_used INTEGER,
  reels_limit INTEGER,
  images_used INTEGER,
  images_limit INTEGER,
  ig_accounts_used INTEGER,
  ig_accounts_limit INTEGER,
  rss_sources_used INTEGER,
  rss_sources_limit INTEGER,
  posts_today INTEGER,
  posts_per_day_limit INTEGER,
  auto_publish_enabled BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pl AS (
    SELECT * FROM public.get_user_plan_limits(_user_id)
  ), uc AS (
    SELECT reels_generated, images_generated FROM public.usage_counters
    WHERE user_id = _user_id AND period_month = date_trunc('month', now())::date
  )
  SELECT
    pl.plan,
    pl.display_name,
    COALESCE((SELECT reels_generated FROM uc), 0)::int,
    pl.max_reels_per_month,
    COALESCE((SELECT images_generated FROM uc), 0)::int,
    pl.max_images_per_month,
    (SELECT count(*)::int FROM public.instagram_accounts WHERE user_id = _user_id AND active),
    pl.max_ig_accounts,
    (SELECT count(*)::int FROM public.news_sources WHERE user_id = _user_id AND active),
    pl.max_rss_sources,
    (SELECT count(*)::int FROM public.scheduled_posts WHERE user_id = _user_id AND posted_at >= date_trunc('day', now())),
    pl.max_posts_per_day,
    pl.auto_publish_enabled
  FROM pl
$$;

-- Atomic check + increment for AI generation (resource: 'reels' or 'images')
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(_user_id UUID, _resource TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_period DATE := date_trunc('month', now())::date;
BEGIN
  -- Lock the row for this user/period (or create it)
  INSERT INTO public.usage_counters (user_id, period_month) VALUES (_user_id, v_period)
    ON CONFLICT (user_id, period_month) DO NOTHING;

  IF _resource = 'reels' THEN
    SELECT max_reels_per_month INTO v_limit FROM public.get_user_plan_limits(_user_id);
    SELECT reels_generated INTO v_current FROM public.usage_counters
      WHERE user_id = _user_id AND period_month = v_period FOR UPDATE;
    IF v_limit >= 0 AND v_current >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', v_current, 'limit', v_limit);
    END IF;
    UPDATE public.usage_counters SET reels_generated = reels_generated + 1
      WHERE user_id = _user_id AND period_month = v_period;
    RETURN jsonb_build_object('allowed', true, 'used', v_current + 1, 'limit', v_limit);

  ELSIF _resource = 'images' THEN
    SELECT max_images_per_month INTO v_limit FROM public.get_user_plan_limits(_user_id);
    SELECT images_generated INTO v_current FROM public.usage_counters
      WHERE user_id = _user_id AND period_month = v_period FOR UPDATE;
    IF v_limit >= 0 AND v_current >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', v_current, 'limit', v_limit);
    END IF;
    UPDATE public.usage_counters SET images_generated = images_generated + 1
      WHERE user_id = _user_id AND period_month = v_period;
    RETURN jsonb_build_object('allowed', true, 'used', v_current + 1, 'limit', v_limit);

  ELSE
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_resource');
  END IF;
END;
$$;

-- Check (without incrementing) if a structural action is allowed: ig_account, rss_source
CREATE OR REPLACE FUNCTION public.can_create_resource(_user_id UUID, _resource TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
BEGIN
  IF _resource = 'ig_account' THEN
    SELECT max_ig_accounts INTO v_limit FROM public.get_user_plan_limits(_user_id);
    SELECT count(*) INTO v_current FROM public.instagram_accounts WHERE user_id = _user_id AND active;
  ELSIF _resource = 'rss_source' THEN
    SELECT max_rss_sources INTO v_limit FROM public.get_user_plan_limits(_user_id);
    SELECT count(*) INTO v_current FROM public.news_sources WHERE user_id = _user_id AND active;
  ELSIF _resource = 'template' THEN
    SELECT max_templates INTO v_limit FROM public.get_user_plan_limits(_user_id);
    SELECT count(*) INTO v_current FROM public.post_templates WHERE user_id = _user_id;
  ELSE
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_resource');
  END IF;

  IF v_limit < 0 THEN
    RETURN jsonb_build_object('allowed', true, 'used', v_current, 'limit', -1);
  END IF;

  IF v_current >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', v_current, 'limit', v_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_current, 'limit', v_limit);
END;
$$;
