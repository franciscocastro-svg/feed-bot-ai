-- Cortes IA por Link 1A: canonicalização, diagnóstico de captura e claim resiliente.

ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS source_video_id text,
  ADD COLUMN IF NOT EXISTS capture_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS capture_error_code text,
  ADD COLUMN IF NOT EXISTS capture_checked_at timestamptz;

ALTER TABLE public.video_cut_jobs
  DROP CONSTRAINT IF EXISTS video_cut_jobs_capture_status_check;

ALTER TABLE public.video_cut_jobs
  ADD CONSTRAINT video_cut_jobs_capture_status_check
  CHECK (capture_status IN ('pending', 'checking', 'ready', 'failed', 'not_applicable'));

CREATE INDEX IF NOT EXISTS idx_video_cut_jobs_source_video
  ON public.video_cut_jobs (user_id, source_video_id, created_at DESC)
  WHERE source_video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_cut_jobs_capture_status
  ON public.video_cut_jobs (capture_status, updated_at DESC)
  WHERE source_kind = 'youtube' OR source_kind IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_youtube_video_url(_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_url text := btrim(COALESCE(_url, ''));
  v_match text[];
  v_id text;
BEGIN
  IF v_url ~* '^https?://(www\.)?youtu\.be/' THEN
    v_match := regexp_match(v_url, '^https?://(www\.)?youtu\.be/([A-Za-z0-9_-]{11})([/?#].*)?$', 'i');
    v_id := v_match[2];
  ELSIF v_url ~* '^https?://(www\.|m\.|music\.)?youtube\.com/' THEN
    v_match := regexp_match(v_url, '[?&]v=([A-Za-z0-9_-]{11})(&|#|$)', 'i');
    IF v_match IS NOT NULL THEN
      v_id := v_match[1];
    ELSE
      v_match := regexp_match(v_url, '^https?://(www\.|m\.|music\.)?youtube\.com/(shorts|live|embed)/([A-Za-z0-9_-]{11})([/?#].*)?$', 'i');
      v_id := v_match[3];
    END IF;
  END IF;

  IF v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]{11}$' THEN
    RETURN NULL;
  END IF;
  RETURN 'https://www.youtube.com/watch?v=' || v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_video_cut_youtube_capture_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_url text;
  v_video_id text;
BEGIN
  IF COALESCE(NEW.source_kind, 'youtube') <> 'youtube' THEN
    NEW.capture_status := 'not_applicable';
    NEW.capture_error_code := NULL;
    NEW.capture_checked_at := NULL;
    RETURN NEW;
  END IF;

  v_url := public.normalize_youtube_video_url(NEW.youtube_url);
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'Informe um link direto de vídeo, Short ou live gravada do YouTube.' USING ERRCODE = '22023';
  END IF;
  v_video_id := substring(v_url from 'v=([A-Za-z0-9_-]{11})$');

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text), hashtext(v_video_id));
  IF EXISTS (
    SELECT 1
      FROM public.video_cut_jobs existing
     WHERE existing.user_id = NEW.user_id
       AND existing.source_video_id = v_video_id
       AND existing.id <> NEW.id
       AND existing.status IN ('queued', 'analyzing', 'processing')
  ) THEN
    RAISE EXCEPTION 'Este vídeo já possui um trabalho em andamento.' USING ERRCODE = '23505';
  END IF;

  NEW.youtube_url := v_url;
  NEW.source_video_id := v_video_id;
  IF TG_OP = 'INSERT' THEN
    NEW.capture_status := 'pending';
    NEW.capture_error_code := NULL;
    NEW.capture_checked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_video_cut_youtube_capture_guard ON public.video_cut_jobs;
CREATE TRIGGER tg_video_cut_youtube_capture_guard
BEFORE INSERT OR UPDATE OF youtube_url, source_kind
ON public.video_cut_jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_video_cut_youtube_capture_guard();

-- Jobs longos mantêm claimed_at/updated_at por heartbeat. A recuperação só
-- ocorre depois de 30 minutos sem nenhum sinal do worker, não pela duração do corte.
CREATE OR REPLACE FUNCTION public.claim_video_cut_jobs(_worker text, _limit integer DEFAULT 1)
RETURNS SETOF public.video_cut_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  WITH recovered AS (
    UPDATE public.video_cut_jobs
       SET status = 'queued',
           claimed_at = NULL,
           claimed_by = NULL,
           error_message = COALESCE(error_message, 'Job recuperado após worker ficar sem heartbeat'),
           updated_at = now()
     WHERE status IN ('analyzing', 'processing')
       AND COALESCE(updated_at, claimed_at) < now() - interval '30 minutes'
       AND attempts < max_attempts
     RETURNING id
  ),
  next_jobs AS (
    SELECT id
      FROM public.video_cut_jobs
     WHERE status = 'queued'
       AND attempts < max_attempts
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 1), 10))
  )
  UPDATE public.video_cut_jobs job
     SET status = 'analyzing',
         progress = GREATEST(job.progress, 5),
         claimed_at = now(),
         claimed_by = _worker,
         started_at = COALESCE(job.started_at, now()),
         attempts = job.attempts + 1,
         updated_at = now()
    FROM next_jobs
   WHERE job.id = next_jobs.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_youtube_video_url(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_youtube_video_url(text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_video_cut_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_cut_jobs(text, integer) TO service_role;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT proc.oid::regprocedure AS signature
      FROM pg_proc proc
      JOIN pg_namespace ns ON ns.oid = proc.pronamespace
     WHERE ns.nspname = 'public'
       AND proc.proname = 'create_video_cut_job'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.signature);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_video_cut_youtube_capture_guard() FROM PUBLIC, anon, authenticated;
