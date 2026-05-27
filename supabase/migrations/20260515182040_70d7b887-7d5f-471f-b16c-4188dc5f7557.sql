CREATE OR REPLACE FUNCTION public.get_effective_account_settings(_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_username text;
  v_us record;
  v_as record;
  v_ig_count int;
  v_brand_name text;
  v_brand_handle text;
  v_brand_logo text;
BEGIN
  SELECT user_id, username INTO v_uid, v_username FROM public.instagram_accounts WHERE id = _account_id;
  IF v_uid IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF v_uid <> auth.uid() AND NOT public.is_admin() THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'access denied';
    END IF;
  END IF;

  SELECT * INTO v_us FROM public.user_settings WHERE user_id = v_uid;
  SELECT * INTO v_as FROM public.account_settings WHERE instagram_account_id = _account_id;
  SELECT count(*) INTO v_ig_count FROM public.instagram_accounts WHERE user_id = v_uid AND active;

  -- Brand identity: when user has multiple IG accounts, DO NOT inherit from global
  -- (prevents one account posting with another's branding).
  IF v_ig_count > 1 THEN
    v_brand_name   := v_as.brand_name;                                  -- null if not set
    v_brand_handle := COALESCE(v_as.brand_handle, '@' || v_username);   -- fallback to real @
    v_brand_logo   := v_as.brand_logo_url;                              -- null if not set
  ELSE
    v_brand_name   := COALESCE(v_as.brand_name, v_us.brand_name);
    v_brand_handle := COALESCE(v_as.brand_handle, v_us.brand_handle, '@' || v_username);
    v_brand_logo   := COALESCE(v_as.brand_logo_url, v_us.brand_logo_url);
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'instagram_account_id', _account_id,
    'brand_name', v_brand_name,
    'brand_handle', v_brand_handle,
    'brand_logo_url', v_brand_logo,
    'default_niche', COALESCE(v_as.default_niche, v_us.default_niche),
    'ai_tone', COALESCE(v_as.ai_tone, v_us.ai_tone),
    'default_media_type', COALESCE(v_as.default_media_type, v_us.default_media_type),
    'default_image_style', COALESCE(v_as.default_image_style, v_us.default_image_style),
    'default_template_id', COALESCE(v_as.default_template_id, v_us.default_template_id),
    'reel_audio_url', COALESCE(v_as.reel_audio_url, v_us.reel_audio_url),
    'max_posts_per_day', COALESCE(v_as.max_posts_per_day, v_us.max_posts_per_day),
    'min_post_interval_minutes', COALESCE(v_as.min_post_interval_minutes, v_us.min_post_interval_minutes),
    'preferred_post_hours', COALESCE(v_as.preferred_post_hours, v_us.preferred_post_hours),
    'auto_approve', COALESCE(v_as.auto_approve, v_us.auto_approve),
    'meta_usage_pause_threshold', v_us.meta_usage_pause_threshold,
    'multi_account_mode', (v_ig_count > 1)
  );
END;
$function$;