-- Evolução do Cortes IA: presets, rastreabilidade de provedores, QA e identidade por conta.
ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS preset_key text NOT NULL DEFAULT 'viral',
  ADD COLUMN IF NOT EXISTS custom_prompt text,
  ADD COLUMN IF NOT EXISTS provider_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

ALTER TABLE public.video_cut_clips
  ADD COLUMN IF NOT EXISTS transcript_text text,
  ADD COLUMN IF NOT EXISTS quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS edit_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS render_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.video_cut_jobs DROP CONSTRAINT IF EXISTS video_cut_jobs_preset_key_check;
ALTER TABLE public.video_cut_jobs ADD CONSTRAINT video_cut_jobs_preset_key_check
  CHECK (preset_key IN ('viral','clean','podcast','product','highlights','custom'));

ALTER TABLE public.video_cut_jobs DROP CONSTRAINT IF EXISTS video_cut_jobs_custom_prompt_length_check;
ALTER TABLE public.video_cut_jobs ADD CONSTRAINT video_cut_jobs_custom_prompt_length_check
  CHECK (custom_prompt IS NULL OR length(custom_prompt) <= 2000);

CREATE INDEX IF NOT EXISTS idx_video_cut_jobs_source_expiry
  ON public.video_cut_jobs(source_expires_at)
  WHERE source_storage_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.video_cut_brand_profiles (
  instagram_account_id uuid PRIMARY KEY REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  font_family text NOT NULL DEFAULT 'Inter',
  primary_color text NOT NULL DEFAULT '#FFFFFF',
  highlight_color text NOT NULL DEFAULT '#FFD400',
  outline_color text NOT NULL DEFAULT '#000000',
  watermark_enabled boolean NOT NULL DEFAULT true,
  watermark_text text,
  subtitle_position text NOT NULL DEFAULT 'safe_bottom'
    CHECK (subtitle_position IN ('safe_bottom','center','upper_third')),
  default_preset_key text NOT NULL DEFAULT 'viral'
    CHECK (default_preset_key IN ('viral','clean','podcast','product','highlights','custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_cut_brand_profiles TO authenticated;
GRANT SELECT ON public.video_cut_brand_profiles TO service_role;
ALTER TABLE public.video_cut_brand_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own cut brand profile" ON public.video_cut_brand_profiles;
CREATE POLICY "users manage own cut brand profile"
  ON public.video_cut_brand_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.instagram_accounts account
      WHERE account.id = instagram_account_id AND account.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_video_cut_brand_profiles_updated_at ON public.video_cut_brand_profiles;
CREATE TRIGGER trg_video_cut_brand_profiles_updated_at
  BEFORE UPDATE ON public.video_cut_brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_expired_video_cut_sources(_limit integer DEFAULT 50)
RETURNS TABLE(job_id uuid, bucket text, storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  RETURN QUERY
  SELECT source.id, COALESCE(source.source_storage_bucket, 'video-cut-inputs'), source.source_storage_path
  FROM public.video_cut_jobs source
  WHERE source.source_storage_path IS NOT NULL
    AND source.source_expires_at <= now()
  ORDER BY source.source_expires_at
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_video_cut_sources(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_video_cut_sources(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_video_cut_source_deleted(_job_id uuid, _storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  UPDATE public.video_cut_jobs
  SET source_storage_path = NULL, source_storage_bucket = NULL, updated_at = now()
  WHERE id = _job_id AND source_storage_path = _storage_path AND source_expires_at <= now();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_video_cut_source_deleted(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_video_cut_source_deleted(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.regenerate_video_cut_job(
  _job_id uuid,
  _preset_key text DEFAULT 'viral',
  _custom_prompt text DEFAULT NULL
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  source_job public.video_cut_jobs;
  new_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF _preset_key NOT IN ('viral','clean','podcast','product','highlights','custom') THEN
    RAISE EXCEPTION 'Preset inválido.';
  END IF;
  IF _custom_prompt IS NOT NULL AND length(_custom_prompt) > 2000 THEN
    RAISE EXCEPTION 'Prompt personalizado muito longo.';
  END IF;

  SELECT * INTO source_job FROM public.video_cut_jobs
  WHERE id = _job_id AND user_id = v_user_id;
  IF source_job.id IS NULL THEN RAISE EXCEPTION 'Trabalho de corte não encontrado.'; END IF;

  IF source_job.source_kind = 'upload' THEN
    IF source_job.source_storage_path IS NULL OR source_job.source_expires_at <= now() THEN
      RAISE EXCEPTION 'O vídeo original expirou. Envie o MP4 novamente.';
    END IF;
    new_job := public.create_video_cut_upload_job_v2(
      source_job.instagram_account_id,
      source_job.source_storage_path,
      source_job.requested_clips,
      true,
      source_job.source_title,
      source_job.format,
      CASE WHEN source_job.subtitle_style IN ('none','classic','neon','karaoke') THEN source_job.subtitle_style ELSE 'classic' END,
      false,
      source_job.remove_silences,
      source_job.zoom_effect,
      source_job.smart_crop,
      source_job.formats,
      source_job.hook_enabled
    );
  ELSE
    new_job := public.create_video_cut_job(
      source_job.instagram_account_id,
      source_job.youtube_url,
      source_job.requested_clips,
      true,
      source_job.format,
      CASE WHEN source_job.subtitle_style IN ('none','classic','neon','karaoke') THEN source_job.subtitle_style ELSE 'classic' END,
      false,
      source_job.remove_silences,
      source_job.zoom_effect,
      source_job.smart_crop,
      source_job.formats,
      source_job.hook_enabled
    );
  END IF;

  UPDATE public.video_cut_jobs
  SET preset_key = _preset_key,
      custom_prompt = CASE WHEN _preset_key = 'custom' THEN NULLIF(btrim(_custom_prompt), '') ELSE NULL END,
      subtitle_style = CASE _preset_key
        WHEN 'viral' THEN 'bold' WHEN 'clean' THEN 'clean' WHEN 'product' THEN 'neon'
        WHEN 'highlights' THEN 'karaoke' ELSE 'classic' END,
      hook_enabled = (_preset_key <> 'clean'),
      remove_silences = (_preset_key <> 'highlights'),
      zoom_effect = (_preset_key IN ('viral','product','highlights')),
      smart_crop = true,
      provider_trace = jsonb_build_object('regenerated_from', source_job.id)
  WHERE id = new_job.id
  RETURNING * INTO new_job;
  RETURN new_job;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_video_cut_job(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_video_cut_job(uuid, text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.video_cut_rerender_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.video_cut_jobs(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES public.video_cut_clips(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.video_cut_rerender_requests TO authenticated;
GRANT ALL ON public.video_cut_rerender_requests TO service_role;
ALTER TABLE public.video_cut_rerender_requests ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_cut_rerender_one_active
  ON public.video_cut_rerender_requests(clip_id)
  WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_video_cut_rerender_queue
  ON public.video_cut_rerender_requests(status, created_at);

DROP POLICY IF EXISTS "users view own cut rerenders" ON public.video_cut_rerender_requests;
CREATE POLICY "users view own cut rerenders" ON public.video_cut_rerender_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_video_cut_rerender(
  _clip_id uuid,
  _start_seconds numeric,
  _end_seconds numeric,
  _subtitle_style text,
  _hook_text text DEFAULT NULL,
  _transcript_text text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  clip_row public.video_cut_clips;
  job_row public.video_cut_jobs;
  request_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO clip_row FROM public.video_cut_clips WHERE id = _clip_id AND user_id = v_user_id;
  IF clip_row.id IS NULL THEN RAISE EXCEPTION 'Corte não encontrado.'; END IF;
  IF clip_row.status = 'scheduled' THEN RAISE EXCEPTION 'Edite o agendamento antes de reprocessar um corte já agendado.'; END IF;
  SELECT * INTO job_row FROM public.video_cut_jobs WHERE id = clip_row.job_id AND user_id = v_user_id;
  IF job_row.id IS NULL THEN RAISE EXCEPTION 'Trabalho original não encontrado.'; END IF;
  IF job_row.source_kind = 'upload' AND (job_row.source_storage_path IS NULL OR job_row.source_expires_at <= now()) THEN
    RAISE EXCEPTION 'O vídeo original expirou. Envie o MP4 novamente.';
  END IF;
  IF _subtitle_style NOT IN ('none','classic','neon','karaoke','clean','bold') THEN RAISE EXCEPTION 'Estilo de legenda inválido.'; END IF;
  IF EXISTS (SELECT 1 FROM public.video_cut_rerender_requests WHERE clip_id = clip_row.id AND status IN ('queued','processing')) THEN
    RAISE EXCEPTION 'Este corte já está sendo reprocessado.';
  END IF;
  IF _start_seconds < 0 OR _end_seconds <= _start_seconds OR (_end_seconds - _start_seconds) < 3 OR (_end_seconds - _start_seconds) > 180 THEN
    RAISE EXCEPTION 'O trecho deve ter entre 3 e 180 segundos.';
  END IF;

  UPDATE public.video_cut_clips SET
    start_seconds = _start_seconds,
    end_seconds = _end_seconds,
    duration_seconds = _end_seconds - _start_seconds,
    subtitle_style = _subtitle_style,
    hook_text = NULLIF(btrim(_hook_text), ''),
    transcript_text = NULLIF(btrim(_transcript_text), ''),
    status = 'rendering',
    error_message = NULL,
    edit_config = jsonb_build_object('manual_transcript', _transcript_text IS NOT NULL),
    render_version = render_version + 1,
    updated_at = now()
  WHERE id = clip_row.id;

  INSERT INTO public.video_cut_rerender_requests(user_id, job_id, clip_id)
  VALUES (v_user_id, job_row.id, clip_row.id)
  RETURNING id INTO request_id;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_video_cut_rerender(uuid, numeric, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_video_cut_rerender(uuid, numeric, numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_video_cut_rerenders(_worker text, _limit integer DEFAULT 1)
RETURNS SETOF public.video_cut_rerender_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN RAISE EXCEPTION 'service role required'; END IF;
  RETURN QUERY
  WITH selected AS (
    SELECT id FROM public.video_cut_rerender_requests
    WHERE status = 'queued'
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 1), 5))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.video_cut_rerender_requests requests
  SET status = 'processing', attempts = attempts + 1, locked_at = now(), locked_by = _worker
  FROM selected WHERE requests.id = selected.id
  RETURNING requests.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_video_cut_rerenders(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_cut_rerenders(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';