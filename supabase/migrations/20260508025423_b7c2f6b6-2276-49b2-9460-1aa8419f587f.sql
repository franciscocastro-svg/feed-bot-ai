-- 1) Add expired plan with zero limits
INSERT INTO public.plan_limits (plan, display_name, max_ig_accounts, max_rss_sources, max_posts_per_day, max_reels_per_month, max_images_per_month, max_templates, auto_publish_enabled, support_level, sort_order, is_negotiable, trial_days)
VALUES ('expired', 'Expirado', 0, 0, 0, 0, 0, 0, false, 'none', 99, false, 0)
ON CONFLICT (plan) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  max_ig_accounts = 0, max_rss_sources = 0, max_posts_per_day = 0,
  max_reels_per_month = 0, max_images_per_month = 0, max_templates = 0,
  auto_publish_enabled = false;

-- 2) Update get_user_plan to enforce trial expiry + paid expiry
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    -- Free trial expired (7 days since subscription row created)
    WHEN COALESCE(s.plan, 'free') = 'free'
         AND s.created_at < now() - interval '7 days' THEN 'expired'
    -- Paid plan: period ended
    WHEN COALESCE(s.plan, 'free') <> 'free'
         AND COALESCE(s.current_period_end, s.expires_at) IS NOT NULL
         AND COALESCE(s.current_period_end, s.expires_at) < now() THEN 'expired'
    -- Paid plan: explicitly canceled/unpaid statuses
    WHEN COALESCE(s.plan, 'free') <> 'free'
         AND s.status IN ('canceled','unpaid','incomplete_expired') THEN 'expired'
    ELSE COALESCE(s.plan, 'free')
  END
  FROM public.user_subscriptions s WHERE s.user_id = _user_id LIMIT 1
$$;

-- 3) Subscription status helper for banner
CREATE OR REPLACE FUNCTION public.get_subscription_status(_user_id uuid)
RETURNS TABLE(
  plan text,
  effective_plan text,
  status text,
  approval_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  days_remaining int,
  is_trial boolean,
  is_expired boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(s.plan, 'free') as plan,
    public.get_user_plan(_user_id) as effective_plan,
    COALESCE(s.status, 'active') as status,
    COALESCE(s.approval_status, 'pending') as approval_status,
    COALESCE(s.current_period_end, s.expires_at) as current_period_end,
    COALESCE(s.cancel_at_period_end, false) as cancel_at_period_end,
    CASE
      WHEN COALESCE(s.plan, 'free') = 'free'
        THEN GREATEST(0, 7 - EXTRACT(DAY FROM (now() - s.created_at))::int)
      WHEN COALESCE(s.current_period_end, s.expires_at) IS NOT NULL
        THEN GREATEST(0, EXTRACT(DAY FROM (COALESCE(s.current_period_end, s.expires_at) - now()))::int)
      ELSE NULL
    END as days_remaining,
    (COALESCE(s.plan, 'free') = 'free') as is_trial,
    (public.get_user_plan(_user_id) = 'expired') as is_expired
  FROM public.user_subscriptions s WHERE s.user_id = _user_id LIMIT 1
$$;