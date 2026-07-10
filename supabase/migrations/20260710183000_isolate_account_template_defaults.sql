-- Templates are selected per Instagram account. Brand/tone settings may still
-- inherit global values, but a template from one account must never leak into
-- another account owned by the same customer.

-- Preserve legacy global defaults only for customers with exactly one active
-- Instagram account. Multi-account customers must choose each account's default.
INSERT INTO public.account_settings (
  user_id,
  instagram_account_id,
  default_template_id,
  default_feed_template_id,
  default_story_template_id,
  default_reel_template_id
)
SELECT
  accounts.user_id,
  accounts.id,
  settings.default_template_id,
  COALESCE(settings.default_feed_template_id, settings.default_template_id),
  settings.default_story_template_id,
  settings.default_reel_template_id
FROM public.instagram_accounts accounts
JOIN public.user_settings settings ON settings.user_id = accounts.user_id
WHERE accounts.active
  AND (
    SELECT count(*)
    FROM public.instagram_accounts siblings
    WHERE siblings.user_id = accounts.user_id AND siblings.active
  ) = 1
ON CONFLICT (instagram_account_id) DO UPDATE SET
  default_template_id = COALESCE(public.account_settings.default_template_id, EXCLUDED.default_template_id),
  default_feed_template_id = COALESCE(public.account_settings.default_feed_template_id, EXCLUDED.default_feed_template_id),
  default_story_template_id = COALESCE(public.account_settings.default_story_template_id, EXCLUDED.default_story_template_id),
  default_reel_template_id = COALESCE(public.account_settings.default_reel_template_id, EXCLUDED.default_reel_template_id);

-- Historical migrations copied one global template into every account. For a
-- multi-account customer, keep the most recently edited assignment and clear
-- older duplicate assignments. The customer may explicitly assign the same
-- template to another account again later if that is intentional.
DO $$
DECLARE
  template_column text;
BEGIN
  FOREACH template_column IN ARRAY ARRAY[
    'default_template_id',
    'default_feed_template_id',
    'default_story_template_id',
    'default_reel_template_id'
  ] LOOP
    EXECUTE format($sql$
      WITH ranked AS (
        SELECT
          account_settings.instagram_account_id,
          row_number() OVER (
            PARTITION BY account_settings.user_id, account_settings.%1$I
            ORDER BY account_settings.updated_at DESC, account_settings.instagram_account_id
          ) AS position
        FROM public.account_settings account_settings
        JOIN public.instagram_accounts accounts
          ON accounts.id = account_settings.instagram_account_id
         AND accounts.active
        WHERE account_settings.%1$I IS NOT NULL
          AND (
            SELECT count(*)
            FROM public.instagram_accounts siblings
            WHERE siblings.user_id = account_settings.user_id AND siblings.active
          ) > 1
      )
      UPDATE public.account_settings settings
      SET %1$I = NULL, updated_at = now()
      FROM ranked
      WHERE settings.instagram_account_id = ranked.instagram_account_id
        AND ranked.position > 1
    $sql$, template_column);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.set_account_template_default(
  _account_id uuid,
  _format text,
  _template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  normalized_format text := lower(btrim(COALESCE(_format, '')));
  saved_settings public.account_settings;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF normalized_format NOT IN ('feed', 'stories', 'reels') THEN
    RAISE EXCEPTION 'invalid template format';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.post_templates
    WHERE id = _template_id
      AND user_id = owner_id
      AND COALESCE(format, 'feed') = normalized_format
  ) THEN
    RAISE EXCEPTION 'template does not belong to this account owner or format';
  END IF;

  INSERT INTO public.account_settings (user_id, instagram_account_id)
  VALUES (owner_id, _account_id)
  ON CONFLICT (instagram_account_id) DO NOTHING;

  UPDATE public.account_settings
  SET
    default_template_id = CASE WHEN normalized_format = 'feed' THEN NULL ELSE default_template_id END,
    default_feed_template_id = CASE WHEN normalized_format = 'feed' THEN _template_id ELSE default_feed_template_id END,
    default_story_template_id = CASE WHEN normalized_format = 'stories' THEN _template_id ELSE default_story_template_id END,
    default_reel_template_id = CASE WHEN normalized_format = 'reels' THEN _template_id ELSE default_reel_template_id END,
    updated_at = now()
  WHERE instagram_account_id = _account_id
    AND user_id = owner_id
  RETURNING * INTO saved_settings;

  RETURN to_jsonb(saved_settings);
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_template_default(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_template_default(uuid, text, uuid) TO authenticated;

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
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_admin() THEN
    IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'access denied'; END IF;
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
    'default_template_id', v_as.default_template_id,
    'default_feed_template_id', COALESCE(v_as.default_feed_template_id, v_as.default_template_id),
    'default_story_template_id', v_as.default_story_template_id,
    'default_reel_template_id', v_as.default_reel_template_id,
    'reel_audio_url', COALESCE(v_as.reel_audio_url, v_us.reel_audio_url),
    'max_posts_per_day', COALESCE(v_as.max_posts_per_day, v_us.max_posts_per_day),
    'min_post_interval_minutes', COALESCE(v_as.min_post_interval_minutes, v_us.min_post_interval_minutes),
    'preferred_post_hours', COALESCE(v_as.preferred_post_hours, v_us.preferred_post_hours),
    'auto_approve', COALESCE(v_as.auto_approve, v_us.auto_approve),
    'meta_usage_pause_threshold', v_us.meta_usage_pause_threshold
  );
END;
$$;
