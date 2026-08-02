-- Cancelamento cooperativo e isolado de trabalhos de Cortes IA.
-- A operação é atômica: muda apenas o job escolhido e devolve os créditos
-- ainda reservados sem apagar histórico, fonte ou trabalhos de outros usuários.

CREATE OR REPLACE FUNCTION public.cancel_video_cut_job(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job public.video_cut_jobs;
  v_usage_date date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  SELECT *
    INTO v_job
  FROM public.video_cut_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'not_found');
  END IF;

  IF v_job.user_id <> v_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  IF v_job.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'cancelled', true,
      'already_cancelled', true,
      'previous_status', 'cancelled'
    );
  END IF;

  IF v_job.status NOT IN ('queued', 'analyzing', 'processing') THEN
    RAISE EXCEPTION 'Só é possível cancelar trabalhos que estão na fila ou em processamento.';
  END IF;

  v_usage_date := (timezone('America/Sao_Paulo', v_job.created_at))::date;

  IF v_job.reserved_clips > 0 THEN
    INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
    VALUES (v_job.user_id, v_usage_date)
    ON CONFLICT (user_id, usage_date) DO NOTHING;

    UPDATE public.video_cut_usage_daily
       SET reserved_count = GREATEST(0, reserved_count - v_job.reserved_clips),
           updated_at = now()
     WHERE user_id = v_job.user_id
       AND usage_date = v_usage_date;
  END IF;

  UPDATE public.video_cut_jobs
     SET status = 'cancelled',
         reserved_clips = 0,
         generated_clips = 0,
         claimed_at = NULL,
         claimed_by = NULL,
         completed_at = now(),
         error_message = NULL,
         updated_at = now()
   WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'cancelled', true,
    'already_cancelled', false,
    'previous_status', v_job.status,
    'released_credits', v_job.reserved_clips
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_video_cut_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_video_cut_job(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_video_cut_job(uuid) IS
  'Cancela de forma idempotente um job ativo do próprio usuário e libera sua reserva diária.';

NOTIFY pgrst, 'reload schema';