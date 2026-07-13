ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS processing_mode text NOT NULL DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS local_file_name text,
  ADD COLUMN IF NOT EXISTS local_file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS local_render_expires_at timestamptz;

ALTER TABLE public.video_cut_jobs DROP CONSTRAINT IF EXISTS video_cut_jobs_processing_mode_check;
ALTER TABLE public.video_cut_jobs ADD CONSTRAINT video_cut_jobs_processing_mode_check
  CHECK (processing_mode IN ('cloud', 'local_device'));

DROP POLICY IF EXISTS "local cut audio owner select" ON storage.objects;
DROP POLICY IF EXISTS "local cut audio owner insert" ON storage.objects;
DROP POLICY IF EXISTS "local cut audio owner delete" ON storage.objects;
CREATE POLICY "local cut audio owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'video-cut-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "local cut audio owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-cut-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "local cut audio owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'video-cut-audio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.create_local_video_cut_job(
  _instagram_account_id uuid,
  _audio_storage_path text,
  _source_file_name text,
  _source_file_size_bytes bigint,
  _duration_seconds integer,
  _requested_clips integer,
  _rights_confirmed boolean,
  _format text DEFAULT 'reels',
  _subtitle_style text DEFAULT 'classic',
  _remove_silences boolean DEFAULT true,
  _zoom_effect boolean DEFAULT false,
  _smart_crop boolean DEFAULT true,
  _formats text[] DEFAULT NULL,
  _hook_enabled boolean DEFAULT true,
  _preset_key text DEFAULT 'viral',
  _custom_prompt text DEFAULT NULL
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job public.video_cut_jobs;
  v_limits public.plan_limits;
  v_expected_prefix text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT _rights_confirmed THEN RAISE EXCEPTION 'Confirme que você possui autorização sobre o vídeo.'; END IF;
  IF _duration_seconds < 3 THEN RAISE EXCEPTION 'O vídeo precisa ter pelo menos 3 segundos.'; END IF;
  IF _preset_key NOT IN ('viral','clean','podcast','product','highlights','custom') THEN RAISE EXCEPTION 'Preset inválido.'; END IF;
  IF _custom_prompt IS NOT NULL AND length(_custom_prompt) > 2000 THEN RAISE EXCEPTION 'Prompt personalizado muito longo.'; END IF;

  v_expected_prefix := v_user_id::text || '/cuts/audio/';
  IF _audio_storage_path IS NULL OR _audio_storage_path NOT LIKE v_expected_prefix || '%'
     OR _audio_storage_path LIKE '%..%' THEN RAISE EXCEPTION 'Caminho de áudio inválido.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'video-cut-audio' AND name = _audio_storage_path
  ) THEN RAISE EXCEPTION 'Áudio local não encontrado.'; END IF;

  SELECT * INTO v_limits FROM public.get_user_plan_limits(v_user_id);
  IF _duration_seconds > GREATEST(1, COALESCE(v_limits.max_cut_video_minutes, 60)) * 60 THEN
    RAISE EXCEPTION 'O vídeo ultrapassa o limite de duração do plano.';
  END IF;

  v_job := public.create_video_cut_upload_job(
    _instagram_account_id,
    'local-audio://' || gen_random_uuid()::text,
    _requested_clips,
    true,
    _source_file_name,
    _format,
    CASE WHEN _subtitle_style IN ('none','classic','neon','karaoke') THEN _subtitle_style ELSE 'classic' END,
    false,
    _remove_silences,
    _zoom_effect,
    _smart_crop,
    _formats,
    _hook_enabled
  );

  UPDATE public.video_cut_jobs SET
    source_kind = 'local_audio',
    processing_mode = 'local_device',
    source_video_url = NULL,
    source_storage_bucket = 'video-cut-audio',
    source_storage_path = _audio_storage_path,
    source_title = NULLIF(btrim(_source_file_name), ''),
    local_file_name = NULLIF(btrim(_source_file_name), ''),
    local_file_size_bytes = GREATEST(0, COALESCE(_source_file_size_bytes, 0)),
    duration_seconds = _duration_seconds,
    source_expires_at = now() + interval '24 hours',
    local_render_expires_at = now() + interval '24 hours',
    preset_key = _preset_key,
    custom_prompt = CASE WHEN _preset_key = 'custom' THEN NULLIF(btrim(_custom_prompt), '') ELSE NULL END,
    subtitle_style = _subtitle_style,
    updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_local_video_cut_job(uuid,text,text,bigint,integer,integer,boolean,text,text,boolean,boolean,boolean,text[],boolean,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_local_video_cut_job(uuid,text,text,bigint,integer,integer,boolean,text,text,boolean,boolean,boolean,text[],boolean,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_local_video_cut_job(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job public.video_cut_jobs;
  v_total integer;
  v_ready integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  SELECT * INTO v_job FROM public.video_cut_jobs
  WHERE id = _job_id AND user_id = v_user_id AND processing_mode = 'local_device'
  FOR UPDATE;
  IF v_job.id IS NULL THEN RAISE EXCEPTION 'Trabalho local não encontrado.'; END IF;

  SELECT count(*), count(*) FILTER (WHERE video_url IS NOT NULL AND status IN ('draft','approved','scheduled'))
  INTO v_total, v_ready FROM public.video_cut_clips WHERE job_id = v_job.id;
  IF v_total = 0 OR v_ready <> v_total THEN RETURN false; END IF;

  UPDATE public.video_cut_jobs SET
    status = 'ready', progress = 100, generated_clips = v_ready,
    completed_at = now(), source_storage_path = NULL, source_storage_bucket = NULL,
    updated_at = now()
  WHERE id = v_job.id;
  PERFORM public.finalize_video_cut_job_usage(v_job.id, v_ready);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_local_video_cut_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_local_video_cut_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_video_cut_source_deleted(_job_id uuid, _storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  SELECT * INTO v_job FROM public.video_cut_jobs
  WHERE id = _job_id AND source_storage_path = _storage_path AND source_expires_at <= now()
  FOR UPDATE;
  IF v_job.id IS NULL THEN RETURN false; END IF;

  UPDATE public.video_cut_jobs SET
    source_storage_path = NULL, source_storage_bucket = NULL,
    status = CASE WHEN processing_mode = 'local_device' AND generated_clips = 0 THEN 'failed' ELSE status END,
    error_message = CASE WHEN processing_mode = 'local_device' AND generated_clips = 0
      THEN 'A renderização local expirou. Selecione o vídeo novamente para criar novos cortes.' ELSE error_message END,
    updated_at = now()
  WHERE id = v_job.id;
  IF v_job.processing_mode = 'local_device' AND v_job.generated_clips = 0 THEN
    PERFORM public.finalize_video_cut_job_usage(v_job.id, 0);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_video_cut_source_deleted(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_video_cut_source_deleted(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';