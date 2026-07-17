-- Perfil do Criador 1A: perfil geral com sobreposicao isolada por conta.
-- O perfil legado continua como escopo geral (instagram_account_id IS NULL).

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS instagram_account_id uuid
  REFERENCES public.instagram_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.creator_profiles
  DROP CONSTRAINT IF EXISTS creator_profiles_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_global
  ON public.creator_profiles (user_id)
  WHERE instagram_account_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_account
  ON public.creator_profiles (user_id, instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

DROP POLICY IF EXISTS "own creator_profile" ON public.creator_profiles;
DROP POLICY IF EXISTS "owners read creator profiles" ON public.creator_profiles;

CREATE POLICY "owners read creator profiles"
ON public.creator_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND (
    instagram_account_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.instagram_accounts account
      WHERE account.id = creator_profiles.instagram_account_id
        AND account.user_id = auth.uid()
    )
  )
);

REVOKE ALL ON public.creator_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.creator_profiles TO authenticated;
GRANT ALL ON public.creator_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_creator_profile_for_account(_account_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
  selected_profile public.creator_profiles%ROWTYPE;
  inherited boolean := false;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF _account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  IF _account_id IS NOT NULL THEN
    SELECT * INTO selected_profile
    FROM public.creator_profiles
    WHERE user_id = owner_id AND instagram_account_id = _account_id;
  END IF;

  IF selected_profile.id IS NULL THEN
    SELECT * INTO selected_profile
    FROM public.creator_profiles
    WHERE user_id = owner_id AND instagram_account_id IS NULL;
    inherited := _account_id IS NOT NULL AND selected_profile.id IS NOT NULL;
  END IF;

  IF selected_profile.id IS NULL THEN
    RETURN jsonb_build_object('_inherited', false, '_exists', false);
  END IF;

  RETURN to_jsonb(selected_profile)
    || jsonb_build_object('_inherited', inherited, '_exists', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_creator_profile_for_account(
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
  signature_values text[];
  forbidden_values text[];
  example_values text[];
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;
  IF _account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  SELECT COALESCE(array_agg(left(trim(value), 180)) FILTER (WHERE trim(value) <> ''), ARRAY[]::text[])
  INTO signature_values
  FROM (
    SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(_profile -> 'signature_phrases') = 'array'
        THEN _profile -> 'signature_phrases' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value, ordinality)
    ORDER BY ordinality LIMIT 12
  ) values_list;

  SELECT COALESCE(array_agg(left(trim(value), 120)) FILTER (WHERE trim(value) <> ''), ARRAY[]::text[])
  INTO forbidden_values
  FROM (
    SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(_profile -> 'forbidden_words') = 'array'
        THEN _profile -> 'forbidden_words' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value, ordinality)
    ORDER BY ordinality LIMIT 30
  ) values_list;

  SELECT COALESCE(array_agg(left(trim(value), 600)) FILTER (WHERE trim(value) <> ''), ARRAY[]::text[])
  INTO example_values
  FROM (
    SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(_profile -> 'example_posts') = 'array'
        THEN _profile -> 'example_posts' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value, ordinality)
    ORDER BY ordinality LIMIT 5
  ) values_list;

  PERFORM pg_advisory_xact_lock(hashtext(owner_id::text), hashtext(COALESCE(_account_id::text, 'global')));

  IF _account_id IS NULL THEN
    INSERT INTO public.creator_profiles (
      user_id, instagram_account_id, niche_detail, target_audience, voice_tone,
      expertise_summary, signature_phrases, forbidden_words, cta_style,
      example_posts, extra_notes
    ) VALUES (
      owner_id, NULL,
      left(trim(COALESCE(_profile ->> 'niche_detail', '')), 800),
      left(trim(COALESCE(_profile ->> 'target_audience', '')), 800),
      left(trim(COALESCE(_profile ->> 'voice_tone', '')), 800),
      left(trim(COALESCE(_profile ->> 'expertise_summary', '')), 1600),
      signature_values, forbidden_values,
      left(trim(COALESCE(_profile ->> 'cta_style', '')), 500),
      example_values,
      left(trim(COALESCE(_profile ->> 'extra_notes', '')), 1200)
    )
    ON CONFLICT (user_id) WHERE instagram_account_id IS NULL DO UPDATE SET
      niche_detail = EXCLUDED.niche_detail,
      target_audience = EXCLUDED.target_audience,
      voice_tone = EXCLUDED.voice_tone,
      expertise_summary = EXCLUDED.expertise_summary,
      signature_phrases = EXCLUDED.signature_phrases,
      forbidden_words = EXCLUDED.forbidden_words,
      cta_style = EXCLUDED.cta_style,
      example_posts = EXCLUDED.example_posts,
      extra_notes = EXCLUDED.extra_notes,
      updated_at = now()
    RETURNING id INTO saved_id;
  ELSE
    INSERT INTO public.creator_profiles (
      user_id, instagram_account_id, niche_detail, target_audience, voice_tone,
      expertise_summary, signature_phrases, forbidden_words, cta_style,
      example_posts, extra_notes
    ) VALUES (
      owner_id, _account_id,
      left(trim(COALESCE(_profile ->> 'niche_detail', '')), 800),
      left(trim(COALESCE(_profile ->> 'target_audience', '')), 800),
      left(trim(COALESCE(_profile ->> 'voice_tone', '')), 800),
      left(trim(COALESCE(_profile ->> 'expertise_summary', '')), 1600),
      signature_values, forbidden_values,
      left(trim(COALESCE(_profile ->> 'cta_style', '')), 500),
      example_values,
      left(trim(COALESCE(_profile ->> 'extra_notes', '')), 1200)
    )
    ON CONFLICT (user_id, instagram_account_id) WHERE instagram_account_id IS NOT NULL DO UPDATE SET
      niche_detail = EXCLUDED.niche_detail,
      target_audience = EXCLUDED.target_audience,
      voice_tone = EXCLUDED.voice_tone,
      expertise_summary = EXCLUDED.expertise_summary,
      signature_phrases = EXCLUDED.signature_phrases,
      forbidden_words = EXCLUDED.forbidden_words,
      cta_style = EXCLUDED.cta_style,
      example_posts = EXCLUDED.example_posts,
      extra_notes = EXCLUDED.extra_notes,
      updated_at = now()
    RETURNING id INTO saved_id;
  END IF;

  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_creator_profile_for_account(_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  DELETE FROM public.creator_profiles
  WHERE user_id = owner_id AND instagram_account_id = _account_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_profile_for_account(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_creator_profile_for_account(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_creator_profile_for_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_profile_for_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_creator_profile_for_account(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_creator_profile_for_account(uuid) TO authenticated, service_role;
