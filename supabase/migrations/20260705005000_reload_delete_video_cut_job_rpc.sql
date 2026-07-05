-- Recreate the AI cut delete RPC and force PostgREST to reload its schema cache.

CREATE OR REPLACE FUNCTION public.delete_video_cut_job(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_job record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  SELECT id, user_id, status
    INTO v_job
  FROM public.video_cut_jobs
  WHERE id = _job_id;

  IF v_job.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_job.user_id <> v_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  IF v_job.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Só é possível excluir trabalhos que falharam ou foram cancelados.';
  END IF;

  DELETE FROM public.video_cut_jobs
  WHERE id = _job_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_video_cut_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_video_cut_job(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
