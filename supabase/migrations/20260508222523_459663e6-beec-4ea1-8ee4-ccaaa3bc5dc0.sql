
-- 1. Remove user_subscriptions from realtime publication (not used by client; was leaking events)
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_subscriptions;

-- 2. Add caller identity guards to SECURITY DEFINER RPCs

CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  RETURN (
    SELECT CASE
      WHEN COALESCE(s.plan, 'free') = 'free'
           AND s.created_at < now() - interval '7 days' THEN 'expired'
      WHEN COALESCE(s.plan, 'free') <> 'free'
           AND COALESCE(s.current_period_end, s.expires_at) IS NOT NULL
           AND COALESCE(s.current_period_end, s.expires_at) < now() THEN 'expired'
      WHEN COALESCE(s.plan, 'free') <> 'free'
           AND s.status IN ('canceled','unpaid','incomplete_expired') THEN 'expired'
      ELSE COALESCE(s.plan, 'free')
    END
    FROM public.user_subscriptions s WHERE s.user_id = _user_id LIMIT 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_plan_limits(_user_id uuid)
 RETURNS plan_limits
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r plan_limits;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  SELECT pl.* INTO r FROM public.plan_limits pl WHERE pl.plan = public.get_user_plan(_user_id);
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_and_increment_usage(_user_id uuid, _resource text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_period DATE := date_trunc('month', now())::date;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_current_usage(_user_id uuid)
 RETURNS TABLE(plan text, display_name text, reels_used integer, reels_limit integer, images_used integer, images_limit integer, ig_accounts_used integer, ig_accounts_limit integer, rss_sources_used integer, rss_sources_limit integer, posts_today integer, posts_per_day_limit integer, auto_publish_enabled boolean)
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
    pl.auto_publish_enabled
  FROM pl;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_create_resource(_user_id uuid, _resource text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_subscription_status(_user_id uuid)
 RETURNS TABLE(plan text, effective_plan text, status text, approval_status text, current_period_end timestamp with time zone, cancel_at_period_end boolean, days_remaining integer, is_trial boolean, is_expired boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  RETURN QUERY
  SELECT
    COALESCE(s.plan, 'free'),
    public.get_user_plan(_user_id),
    COALESCE(s.status, 'active'),
    COALESCE(s.approval_status, 'pending'),
    COALESCE(s.current_period_end, s.expires_at),
    COALESCE(s.cancel_at_period_end, false),
    CASE
      WHEN COALESCE(s.plan, 'free') = 'free'
        THEN GREATEST(0, 7 - EXTRACT(DAY FROM (now() - s.created_at))::int)
      WHEN COALESCE(s.current_period_end, s.expires_at) IS NOT NULL
        THEN GREATEST(0, EXTRACT(DAY FROM (COALESCE(s.current_period_end, s.expires_at) - now()))::int)
      ELSE NULL
    END,
    (COALESCE(s.plan, 'free') = 'free'),
    (public.get_user_plan(_user_id) = 'expired')
  FROM public.user_subscriptions s WHERE s.user_id = _user_id LIMIT 1;
END;
$function$;

-- 3. Revoke EXECUTE from anon on SECURITY DEFINER functions (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_current_usage(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_create_resource(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_subscription_status(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_resource(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- 4. Fix user_roles policy conflict: drop permissive ALL, add explicit admin SELECT
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "admins view all roles" ON public.user_roles FOR SELECT USING (public.is_admin());

-- 5. Storage: replace permissive public SELECT with owner-only.
-- Public CDN URLs (/object/public/<bucket>/...) bypass RLS, so public access still works.
DROP POLICY IF EXISTS "post-images public read" ON storage.objects;
DROP POLICY IF EXISTS "template-bg public read" ON storage.objects;

CREATE POLICY "post-images owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "template-bg owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'template-backgrounds' AND (storage.foldername(name))[1] = (auth.uid())::text);
