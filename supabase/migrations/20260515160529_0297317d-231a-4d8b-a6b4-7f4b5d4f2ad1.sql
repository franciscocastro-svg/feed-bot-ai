
ALTER TABLE public.plan_limits ADD COLUMN IF NOT EXISTS translation_enabled boolean NOT NULL DEFAULT false;
UPDATE public.plan_limits SET translation_enabled = true WHERE plan IN ('pro','business');
UPDATE public.plan_limits SET translation_enabled = false WHERE plan IN ('free','starter','expired');

DROP FUNCTION IF EXISTS public.get_current_usage(uuid);

CREATE OR REPLACE FUNCTION public.get_current_usage(_user_id uuid)
 RETURNS TABLE(plan text, display_name text, reels_used integer, reels_limit integer, images_used integer, images_limit integer, ig_accounts_used integer, ig_accounts_limit integer, rss_sources_used integer, rss_sources_limit integer, posts_today integer, posts_per_day_limit integer, auto_publish_enabled boolean, translation_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  RETURN QUERY
  WITH pl AS (SELECT * FROM public.get_user_plan_limits(_user_id)),
  uc AS (
    SELECT reels_generated, images_generated FROM public.usage_counters
    WHERE user_id = _user_id AND period_month = date_trunc('month', now())::date
  )
  SELECT
    pl.plan, pl.display_name,
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
    pl.auto_publish_enabled,
    pl.translation_enabled
  FROM pl;
END;
$function$;
