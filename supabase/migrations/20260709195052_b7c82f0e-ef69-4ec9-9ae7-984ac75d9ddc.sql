
-- 1) Add columns to jobs and clips
ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS subtitle_style text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remove_silences boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS zoom_effect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smart_crop boolean NOT NULL DEFAULT true;

ALTER TABLE public.video_cut_clips
  ADD COLUMN IF NOT EXISTS subtitle_style text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS transcript jsonb;

-- 2) Update RPC: youtube job
CREATE OR REPLACE FUNCTION public.create_video_cut_job(
  _instagram_account_id uuid,
  _youtube_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _format text DEFAULT 'reels',
  _subtitle_style text DEFAULT 'classic',
  _auto_publish boolean DEFAULT false,
  _remove_silences boolean DEFAULT true,
  _zoom_effect boolean DEFAULT false,
  _smart_crop boolean DEFAULT true
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
  v_format text := COALESCE(_format, 'reels');
  v_subs text := COALESCE(_subtitle_style, 'classic');
  v_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT _rights_confirmed THEN RAISE EXCEPTION 'Confirme que você tem autorização para usar este vídeo.'; END IF;
  IF _youtube_url IS NULL OR _youtube_url !~* '^https?://(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)/' THEN
    RAISE EXCEPTION 'Informe um link público válido do YouTube.';
  END IF;
  IF v_format NOT IN ('feed_square','feed_portrait','reels') THEN
    RAISE EXCEPTION 'Formato inválido.';
  END IF;
  IF v_subs NOT IN ('none','classic','neon','karaoke') THEN
    RAISE EXCEPTION 'Estilo de legenda inválido.';
  END IF;

  SELECT id, user_id, active INTO v_account FROM public.instagram_accounts WHERE id = _instagram_account_id;
  IF v_account.id IS NULL OR v_account.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Conta do Instagram inválida para este usuário.';
  END IF;
  IF COALESCE(v_account.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A conta do Instagram selecionada está inativa.';
  END IF;

  SELECT * INTO v_limits FROM public.get_user_plan_limits(v_user_id);
  IF v_limits.plan IS NULL THEN RAISE EXCEPTION 'Plano não encontrado.'; END IF;
  IF v_limits.max_cuts_per_day = 0 THEN RAISE EXCEPTION 'Seu plano ainda não inclui Cortes IA.'; END IF;
  IF COALESCE(v_limits.max_cuts_per_job, 0) <= 0 THEN RAISE EXCEPTION 'Seu plano não permite gerar cortes neste momento.'; END IF;

  v_requested := GREATEST(1, LEAST(COALESCE(_requested_clips, 1), LEAST(v_limits.max_cuts_per_job, 5)));

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count, reserved_count INTO v_usage
  FROM public.video_cut_usage_daily
  WHERE user_id = v_user_id AND usage_date = v_today FOR UPDATE;

  IF v_limits.max_cuts_per_day >= 0
     AND (v_usage.used_count + v_usage.reserved_count + v_requested) > v_limits.max_cuts_per_day THEN
    RAISE EXCEPTION 'Limite diário de Cortes IA atingido. Usados/reservados: %, limite: %.',
      (v_usage.used_count + v_usage.reserved_count), v_limits.max_cuts_per_day;
  END IF;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = reserved_count + v_requested, updated_at = now()
  WHERE user_id = v_user_id AND usage_date = v_today;

  INSERT INTO public.video_cut_jobs (
    user_id, instagram_account_id, youtube_url,
    requested_clips, reserved_clips, rights_confirmed, status, progress, format,
    subtitle_style, auto_publish, remove_silences, zoom_effect, smart_crop
  ) VALUES (
    v_user_id, _instagram_account_id, trim(_youtube_url),
    v_requested, v_requested, true, 'queued', 0, v_format,
    v_subs, COALESCE(_auto_publish, false), COALESCE(_remove_silences, true),
    COALESCE(_zoom_effect, false), COALESCE(_smart_crop, true)
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$;

-- 3) Update RPC: upload job
CREATE OR REPLACE FUNCTION public.create_video_cut_upload_job(
  _instagram_account_id uuid,
  _video_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL,
  _format text DEFAULT 'reels',
  _subtitle_style text DEFAULT 'classic',
  _auto_publish boolean DEFAULT false,
  _remove_silences boolean DEFAULT true,
  _zoom_effect boolean DEFAULT false,
  _smart_crop boolean DEFAULT true
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
  v_format text := COALESCE(_format, 'reels');
  v_subs text := COALESCE(_subtitle_style, 'classic');
  v_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT _rights_confirmed THEN RAISE EXCEPTION 'Confirme que você tem autorização para usar este vídeo.'; END IF;
  IF _video_url IS NULL OR btrim(_video_url) = '' THEN RAISE EXCEPTION 'Vídeo enviado não recebeu URL válida.'; END IF;
  IF v_format NOT IN ('feed_square','feed_portrait','reels') THEN
    RAISE EXCEPTION 'Formato inválido.';
  END IF;
  IF v_subs NOT IN ('none','classic','neon','karaoke') THEN
    RAISE EXCEPTION 'Estilo de legenda inválido.';
  END IF;

  SELECT id, user_id, active INTO v_account FROM public.instagram_accounts WHERE id = _instagram_account_id;
  IF v_account.id IS NULL OR v_account.user_id <> v_user_id THEN
    RAISE EXCEPTION 'Conta do Instagram inválida para este usuário.';
  END IF;
  IF COALESCE(v_account.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A conta do Instagram selecionada está inativa.';
  END IF;

  SELECT * INTO v_limits FROM public.get_user_plan_limits(v_user_id);
  IF v_limits.plan IS NULL THEN RAISE EXCEPTION 'Plano não encontrado.'; END IF;
  IF v_limits.max_cuts_per_day = 0 THEN RAISE EXCEPTION 'Seu plano ainda não inclui Cortes IA.'; END IF;
  IF COALESCE(v_limits.max_cuts_per_job, 0) <= 0 THEN RAISE EXCEPTION 'Seu plano não permite gerar cortes neste momento.'; END IF;

  v_requested := GREATEST(1, LEAST(COALESCE(_requested_clips, 1), LEAST(v_limits.max_cuts_per_job, 5)));

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count, reserved_count INTO v_usage
  FROM public.video_cut_usage_daily
  WHERE user_id = v_user_id AND usage_date = v_today FOR UPDATE;

  IF v_limits.max_cuts_per_day >= 0
     AND (v_usage.used_count + v_usage.reserved_count + v_requested) > v_limits.max_cuts_per_day THEN
    RAISE EXCEPTION 'Limite diário de Cortes IA atingido. Usados/reservados: %, limite: %.',
      (v_usage.used_count + v_usage.reserved_count), v_limits.max_cuts_per_day;
  END IF;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = reserved_count + v_requested, updated_at = now()
  WHERE user_id = v_user_id AND usage_date = v_today;

  INSERT INTO public.video_cut_jobs (
    user_id, instagram_account_id, youtube_url, source_kind, source_video_url,
    source_title, requested_clips, reserved_clips, rights_confirmed, status, progress, format,
    subtitle_style, auto_publish, remove_silences, zoom_effect, smart_crop
  ) VALUES (
    v_user_id, _instagram_account_id, trim(_video_url), 'upload', trim(_video_url),
    NULLIF(btrim(COALESCE(_source_title, '')), ''), v_requested, v_requested, true, 'queued', 0, v_format,
    v_subs, COALESCE(_auto_publish, false), COALESCE(_remove_silences, true),
    COALESCE(_zoom_effect, false), COALESCE(_smart_crop, true)
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$function$;
