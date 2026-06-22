-- Server-side admin diagnostics. These functions intentionally omit access_token.
CREATE OR REPLACE FUNCTION public.admin_list_instagram_token_health()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  active boolean,
  verification_status text,
  token_expires_at timestamptz,
  last_verified_at timestamptz,
  ig_user_id text,
  page_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_has_permission('tokens') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN QUERY
  SELECT ia.id, ia.user_id, ia.username, ia.active, ia.verification_status,
         ia.token_expires_at, ia.last_verified_at, ia.ig_user_id, ia.page_id
  FROM public.instagram_accounts ia
  ORDER BY ia.username;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_meta_health()
RETURNS TABLE (
  account_id uuid,
  user_id uuid,
  username text,
  active boolean,
  pause_threshold integer,
  max_usage_percent integer,
  app_call_count integer,
  app_total_time integer,
  app_total_cputime integer,
  buc_call_count integer,
  buc_total_time integer,
  buc_total_cputime integer,
  buc_estimated_time_to_regain_access integer,
  captured_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_has_permission('meta') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN QUERY
  SELECT ia.id, ia.user_id, ia.username, ia.active,
         COALESCE(us.meta_usage_pause_threshold, 80),
         usage.max_usage_percent, usage.app_call_count, usage.app_total_time,
         usage.app_total_cputime, usage.buc_call_count, usage.buc_total_time,
         usage.buc_total_cputime, usage.buc_estimated_time_to_regain_access,
         usage.captured_at
  FROM public.instagram_accounts ia
  LEFT JOIN public.user_settings us ON us.user_id = ia.user_id
  LEFT JOIN LATERAL (
    SELECT m.max_usage_percent, m.app_call_count, m.app_total_time,
           m.app_total_cputime, m.buc_call_count, m.buc_total_time,
           m.buc_total_cputime, m.buc_estimated_time_to_regain_access,
           m.captured_at
    FROM public.meta_api_usage m
    WHERE m.instagram_account_id = ia.id
    ORDER BY m.captured_at DESC
    LIMIT 1
  ) usage ON true
  ORDER BY ia.username;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_instagram_token_health() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_meta_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_instagram_token_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_meta_health() TO authenticated;
