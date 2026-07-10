-- Security and reliability hardening for subscriptions, Instagram credentials,
-- private AI-cut inputs, and worker health.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.has_active_entitlement(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_subscriptions s
      WHERE s.user_id = _uid
        AND s.approval_status = 'approved'
        AND COALESCE(s.plan, 'free') NOT IN ('free', 'expired')
        AND COALESCE(s.status, '') IN ('active', 'trialing')
        AND (
          COALESCE(s.current_period_end, s.expires_at) IS NULL
          OR COALESCE(s.current_period_end, s.expires_at) > now()
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_entitlement(_uid);
$$;

REVOKE ALL ON FUNCTION public.has_active_entitlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_entitlement(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated, service_role;

-- Existing tokens are moved into Vault without disconnecting accounts.
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS token_secret_id uuid;

DO $$
DECLARE
  account_row record;
  new_secret_id uuid;
BEGIN
  FOR account_row IN
    SELECT id, access_token
    FROM public.instagram_accounts
    WHERE access_token IS NOT NULL AND btrim(access_token) <> '' AND token_secret_id IS NULL
  LOOP
    SELECT vault.create_secret(
      account_row.access_token,
      'instagram-account-' || account_row.id::text,
      'Instagram access token managed by Flux & Feed'
    ) INTO new_secret_id;

    UPDATE public.instagram_accounts
    SET token_secret_id = new_secret_id,
        access_token = NULL
    WHERE id = account_row.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_instagram_access_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  new_secret_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.token_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.token_secret_id;
    NEW.token_secret_id := NULL;
  END IF;

  IF NEW.access_token IS NOT NULL AND btrim(NEW.access_token) <> '' THEN
    SELECT vault.create_secret(
      NEW.access_token,
      'instagram-account-' || NEW.id::text,
      'Instagram access token managed by Flux & Feed'
    ) INTO new_secret_id;
    NEW.token_secret_id := new_secret_id;
  END IF;

  NEW.access_token := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_instagram_access_token_trigger ON public.instagram_accounts;
CREATE TRIGGER protect_instagram_access_token_trigger
BEFORE INSERT OR UPDATE OF access_token ON public.instagram_accounts
FOR EACH ROW EXECUTE FUNCTION public.protect_instagram_access_token();

CREATE OR REPLACE FUNCTION public.cleanup_instagram_token_secret()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault
AS $$
BEGIN
  IF OLD.token_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.token_secret_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS cleanup_instagram_token_secret_trigger ON public.instagram_accounts;
CREATE TRIGGER cleanup_instagram_token_secret_trigger
AFTER DELETE ON public.instagram_accounts
FOR EACH ROW EXECUTE FUNCTION public.cleanup_instagram_token_secret();

CREATE OR REPLACE FUNCTION public.get_instagram_account_secret(_account_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  secret_value text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  SELECT ds.decrypted_secret
  INTO secret_value
  FROM public.instagram_accounts a
  JOIN vault.decrypted_secrets ds ON ds.id = a.token_secret_id
  WHERE a.id = _account_id;

  RETURN secret_value;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instagram_account_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instagram_account_secret(uuid) TO service_role;

-- Customers can read/edit metadata, but never the token or its Vault id.
REVOKE SELECT, INSERT, UPDATE ON TABLE public.instagram_accounts FROM authenticated;
GRANT SELECT (
  id, user_id, username, ig_user_id, page_id, niche, active, created_at,
  updated_at, custom_hashtags, token_expires_at, last_verified_at,
  verification_status
) ON TABLE public.instagram_accounts TO authenticated;
GRANT UPDATE (username, niche, active, custom_hashtags) ON TABLE public.instagram_accounts TO authenticated;
GRANT DELETE ON TABLE public.instagram_accounts TO authenticated;

-- Enforce entitlement and resource limits in the database, not only in the UI.
CREATE OR REPLACE FUNCTION public.enforce_customer_resource_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid := NEW.user_id;
  resource_limit integer;
  current_usage integer;
  effective_plan text;
BEGIN
  IF public.has_role(owner_id, 'admin'::public.app_role) THEN RETURN NEW; END IF;
  IF NOT public.has_active_entitlement(owner_id) THEN
    RAISE EXCEPTION 'active subscription required';
  END IF;

  SELECT CASE
    WHEN COALESCE(s.plan, 'free') = 'free' THEN 'expired'
    WHEN COALESCE(s.status, '') NOT IN ('active', 'trialing') THEN 'expired'
    WHEN COALESCE(s.current_period_end, s.expires_at) IS NOT NULL
         AND COALESCE(s.current_period_end, s.expires_at) <= now() THEN 'expired'
    ELSE s.plan
  END
  INTO effective_plan
  FROM public.user_subscriptions s
  WHERE s.user_id = owner_id
  LIMIT 1;

  IF TG_TABLE_NAME = 'instagram_accounts' THEN
    SELECT max_ig_accounts INTO resource_limit FROM public.plan_limits WHERE plan = effective_plan;
    SELECT count(*) INTO current_usage FROM public.instagram_accounts
      WHERE user_id = owner_id AND active AND id <> NEW.id;
  ELSIF TG_TABLE_NAME = 'news_sources' THEN
    SELECT max_rss_sources INTO resource_limit FROM public.plan_limits WHERE plan = effective_plan;
    SELECT count(*) INTO current_usage FROM public.news_sources
      WHERE user_id = owner_id AND active AND id <> NEW.id;
  ELSE
    SELECT max_templates INTO resource_limit FROM public.plan_limits WHERE plan = effective_plan;
    SELECT count(*) INTO current_usage FROM public.post_templates
      WHERE user_id = owner_id AND id <> NEW.id;
  END IF;

  IF resource_limit IS NULL THEN RAISE EXCEPTION 'plan limits not configured'; END IF;
  IF resource_limit >= 0 AND current_usage >= resource_limit THEN
    RAISE EXCEPTION 'plan resource limit reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_instagram_account_limit ON public.instagram_accounts;
CREATE TRIGGER enforce_instagram_account_limit
BEFORE INSERT OR UPDATE OF active ON public.instagram_accounts
FOR EACH ROW WHEN (NEW.active IS TRUE)
EXECUTE FUNCTION public.enforce_customer_resource_limit();

DROP TRIGGER IF EXISTS enforce_news_source_limit ON public.news_sources;
CREATE TRIGGER enforce_news_source_limit
BEFORE INSERT OR UPDATE OF active ON public.news_sources
FOR EACH ROW WHEN (NEW.active IS TRUE)
EXECUTE FUNCTION public.enforce_customer_resource_limit();

DROP TRIGGER IF EXISTS enforce_post_template_limit ON public.post_templates;
CREATE TRIGGER enforce_post_template_limit
BEFORE INSERT ON public.post_templates
FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_resource_limit();

-- Original MP4 uploads are private and addressed by a verified storage path.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-cut-inputs', 'video-cut-inputs', false, 1073741824, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "video cut inputs owner select" ON storage.objects;
DROP POLICY IF EXISTS "video cut inputs owner insert" ON storage.objects;
DROP POLICY IF EXISTS "video cut inputs owner delete" ON storage.objects;
CREATE POLICY "video cut inputs owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'video-cut-inputs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "video cut inputs owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'video-cut-inputs'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) = 'mp4'
  );
CREATE POLICY "video cut inputs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'video-cut-inputs' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS source_storage_bucket text,
  ADD COLUMN IF NOT EXISTS source_storage_path text,
  ADD COLUMN IF NOT EXISTS analysis_mode text,
  ADD COLUMN IF NOT EXISTS analysis_warning text;

CREATE OR REPLACE FUNCTION public.create_video_cut_upload_job_v2(
  _instagram_account_id uuid,
  _storage_path text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL,
  _format text DEFAULT 'reels',
  _subtitle_style text DEFAULT 'classic',
  _auto_publish boolean DEFAULT false,
  _remove_silences boolean DEFAULT true,
  _zoom_effect boolean DEFAULT false,
  _smart_crop boolean DEFAULT true,
  _formats text[] DEFAULT NULL,
  _hook_enabled boolean DEFAULT true
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  created_job public.video_cut_jobs;
  expected_prefix text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT public.has_active_entitlement(v_user_id) THEN RAISE EXCEPTION 'active subscription required'; END IF;
  expected_prefix := v_user_id::text || '/cuts/uploads/';
  IF _storage_path IS NULL
     OR _storage_path NOT LIKE expected_prefix || '%'
     OR _storage_path LIKE '%..%'
     OR lower(_storage_path) NOT LIKE '%.mp4' THEN
    RAISE EXCEPTION 'invalid private video storage path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'video-cut-inputs' AND name = _storage_path
  ) THEN
    RAISE EXCEPTION 'uploaded video not found';
  END IF;

  created_job := public.create_video_cut_upload_job(
    _instagram_account_id,
    'storage://video-cut-inputs/' || _storage_path,
    _requested_clips,
    _rights_confirmed,
    _source_title,
    _format,
    _subtitle_style,
    _auto_publish,
    _remove_silences,
    _zoom_effect,
    _smart_crop,
    _formats,
    _hook_enabled
  );

  UPDATE public.video_cut_jobs
  SET source_video_url = NULL,
      source_storage_bucket = 'video-cut-inputs',
      source_storage_path = _storage_path
  WHERE id = created_job.id
  RETURNING * INTO created_job;
  RETURN created_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_cut_upload_job_v2(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job_v2(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean, text[], boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean, text[], boolean) FROM authenticated;

CREATE TABLE IF NOT EXISTS public.worker_health (
  worker_id text PRIMARY KEY,
  queue_mode text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.worker_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.worker_health FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.worker_health TO service_role;

CREATE OR REPLACE FUNCTION public.get_media_worker_health()
RETURNS TABLE(queue_mode text, last_seen_at timestamptz, healthy boolean, version text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  RETURN QUERY
  SELECT h.queue_mode, h.last_seen_at, h.last_seen_at > now() - interval '90 seconds', h.version
  FROM public.worker_health h
  ORDER BY h.queue_mode;
END;
$$;
REVOKE ALL ON FUNCTION public.get_media_worker_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_media_worker_health() TO authenticated;

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  confirmation_code text PRIMARY KEY,
  meta_user_id text NOT NULL,
  account_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'completed',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.data_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.data_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.delete_instagram_account_data(
  _meta_user_id text,
  _confirmation_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account_ids uuid[] := '{}'::uuid[];
  v_news_ids uuid[] := '{}'::uuid[];
  v_user_ids uuid[] := '{}'::uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF _meta_user_id IS NULL OR btrim(_meta_user_id) = '' THEN RAISE EXCEPTION 'meta user id required'; END IF;
  IF _confirmation_code !~ '^del_[a-f0-9]{32}$' THEN RAISE EXCEPTION 'invalid confirmation code'; END IF;

  SELECT COALESCE(array_agg(id), '{}'::uuid[]), COALESCE(array_agg(DISTINCT user_id), '{}'::uuid[])
  INTO v_account_ids, v_user_ids
  FROM public.instagram_accounts
  WHERE ig_user_id = _meta_user_id;

  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  INTO v_news_ids
  FROM public.news_items
  WHERE instagram_account_id = ANY(v_account_ids);

  DELETE FROM public.reel_render_jobs WHERE news_item_id = ANY(v_news_ids);
  DELETE FROM public.scheduled_posts WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.news_source_instagram_accounts WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.account_settings WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.follower_snapshots WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.meta_api_usage WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.content_topics WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.video_cut_jobs WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.news_items WHERE instagram_account_id = ANY(v_account_ids);
  DELETE FROM public.instagram_accounts WHERE id = ANY(v_account_ids);

  INSERT INTO public.data_deletion_requests (
    confirmation_code, meta_user_id, account_ids, status, completed_at, details
  ) VALUES (
    _confirmation_code, _meta_user_id, v_account_ids, 'completed', now(),
    jsonb_build_object('user_ids', v_user_ids, 'news_items_removed', cardinality(v_news_ids))
  ) ON CONFLICT (confirmation_code) DO NOTHING;

  RETURN jsonb_build_object(
    'confirmation_code', _confirmation_code,
    'account_ids', v_account_ids,
    'user_ids', v_user_ids,
    'news_item_ids', v_news_ids
  );
END;
$$;
REVOKE ALL ON FUNCTION public.delete_instagram_account_data(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_instagram_account_data(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
