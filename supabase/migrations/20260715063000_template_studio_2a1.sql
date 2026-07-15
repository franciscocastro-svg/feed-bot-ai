-- Template Studio 2A.1
-- Account-scoped drafts and immutable published versions. Existing template
-- rows remain the owner's reusable library; account assignments point at a
-- frozen snapshot so editing one account never changes another.

CREATE TABLE IF NOT EXISTS public.post_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.post_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('feed', 'stories', 'reels')),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom',
  preset_key text,
  background_url text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (template_id, instagram_account_id, format, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_post_template_versions_account_draft
  ON public.post_template_versions (instagram_account_id, format)
  WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_post_template_versions_owner
  ON public.post_template_versions (user_id, instagram_account_id, format, status);

CREATE OR REPLACE FUNCTION public.protect_published_template_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published template versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_published_template_version ON public.post_template_versions;
CREATE TRIGGER protect_published_template_version
BEFORE UPDATE ON public.post_template_versions
FOR EACH ROW EXECUTE FUNCTION public.protect_published_template_version();

CREATE TABLE IF NOT EXISTS public.account_template_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('feed', 'stories', 'reels')),
  published_version_id uuid REFERENCES public.post_template_versions(id) ON DELETE SET NULL,
  draft_version_id uuid REFERENCES public.post_template_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, format)
);

CREATE INDEX IF NOT EXISTS idx_account_template_assignments_owner
  ON public.account_template_assignments (user_id, instagram_account_id);

ALTER TABLE public.post_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_template_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners read template versions" ON public.post_template_versions;
CREATE POLICY "owners read template versions"
  ON public.post_template_versions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owners read template assignments" ON public.account_template_assignments;
CREATE POLICY "owners read template assignments"
  ON public.account_template_assignments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.post_template_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.account_template_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_template_versions TO authenticated;
GRANT SELECT ON public.account_template_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_template_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_template_assignments TO service_role;

-- Freeze the current account defaults as version 1. This is data-preserving:
-- no active template, account setting or generated asset is changed.
WITH refs AS (
  SELECT settings.user_id, settings.instagram_account_id, 'feed'::text AS format,
         COALESCE(settings.default_feed_template_id, settings.default_template_id) AS template_id
  FROM public.account_settings settings
  UNION ALL
  SELECT settings.user_id, settings.instagram_account_id, 'stories', settings.default_story_template_id
  FROM public.account_settings settings
  UNION ALL
  SELECT settings.user_id, settings.instagram_account_id, 'reels', settings.default_reel_template_id
  FROM public.account_settings settings
), valid_refs AS (
  SELECT refs.*, template.name, template.kind, template.preset_key,
         template.background_url, template.config
  FROM refs
  JOIN public.post_templates template
    ON template.id = refs.template_id
   AND template.user_id = refs.user_id
   AND COALESCE(template.format, 'feed') = refs.format
  WHERE refs.instagram_account_id IS NOT NULL
)
INSERT INTO public.post_template_versions (
  template_id, user_id, instagram_account_id, format, version_number,
  status, name, kind, preset_key, background_url, config, published_at
)
SELECT template_id, user_id, instagram_account_id, format, 1,
       'published', name, kind, preset_key, background_url, config, now()
FROM valid_refs
ON CONFLICT (template_id, instagram_account_id, format, version_number) DO NOTHING;

INSERT INTO public.account_template_assignments (
  user_id, instagram_account_id, format, published_version_id
)
SELECT version.user_id, version.instagram_account_id, version.format, version.id
FROM public.post_template_versions version
WHERE version.status = 'published'
  AND version.version_number = 1
ON CONFLICT (instagram_account_id, format) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_account_template_states(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'format', assignment.format,
      'published_version_id', assignment.published_version_id,
      'draft_version_id', assignment.draft_version_id,
      'published', CASE WHEN published.id IS NULL THEN NULL ELSE to_jsonb(published) END,
      'draft', CASE WHEN draft.id IS NULL THEN NULL ELSE to_jsonb(draft) END,
      'history', COALESCE((
        SELECT jsonb_agg(to_jsonb(history) ORDER BY history.version_number DESC)
        FROM (
          SELECT version.*
          FROM public.post_template_versions version
          WHERE version.instagram_account_id = assignment.instagram_account_id
            AND version.format = assignment.format
            AND version.status = 'published'
            AND version.id IS DISTINCT FROM assignment.published_version_id
          ORDER BY version.version_number DESC
          LIMIT 5
        ) history
      ), '[]'::jsonb)
    ) ORDER BY assignment.format)
    FROM public.account_template_assignments assignment
    LEFT JOIN public.post_template_versions published ON published.id = assignment.published_version_id
    LEFT JOIN public.post_template_versions draft ON draft.id = assignment.draft_version_id
    WHERE assignment.instagram_account_id = _account_id
      AND assignment.user_id = owner_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_template_account_usage_count(_template_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT assignment.id)::integer
  FROM public.account_template_assignments assignment
  LEFT JOIN public.post_template_versions published ON published.id = assignment.published_version_id
  LEFT JOIN public.post_template_versions draft ON draft.id = assignment.draft_version_id
  WHERE assignment.user_id = auth.uid()
    AND (published.template_id = _template_id OR draft.template_id = _template_id);
$$;

CREATE OR REPLACE FUNCTION public.restore_account_template_version(
  _account_id uuid,
  _version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  restored public.post_template_versions;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO restored
  FROM public.post_template_versions
  WHERE id = _version_id
    AND user_id = owner_id
    AND instagram_account_id = _account_id
    AND status = 'published';
  IF restored.id IS NULL THEN RAISE EXCEPTION 'published version not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_account_id::text || ':' || restored.format, 0));
  UPDATE public.account_template_assignments
  SET published_version_id = restored.id, updated_at = now()
  WHERE instagram_account_id = _account_id
    AND user_id = owner_id
    AND format = restored.format;

  UPDATE public.account_settings
  SET default_template_id = CASE WHEN restored.format = 'feed' THEN NULL ELSE default_template_id END,
      default_feed_template_id = CASE WHEN restored.format = 'feed' THEN restored.template_id ELSE default_feed_template_id END,
      default_story_template_id = CASE WHEN restored.format = 'stories' THEN restored.template_id ELSE default_story_template_id END,
      default_reel_template_id = CASE WHEN restored.format = 'reels' THEN restored.template_id ELSE default_reel_template_id END,
      updated_at = now()
  WHERE instagram_account_id = _account_id AND user_id = owner_id;
  RETURN to_jsonb(restored);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_account_template_draft(
  _account_id uuid,
  _template_id uuid,
  _name text,
  _config jsonb,
  _background_url text DEFAULT NULL,
  _preset_key text DEFAULT NULL,
  _kind text DEFAULT 'custom'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  template_format text;
  assignment public.account_template_assignments;
  existing_draft public.post_template_versions;
  saved_version public.post_template_versions;
  next_version integer;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF jsonb_typeof(COALESCE(_config, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid template config';
  END IF;
  IF length(btrim(COALESCE(_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid template name';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  SELECT COALESCE(format, 'feed') INTO template_format
  FROM public.post_templates
  WHERE id = _template_id AND user_id = owner_id;
  IF template_format IS NULL OR template_format NOT IN ('feed', 'stories', 'reels') THEN
    RAISE EXCEPTION 'template not found or invalid format';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_account_id::text || ':' || template_format, 0));

  INSERT INTO public.account_template_assignments (user_id, instagram_account_id, format)
  VALUES (owner_id, _account_id, template_format)
  ON CONFLICT (instagram_account_id, format) DO NOTHING;

  SELECT * INTO assignment
  FROM public.account_template_assignments
  WHERE instagram_account_id = _account_id AND format = template_format
  FOR UPDATE;

  IF assignment.draft_version_id IS NOT NULL THEN
    SELECT * INTO existing_draft
    FROM public.post_template_versions
    WHERE id = assignment.draft_version_id
    FOR UPDATE;
  END IF;

  IF existing_draft.id IS NOT NULL AND existing_draft.template_id = _template_id THEN
    UPDATE public.post_template_versions
    SET name = btrim(_name), config = _config,
        background_url = _background_url, preset_key = _preset_key,
        kind = CASE WHEN _kind IN ('custom', 'preset') THEN _kind ELSE 'custom' END,
        updated_at = now()
    WHERE id = existing_draft.id AND status = 'draft'
    RETURNING * INTO saved_version;
  ELSE
    IF existing_draft.id IS NOT NULL THEN
      UPDATE public.post_template_versions
      SET status = 'archived', updated_at = now()
      WHERE id = existing_draft.id AND status = 'draft';
    END IF;
    SELECT COALESCE(max(version_number), 0) + 1 INTO next_version
    FROM public.post_template_versions
    WHERE template_id = _template_id
      AND instagram_account_id = _account_id
      AND format = template_format;

    INSERT INTO public.post_template_versions (
      template_id, user_id, instagram_account_id, format, version_number,
      status, name, kind, preset_key, background_url, config
    ) VALUES (
      _template_id, owner_id, _account_id, template_format, next_version,
      'draft', btrim(_name),
      CASE WHEN _kind IN ('custom', 'preset') THEN _kind ELSE 'custom' END,
      _preset_key, _background_url, _config
    ) RETURNING * INTO saved_version;
  END IF;

  UPDATE public.account_template_assignments
  SET draft_version_id = saved_version.id, updated_at = now()
  WHERE id = assignment.id;

  RETURN to_jsonb(saved_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_account_template_draft(
  _account_id uuid,
  _format text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  normalized_format text := lower(btrim(COALESCE(_format, '')));
  assignment public.account_template_assignments;
  draft public.post_template_versions;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF normalized_format NOT IN ('feed', 'stories', 'reels') THEN
    RAISE EXCEPTION 'invalid template format';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_account_id::text || ':' || normalized_format, 0));
  SELECT * INTO assignment
  FROM public.account_template_assignments
  WHERE instagram_account_id = _account_id
    AND user_id = owner_id
    AND format = normalized_format
  FOR UPDATE;
  IF assignment.draft_version_id IS NULL THEN RAISE EXCEPTION 'draft not found'; END IF;

  SELECT * INTO draft FROM public.post_template_versions
  WHERE id = assignment.draft_version_id
    AND user_id = owner_id
    AND instagram_account_id = _account_id
    AND format = normalized_format
    AND status = 'draft'
  FOR UPDATE;
  IF draft.id IS NULL THEN RAISE EXCEPTION 'draft not found'; END IF;

  UPDATE public.post_template_versions
  SET status = 'published', published_at = now(), updated_at = now()
  WHERE id = draft.id;

  UPDATE public.account_template_assignments
  SET published_version_id = draft.id, draft_version_id = NULL, updated_at = now()
  WHERE id = assignment.id;

  INSERT INTO public.account_settings (user_id, instagram_account_id)
  VALUES (owner_id, _account_id)
  ON CONFLICT (instagram_account_id) DO NOTHING;
  UPDATE public.account_settings
  SET default_template_id = CASE WHEN normalized_format = 'feed' THEN NULL ELSE default_template_id END,
      default_feed_template_id = CASE WHEN normalized_format = 'feed' THEN draft.template_id ELSE default_feed_template_id END,
      default_story_template_id = CASE WHEN normalized_format = 'stories' THEN draft.template_id ELSE default_story_template_id END,
      default_reel_template_id = CASE WHEN normalized_format = 'reels' THEN draft.template_id ELSE default_reel_template_id END,
      updated_at = now()
  WHERE instagram_account_id = _account_id AND user_id = owner_id;

  RETURN to_jsonb(draft) || jsonb_build_object('status', 'published', 'published_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_account_template_draft(
  _account_id uuid,
  _format text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := auth.uid();
  normalized_format text := lower(btrim(COALESCE(_format, '')));
  draft_id uuid;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT draft_version_id INTO draft_id
  FROM public.account_template_assignments
  WHERE instagram_account_id = _account_id AND user_id = owner_id AND format = normalized_format
  FOR UPDATE;
  IF draft_id IS NULL THEN RETURN false; END IF;
  UPDATE public.post_template_versions SET status = 'archived', updated_at = now()
  WHERE id = draft_id AND status = 'draft';
  UPDATE public.account_template_assignments SET draft_version_id = NULL, updated_at = now()
  WHERE instagram_account_id = _account_id AND user_id = owner_id AND format = normalized_format;
  RETURN true;
END;
$$;

-- Keep the existing public contract, but also freeze the selected template as
-- the account's published version when no version exists yet.
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
  template public.post_templates;
  version public.post_template_versions;
  saved_settings public.account_settings;
  next_version integer;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF normalized_format NOT IN ('feed', 'stories', 'reels') THEN RAISE EXCEPTION 'invalid template format'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.instagram_accounts WHERE id = _account_id AND user_id = owner_id) THEN
    RAISE EXCEPTION 'Instagram account not found';
  END IF;
  SELECT * INTO template FROM public.post_templates
  WHERE id = _template_id AND user_id = owner_id AND COALESCE(format, 'feed') = normalized_format;
  IF template.id IS NULL THEN RAISE EXCEPTION 'template does not belong to this account owner or format'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_account_id::text || ':' || normalized_format, 0));
  SELECT * INTO version FROM public.post_template_versions
  WHERE template_id = _template_id AND instagram_account_id = _account_id
    AND format = normalized_format AND status = 'published'
  ORDER BY version_number DESC LIMIT 1;
  IF version.id IS NULL THEN
    SELECT COALESCE(max(version_number), 0) + 1 INTO next_version
    FROM public.post_template_versions
    WHERE template_id = _template_id AND instagram_account_id = _account_id AND format = normalized_format;
    INSERT INTO public.post_template_versions (
      template_id, user_id, instagram_account_id, format, version_number,
      status, name, kind, preset_key, background_url, config, published_at
    ) VALUES (
      template.id, owner_id, _account_id, normalized_format, next_version,
      'published', template.name, template.kind, template.preset_key,
      template.background_url, template.config, now()
    ) RETURNING * INTO version;
  END IF;

  INSERT INTO public.account_template_assignments (
    user_id, instagram_account_id, format, published_version_id
  ) VALUES (owner_id, _account_id, normalized_format, version.id)
  ON CONFLICT (instagram_account_id, format) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    published_version_id = EXCLUDED.published_version_id,
    updated_at = now();

  INSERT INTO public.account_settings (user_id, instagram_account_id)
  VALUES (owner_id, _account_id)
  ON CONFLICT (instagram_account_id) DO NOTHING;
  UPDATE public.account_settings
  SET default_template_id = CASE WHEN normalized_format = 'feed' THEN NULL ELSE default_template_id END,
      default_feed_template_id = CASE WHEN normalized_format = 'feed' THEN _template_id ELSE default_feed_template_id END,
      default_story_template_id = CASE WHEN normalized_format = 'stories' THEN _template_id ELSE default_story_template_id END,
      default_reel_template_id = CASE WHEN normalized_format = 'reels' THEN _template_id ELSE default_reel_template_id END,
      updated_at = now()
  WHERE instagram_account_id = _account_id AND user_id = owner_id
  RETURNING * INTO saved_settings;
  RETURN to_jsonb(saved_settings) || jsonb_build_object('published_version_id', version.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_template_states(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_template_account_usage_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_published_template_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_account_template_draft(uuid, uuid, text, jsonb, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_account_template_draft(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_account_template_draft(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_account_template_version(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_account_template_default(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_template_states(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_template_account_usage_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_account_template_draft(uuid, uuid, text, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_account_template_draft(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_account_template_draft(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_account_template_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_template_default(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
