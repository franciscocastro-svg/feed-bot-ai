
-- Multi-formato e hook chamativo em jobs
ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS formats text[],
  ADD COLUMN IF NOT EXISTS hook_enabled boolean NOT NULL DEFAULT true;

-- Hook + scores de viralidade + erro legenda em clips
ALTER TABLE public.video_cut_clips
  ADD COLUMN IF NOT EXISTS hook_text text,
  ADD COLUMN IF NOT EXISTS hook_score integer,
  ADD COLUMN IF NOT EXISTS emotion_score integer,
  ADD COLUMN IF NOT EXISTS clarity_score integer,
  ADD COLUMN IF NOT EXISTS viral_score integer,
  ADD COLUMN IF NOT EXISTS subtitle_error boolean NOT NULL DEFAULT false;

-- Índice pra ordenar clips por potencial viral
CREATE INDEX IF NOT EXISTS idx_video_cut_clips_viral ON public.video_cut_clips(job_id, viral_score DESC NULLS LAST);

-- RPC youtube: aceita _formats text[] e _hook_enabled. Multiplica quota por qtd de formatos.
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
  _smart_crop boolean DEFAULT true,
  _formats text[] DEFAULT NULL,
  _hook_enabled boolean DEFAULT true
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account record;
  v_limits public.plan_limits;
  v_usage record;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_requested integer;
  v_formats text[];
  v_first_format text;
  v_reserved integer;
  v_subs text := COALESCE(_subtitle_style, 'classic');
  v_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT _rights_confirmed THEN RAISE EXCEPTION 'Confirme que você tem autorização para usar este vídeo.'; END IF;
  IF _youtube_url IS NULL OR _youtube_url !~* '^https?://(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)/' THEN
    RAISE EXCEPTION 'Informe um link público válido do YouTube.';
  END IF;
  IF v_subs NOT IN ('none','classic','neon','karaoke') THEN
    RAISE EXCEPTION 'Estilo de legenda inválido.';
  END IF;

  -- Normaliza lista de formatos (dedup, valida, cap em 3)
  IF _formats IS NULL OR array_length(_formats, 1) IS NULL THEN
    v_formats := ARRAY[COALESCE(_format, 'reels')];
  ELSE
    SELECT array_agg(DISTINCT f) INTO v_formats
      FROM unnest(_formats) f
      WHERE f IN ('feed_square','feed_portrait','reels');
  END IF;
  IF v_formats IS NULL OR array_length(v_formats, 1) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um formato válido.';
  END IF;
  IF array_length(v_formats, 1) > 3 THEN
    RAISE EXCEPTION 'Máximo de 3 formatos por job.';
  END IF;
  v_first_format := v_formats[1];

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
  v_reserved := v_requested * array_length(v_formats, 1);

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count, reserved_count INTO v_usage
  FROM public.video_cut_usage_daily
  WHERE user_id = v_user_id AND usage_date = v_today FOR UPDATE;

  IF v_limits.max_cuts_per_day >= 0
     AND (v_usage.used_count + v_usage.reserved_count + v_reserved) > v_limits.max_cuts_per_day THEN
    RAISE EXCEPTION 'Limite diário de Cortes IA atingido. Usados/reservados: %, limite: %.',
      (v_usage.used_count + v_usage.reserved_count), v_limits.max_cuts_per_day;
  END IF;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = reserved_count + v_reserved, updated_at = now()
  WHERE user_id = v_user_id AND usage_date = v_today;

  INSERT INTO public.video_cut_jobs (
    user_id, instagram_account_id, youtube_url,
    requested_clips, reserved_clips, rights_confirmed, status, progress, format,
    subtitle_style, auto_publish, remove_silences, zoom_effect, smart_crop,
    formats, hook_enabled
  ) VALUES (
    v_user_id, _instagram_account_id, trim(_youtube_url),
    v_requested, v_reserved, true, 'queued', 0, v_first_format,
    v_subs, COALESCE(_auto_publish, false), COALESCE(_remove_silences, true),
    COALESCE(_zoom_effect, false), COALESCE(_smart_crop, true),
    v_formats, COALESCE(_hook_enabled, true)
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- RPC upload: mesmas adições
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
  _smart_crop boolean DEFAULT true,
  _formats text[] DEFAULT NULL,
  _hook_enabled boolean DEFAULT true
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account record;
  v_limits public.plan_limits;
  v_usage record;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_requested integer;
  v_formats text[];
  v_first_format text;
  v_reserved integer;
  v_subs text := COALESCE(_subtitle_style, 'classic');
  v_job public.video_cut_jobs;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT _rights_confirmed THEN RAISE EXCEPTION 'Confirme que você tem autorização para usar este vídeo.'; END IF;
  IF _video_url IS NULL OR btrim(_video_url) = '' THEN RAISE EXCEPTION 'Vídeo enviado não recebeu URL válida.'; END IF;
  IF v_subs NOT IN ('none','classic','neon','karaoke') THEN
    RAISE EXCEPTION 'Estilo de legenda inválido.';
  END IF;

  IF _formats IS NULL OR array_length(_formats, 1) IS NULL THEN
    v_formats := ARRAY[COALESCE(_format, 'reels')];
  ELSE
    SELECT array_agg(DISTINCT f) INTO v_formats
      FROM unnest(_formats) f
      WHERE f IN ('feed_square','feed_portrait','reels');
  END IF;
  IF v_formats IS NULL OR array_length(v_formats, 1) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos um formato válido.';
  END IF;
  IF array_length(v_formats, 1) > 3 THEN
    RAISE EXCEPTION 'Máximo de 3 formatos por job.';
  END IF;
  v_first_format := v_formats[1];

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
  v_reserved := v_requested * array_length(v_formats, 1);

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT used_count, reserved_count INTO v_usage
  FROM public.video_cut_usage_daily
  WHERE user_id = v_user_id AND usage_date = v_today FOR UPDATE;

  IF v_limits.max_cuts_per_day >= 0
     AND (v_usage.used_count + v_usage.reserved_count + v_reserved) > v_limits.max_cuts_per_day THEN
    RAISE EXCEPTION 'Limite diário de Cortes IA atingido. Usados/reservados: %, limite: %.',
      (v_usage.used_count + v_usage.reserved_count), v_limits.max_cuts_per_day;
  END IF;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = reserved_count + v_reserved, updated_at = now()
  WHERE user_id = v_user_id AND usage_date = v_today;

  INSERT INTO public.video_cut_jobs (
    user_id, instagram_account_id, youtube_url, source_kind, source_video_url,
    source_title, requested_clips, reserved_clips, rights_confirmed, status, progress, format,
    subtitle_style, auto_publish, remove_silences, zoom_effect, smart_crop,
    formats, hook_enabled
  ) VALUES (
    v_user_id, _instagram_account_id, trim(_video_url), 'upload', trim(_video_url),
    NULLIF(btrim(COALESCE(_source_title, '')), ''), v_requested, v_reserved, true, 'queued', 0, v_first_format,
    v_subs, COALESCE(_auto_publish, false), COALESCE(_remove_silences, true),
    COALESCE(_zoom_effect, false), COALESCE(_smart_crop, true),
    v_formats, COALESCE(_hook_enabled, true)
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;
