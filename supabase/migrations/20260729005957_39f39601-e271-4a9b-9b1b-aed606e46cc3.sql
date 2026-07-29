ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS news_format_preference text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS carousel_slide_count smallint NOT NULL DEFAULT 6;

ALTER TABLE public.creator_profiles
  DROP CONSTRAINT IF EXISTS creator_profiles_news_format_preference_check,
  DROP CONSTRAINT IF EXISTS creator_profiles_carousel_slide_count_check;

ALTER TABLE public.creator_profiles
  ADD CONSTRAINT creator_profiles_news_format_preference_check
    CHECK (news_format_preference IN ('single', 'carousel', 'automatic')),
  ADD CONSTRAINT creator_profiles_carousel_slide_count_check
    CHECK (carousel_slide_count BETWEEN 5 AND 7);

CREATE OR REPLACE FUNCTION public.save_creator_profile_with_news_preferences(
  _account_id uuid,
  _profile jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
  saved_id uuid;
  requested_format text;
  requested_slides integer;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF _account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.instagram_accounts
    WHERE id = _account_id
      AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  requested_format := COALESCE(NULLIF(trim(_profile ->> 'news_format_preference'), ''), 'single');
  IF requested_format NOT IN ('single', 'carousel', 'automatic') THEN
    RAISE EXCEPTION 'invalid news format preference';
  END IF;

  requested_slides := COALESCE((_profile ->> 'carousel_slide_count')::integer, 6);
  IF requested_slides NOT BETWEEN 5 AND 7 THEN
    RAISE EXCEPTION 'carousel slide count must be between 5 and 7';
  END IF;

  saved_id := public.save_creator_profile_for_account(_account_id, _profile);

  UPDATE public.creator_profiles
  SET news_format_preference = requested_format,
      carousel_slide_count = requested_slides,
      updated_at = now()
  WHERE id = saved_id
    AND user_id = owner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile update failed';
  END IF;

  RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_creator_profile_with_news_preferences(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_creator_profile_with_news_preferences(uuid, jsonb)
  TO authenticated, service_role;

COMMENT ON COLUMN public.creator_profiles.news_format_preference IS
  'single mantém uma imagem, carousel sempre cria slides e automatic usa a profundidade da matéria.';
COMMENT ON COLUMN public.creator_profiles.carousel_slide_count IS
  'Quantidade preferida de slides para notícias em carrossel, entre 5 e 7.';

NOTIFY pgrst, 'reload schema';