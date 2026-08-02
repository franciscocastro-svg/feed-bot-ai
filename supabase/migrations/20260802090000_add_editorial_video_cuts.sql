-- Corte Editorial: modo aditivo de Cortes IA com revisao humana obrigatoria.
-- Os formatos existentes continuam usando o fluxo anterior.

ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS cut_mode text;

ALTER TABLE public.video_cut_jobs
  ALTER COLUMN cut_mode SET DEFAULT 'subtitled';

UPDATE public.video_cut_jobs
SET cut_mode = CASE WHEN subtitle_style = 'none' THEN 'traditional' ELSE 'subtitled' END
WHERE cut_mode IS NULL OR cut_mode NOT IN ('traditional', 'subtitled', 'editorial');

ALTER TABLE public.video_cut_jobs
  ALTER COLUMN cut_mode SET NOT NULL;

ALTER TABLE public.video_cut_jobs
  DROP CONSTRAINT IF EXISTS video_cut_jobs_cut_mode_check;
ALTER TABLE public.video_cut_jobs
  ADD CONSTRAINT video_cut_jobs_cut_mode_check
  CHECK (cut_mode IN ('traditional', 'subtitled', 'editorial'));

ALTER TABLE public.video_cut_clips
  ADD COLUMN IF NOT EXISTS editorial_comment text,
  ADD COLUMN IF NOT EXISTS editorial_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS editorial_confidence numeric,
  ADD COLUMN IF NOT EXISTS editorial_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editorial_review_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS editorial_preview_url text,
  ADD COLUMN IF NOT EXISTS editorial_text_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.video_cut_clips
  DROP CONSTRAINT IF EXISTS video_cut_clips_editorial_confidence_check;
ALTER TABLE public.video_cut_clips
  ADD CONSTRAINT video_cut_clips_editorial_confidence_check
  CHECK (editorial_confidence IS NULL OR editorial_confidence BETWEEN 0 AND 1);

ALTER TABLE public.video_cut_clips
  DROP CONSTRAINT IF EXISTS video_cut_clips_editorial_text_length_check;
ALTER TABLE public.video_cut_clips
  ADD CONSTRAINT video_cut_clips_editorial_text_length_check
  CHECK (
    (title IS NULL OR length(title) <= 140)
    AND (editorial_comment IS NULL OR length(editorial_comment) <= 600)
  );

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_job(
  _instagram_account_id uuid,
  _youtube_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _subtitle_style text DEFAULT 'clean'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
  v_style text := CASE
    WHEN _subtitle_style IN ('none','classic','neon','karaoke','clean','bold') THEN _subtitle_style
    ELSE 'clean'
  END;
BEGIN
  v_job := public.create_video_cut_job(
    _instagram_account_id,
    _youtube_url,
    _requested_clips,
    _rights_confirmed,
    'feed_portrait',
    v_style,
    false,
    true,
    false,
    true,
    ARRAY['feed_portrait']::text[],
    false
  );

  UPDATE public.video_cut_jobs
  SET cut_mode = 'editorial',
      format = 'feed_portrait',
      formats = ARRAY['feed_portrait']::text[],
      auto_publish = false,
      hook_enabled = false,
      processing_mode = 'cloud',
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_job(uuid, text, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_job(uuid, text, integer, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_upload_job(
  _instagram_account_id uuid,
  _storage_path text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL,
  _subtitle_style text DEFAULT 'clean'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
  v_style text := CASE
    WHEN _subtitle_style IN ('none','classic','neon','karaoke','clean','bold') THEN _subtitle_style
    ELSE 'clean'
  END;
BEGIN
  v_job := public.create_video_cut_upload_job_v2(
    _instagram_account_id,
    _storage_path,
    _requested_clips,
    _rights_confirmed,
    _source_title,
    'feed_portrait',
    v_style,
    false,
    true,
    false,
    true,
    ARRAY['feed_portrait']::text[],
    false
  );

  UPDATE public.video_cut_jobs
  SET cut_mode = 'editorial',
      format = 'feed_portrait',
      formats = ARRAY['feed_portrait']::text[],
      auto_publish = false,
      hook_enabled = false,
      processing_mode = 'cloud',
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_upload_job(uuid, text, integer, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_upload_job(uuid, text, integer, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_editorial_cut_render(
  _clip_id uuid,
  _title text,
  _editorial_comment text,
  _start_seconds numeric,
  _end_seconds numeric,
  _subtitle_style text,
  _transcript_text text,
  _editorial_config jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clip public.video_cut_clips;
  v_job public.video_cut_jobs;
  v_request_id uuid;
  v_config jsonb := COALESCE(_editorial_config, '{}'::jsonb);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;

  SELECT * INTO v_clip
  FROM public.video_cut_clips
  WHERE id = _clip_id AND user_id = v_user_id;
  IF v_clip.id IS NULL THEN RAISE EXCEPTION 'Corte não encontrado.'; END IF;

  SELECT * INTO v_job
  FROM public.video_cut_jobs
  WHERE id = v_clip.job_id AND user_id = v_user_id;
  IF v_job.id IS NULL OR v_job.cut_mode <> 'editorial' THEN
    RAISE EXCEPTION 'Este corte não usa o formato editorial.';
  END IF;
  IF v_clip.status = 'scheduled' THEN
    RAISE EXCEPTION 'Edite o agendamento antes de reprocessar um corte agendado.';
  END IF;
  IF v_job.source_kind = 'upload'
     AND (v_job.source_storage_path IS NULL OR v_job.source_expires_at <= now()) THEN
    RAISE EXCEPTION 'O vídeo original expirou. Envie o MP4 novamente.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.video_cut_rerender_requests
    WHERE clip_id = v_clip.id AND status IN ('queued','processing')
  ) THEN
    RAISE EXCEPTION 'Este corte já está sendo processado.';
  END IF;
  IF _start_seconds < 0 OR _end_seconds <= _start_seconds
     OR (_end_seconds - _start_seconds) < 3 OR (_end_seconds - _start_seconds) > 180 THEN
    RAISE EXCEPTION 'O trecho deve ter entre 3 e 180 segundos.';
  END IF;
  IF _subtitle_style NOT IN ('none','classic','neon','karaoke','clean','bold') THEN
    RAISE EXCEPTION 'Estilo de legenda inválido.';
  END IF;
  IF length(btrim(COALESCE(_title, ''))) < 4 OR length(btrim(_title)) > 140 THEN
    RAISE EXCEPTION 'O título deve ter entre 4 e 140 caracteres.';
  END IF;
  IF length(btrim(COALESCE(_editorial_comment, ''))) < 10
     OR length(btrim(_editorial_comment)) > 600 THEN
    RAISE EXCEPTION 'O comentário deve ter entre 10 e 600 caracteres.';
  END IF;
  IF COALESCE(v_config->>'framing', 'blur_fit') NOT IN ('blur_fit','smart_crop','contain') THEN
    RAISE EXCEPTION 'Enquadramento inválido.';
  END IF;
  IF v_config ? 'primary_color'
     AND (v_config->>'primary_color') !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor principal inválida.';
  END IF;
  IF v_config ? 'accent_color'
     AND (v_config->>'accent_color') !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Cor de destaque inválida.';
  END IF;

  UPDATE public.video_cut_clips
  SET title = btrim(_title),
      editorial_comment = btrim(_editorial_comment),
      caption = btrim(_editorial_comment),
      start_seconds = _start_seconds,
      end_seconds = _end_seconds,
      duration_seconds = _end_seconds - _start_seconds,
      subtitle_style = _subtitle_style,
      transcript_text = NULLIF(btrim(_transcript_text), ''),
      editorial_config = jsonb_strip_nulls(v_config),
      editorial_review_confirmed_at = now(),
      status = 'rendering',
      video_url = NULL,
      error_message = NULL,
      edit_config = COALESCE(edit_config, '{}'::jsonb) || jsonb_build_object(
        'editorial_final_requested', true,
        'manual_transcript', NULLIF(btrim(_transcript_text), '') IS NOT NULL,
        'editorial_timing_changed',
          abs(COALESCE(v_clip.start_seconds, 0) - _start_seconds) >= 0.05
          OR abs(COALESCE(v_clip.end_seconds, 0) - _end_seconds) >= 0.05
      ),
      render_version = render_version + 1,
      updated_at = now()
  WHERE id = v_clip.id;

  INSERT INTO public.video_cut_rerender_requests(user_id, job_id, clip_id)
  VALUES (v_user_id, v_job.id, v_clip.id)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_editorial_cut_render(uuid, text, text, numeric, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_editorial_cut_render(uuid, text, text, numeric, numeric, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_unreviewed_editorial_cut_schedule()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.news_item_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.video_cut_clips clip
    JOIN public.video_cut_jobs job ON job.id = clip.job_id
    WHERE clip.news_item_id = NEW.news_item_id
      AND job.cut_mode = 'editorial'
      AND (clip.editorial_review_confirmed_at IS NULL OR clip.video_url IS NULL)
  ) THEN
    RAISE EXCEPTION 'Corte Editorial exige revisão e renderização final antes do agendamento.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_unreviewed_editorial_cut_schedule ON public.scheduled_posts;
CREATE TRIGGER trg_guard_unreviewed_editorial_cut_schedule
  BEFORE INSERT OR UPDATE OF news_item_id, status ON public.scheduled_posts
  FOR EACH ROW
  WHEN (NEW.status IN ('scheduled','posting','awaiting_container'))
  EXECUTE FUNCTION public.guard_unreviewed_editorial_cut_schedule();
