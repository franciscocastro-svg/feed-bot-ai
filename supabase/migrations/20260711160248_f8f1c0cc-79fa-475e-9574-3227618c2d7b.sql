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

NOTIFY pgrst, 'reload schema';