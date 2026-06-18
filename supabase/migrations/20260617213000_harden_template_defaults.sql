-- Keep one default per publication format. The legacy default_template_id is
-- retained as a Feed-only fallback.
UPDATE public.user_settings AS settings
SET default_template_id = NULL
WHERE default_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_template_id
      AND template.user_id = settings.user_id
      AND COALESCE(template.format, 'feed') = 'feed'
  );

UPDATE public.user_settings AS settings
SET default_feed_template_id = NULL
WHERE default_feed_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_feed_template_id
      AND template.user_id = settings.user_id
      AND COALESCE(template.format, 'feed') = 'feed'
  );

UPDATE public.user_settings AS settings
SET default_story_template_id = NULL
WHERE default_story_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_story_template_id
      AND template.user_id = settings.user_id
      AND template.format = 'stories'
  );

UPDATE public.user_settings AS settings
SET default_reel_template_id = NULL
WHERE default_reel_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_reel_template_id
      AND template.user_id = settings.user_id
      AND template.format = 'reels'
  );

UPDATE public.account_settings AS settings
SET default_template_id = NULL
WHERE default_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_template_id
      AND template.user_id = settings.user_id
      AND COALESCE(template.format, 'feed') = 'feed'
  );

UPDATE public.account_settings AS settings
SET default_feed_template_id = NULL
WHERE default_feed_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_feed_template_id
      AND template.user_id = settings.user_id
      AND COALESCE(template.format, 'feed') = 'feed'
  );

UPDATE public.account_settings AS settings
SET default_story_template_id = NULL
WHERE default_story_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_story_template_id
      AND template.user_id = settings.user_id
      AND template.format = 'stories'
  );

UPDATE public.account_settings AS settings
SET default_reel_template_id = NULL
WHERE default_reel_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.post_templates AS template
    WHERE template.id = settings.default_reel_template_id
      AND template.user_id = settings.user_id
      AND template.format = 'reels'
  );

DO $$
DECLARE
  relation_name text;
  column_name text;
  constraint_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['user_settings', 'account_settings'] LOOP
    FOREACH column_name IN ARRAY ARRAY['default_template_id', 'default_feed_template_id', 'default_story_template_id', 'default_reel_template_id'] LOOP
      constraint_name := relation_name || '_' || column_name || '_post_templates_fkey';
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.post_templates(id) ON DELETE SET NULL',
          relation_name,
          constraint_name,
          column_name
        );
      END IF;
    END LOOP;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.get_effective_account_settings(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_us record;
  v_as record;
BEGIN
  SELECT user_id INTO v_uid FROM public.instagram_accounts WHERE id = _account_id;
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

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'instagram_account_id', _account_id,
    'brand_name', COALESCE(v_as.brand_name, v_us.brand_name),
    'brand_handle', COALESCE(v_as.brand_handle, v_us.brand_handle),
    'brand_logo_url', COALESCE(v_as.brand_logo_url, v_us.brand_logo_url),
    'default_niche', COALESCE(v_as.default_niche, v_us.default_niche),
    'ai_tone', COALESCE(v_as.ai_tone, v_us.ai_tone),
    'default_media_type', COALESCE(v_as.default_media_type, v_us.default_media_type),
    'default_image_style', COALESCE(v_as.default_image_style, v_us.default_image_style),
    'default_template_id', COALESCE(v_as.default_template_id, v_us.default_template_id),
    'default_feed_template_id', COALESCE(v_as.default_feed_template_id, v_us.default_feed_template_id, v_as.default_template_id, v_us.default_template_id),
    'default_story_template_id', COALESCE(v_as.default_story_template_id, v_us.default_story_template_id),
    'default_reel_template_id', COALESCE(v_as.default_reel_template_id, v_us.default_reel_template_id),
    'reel_audio_url', COALESCE(v_as.reel_audio_url, v_us.reel_audio_url),
    'max_posts_per_day', COALESCE(v_as.max_posts_per_day, v_us.max_posts_per_day),
    'min_post_interval_minutes', COALESCE(v_as.min_post_interval_minutes, v_us.min_post_interval_minutes),
    'preferred_post_hours', COALESCE(v_as.preferred_post_hours, v_us.preferred_post_hours),
    'auto_approve', COALESCE(v_as.auto_approve, v_us.auto_approve),
    'meta_usage_pause_threshold', v_us.meta_usage_pause_threshold
  );
END;
$$;
