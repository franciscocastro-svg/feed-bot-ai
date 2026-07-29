-- Four commercial plans and their default safety limits.
--
-- This migration intentionally updates only plan_limits. Existing customers,
-- subscriptions, approvals, Stripe references and billing states are preserved.
-- The internal key "starter" is retained for compatibility and is presented to
-- customers as "Creator".

INSERT INTO public.plan_limits (
  plan,
  display_name,
  price_brl,
  is_negotiable,
  trial_days,
  max_ig_accounts,
  max_posts_per_day,
  max_rss_sources,
  max_reels_per_month,
  max_images_per_month,
  max_templates,
  auto_publish_enabled,
  support_level,
  sort_order,
  translation_enabled,
  max_cuts_per_day,
  max_cut_video_minutes,
  max_cuts_per_job
)
VALUES
  (
    'starter', 'Creator', 97.97, false, 7,
    1, 20, 5, -1, 100, 3, true, 'email', 2, false,
    1, 30, 3
  ),
  (
    'pro', 'Pro', 197.97, false, 7,
    3, 30, 20, -1, 500, 10, true, 'prioritario', 3, true,
    5, 60, 5
  ),
  (
    'business', 'Business', 437.97, false, 7,
    10, 40, 50, -1, 2000, 25, true, 'prioritario', 4, true,
    20, 120, 5
  ),
  (
    'agency', 'Agência', NULL, true, NULL,
    50, 60, 100, -1, -1, -1, true, 'whatsapp', 5, true,
    50, 180, 5
  )
ON CONFLICT (plan) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  price_brl = EXCLUDED.price_brl,
  is_negotiable = EXCLUDED.is_negotiable,
  trial_days = EXCLUDED.trial_days,
  max_ig_accounts = EXCLUDED.max_ig_accounts,
  max_posts_per_day = EXCLUDED.max_posts_per_day,
  max_rss_sources = EXCLUDED.max_rss_sources,
  max_reels_per_month = EXCLUDED.max_reels_per_month,
  max_images_per_month = EXCLUDED.max_images_per_month,
  max_templates = EXCLUDED.max_templates,
  auto_publish_enabled = EXCLUDED.auto_publish_enabled,
  support_level = EXCLUDED.support_level,
  sort_order = EXCLUDED.sort_order,
  translation_enabled = EXCLUDED.translation_enabled,
  max_cuts_per_day = EXCLUDED.max_cuts_per_day,
  max_cut_video_minutes = EXCLUDED.max_cut_video_minutes,
  max_cuts_per_job = EXCLUDED.max_cuts_per_job,
  updated_at = now();

COMMENT ON COLUMN public.plan_limits.max_posts_per_day IS
  'Maximum publications per day for each Instagram account. Feed, Reel, Carousel and Story each count as one publication.';

COMMENT ON COLUMN public.plan_limits.max_reels_per_month IS
  'Legacy compatibility column. Paid plans use -1 because daily publications already include Reels.';

NOTIFY pgrst, 'reload schema';
