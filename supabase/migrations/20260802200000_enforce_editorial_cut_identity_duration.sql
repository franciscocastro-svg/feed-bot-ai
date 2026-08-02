-- Corte Editorial: duração mínima de 20 segundos em defesa de profundidade.
-- O trigger não reescreve clipes históricos; apenas impede novas gravações ou
-- revisões editoriais abaixo do novo mínimo.

CREATE OR REPLACE FUNCTION public.guard_editorial_cut_min_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cut_mode text;
  v_duration numeric;
BEGIN
  SELECT job.cut_mode INTO v_cut_mode
  FROM public.video_cut_jobs AS job
  WHERE job.id = NEW.job_id;

  IF v_cut_mode = 'editorial' THEN
    v_duration := COALESCE(NEW.end_seconds - NEW.start_seconds, NEW.duration_seconds, 0);
    IF NEW.start_seconds IS NULL
       OR NEW.end_seconds IS NULL
       OR NEW.end_seconds <= NEW.start_seconds
       OR v_duration < 20
       OR v_duration > 180 THEN
      RAISE EXCEPTION 'O Corte Editorial deve ter entre 20 e 180 segundos.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_editorial_cut_min_duration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_editorial_cut_min_duration ON public.video_cut_clips;
CREATE TRIGGER trg_guard_editorial_cut_min_duration
  BEFORE INSERT OR UPDATE OF job_id, start_seconds, end_seconds, duration_seconds
  ON public.video_cut_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_editorial_cut_min_duration();

COMMENT ON FUNCTION public.guard_editorial_cut_min_duration() IS
  'Impede criar ou revisar Corte Editorial com menos de 20 ou mais de 180 segundos.';
