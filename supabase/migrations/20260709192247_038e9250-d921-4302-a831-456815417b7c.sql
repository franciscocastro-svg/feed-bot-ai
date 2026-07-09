
CREATE OR REPLACE FUNCTION public.create_video_cut_upload_job(
  _instagram_account_id uuid,
  _video_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL
)
RETURNS public.video_cut_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_account record;
  v_limits public.plan_limits;
  v_usage record;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_requested integer;
  v_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;

  IF NOT _rights_confirmed THEN
    RAISE EXCEPTION 'Confirme que você tem autorização para usar este vídeo.';
  END IF;

  IF _video_url IS NULL OR btrim(_video_url) = '' THEN
    RAISE EXCEPTION 'Vídeo enviado não recebeu URL válida.';
  END IF;

  SELECT id, user_id, active INTO v_account
  FROM public.instagram_accounts WHERE id = _instagram_account_id;

  IF v_account.id IS NULL OR v_account.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Conta do Instagram inválida para este usuário.';
  END IF;

  IF COALESCE(v_account.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A conta do Instagram selecionada está inativa.';
  END IF;

  SELECT * INTO v_limits FROM public.get_user_plan_limits(v_user_id);
  IF v_limits.plan IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado.';
  END IF;

  IF v_limits.max_cuts_per_day = 0 THEN
    RAISE EXCEPTION 'Seu plano ainda não inclui Cortes IA.';
  END IF;

  IF COALESCE(v_limits.max_cuts_per_job, 0) <= 0 THEN
    RAISE EXCEPTION 'Seu plano não permite gerar cortes neste momento.';
  END IF;

  v_requested := GREATEST(1, LEAST(COALESCE(_requested_clips, 1), LEAST(v_limits.max_cuts_per_job, 5)));

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count, reserved_count INTO v_usage
  FROM public.video_cut_usage_daily
  WHERE user_id = v_user_id AND usage_date = v_today
  FOR UPDATE;

  IF v_limits.max_cuts_per_day >= 0
     AND (v_usage.used_count + v_usage.reserved_count + v_requested) > v_limits.max_cuts_per_day THEN
    RAISE EXCEPTION 'Limite diário de Cortes IA atingido. Usados/reservados: %, limite: %.',
      (v_usage.used_count + v_usage.reserved_count), v_limits.max_cuts_per_day;
  END IF;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = reserved_count + v_requested,
      updated_at = now()
  WHERE user_id = v_user_id AND usage_date = v_today;

  INSERT INTO public.video_cut_jobs (
    user_id,
    instagram_account_id,
    youtube_url,
    source_kind,
    source_video_url,
    source_title,
    requested_clips,
    reserved_clips,
    rights_confirmed,
    status,
    progress
  ) VALUES (
    v_user_id,
    _instagram_account_id,
    trim(_video_url),
    'upload',
    trim(_video_url),
    NULLIF(btrim(COALESCE(_source_title, '')), ''),
    v_requested,
    v_requested,
    true,
    'queued',
    0
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text) TO authenticated;
