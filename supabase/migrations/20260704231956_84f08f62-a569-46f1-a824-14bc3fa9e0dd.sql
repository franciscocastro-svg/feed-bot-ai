-- AI video cuts beta: jobs, clips, daily usage and plan limits.

ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS max_cuts_per_day integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_cut_video_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS max_cuts_per_job integer NOT NULL DEFAULT 5;

UPDATE public.plan_limits
SET
  max_cuts_per_day = CASE
    WHEN plan = 'starter' THEN 1
    WHEN plan = 'pro' THEN 5
    WHEN plan = 'business' THEN 20
    ELSE max_cuts_per_day
  END,
  max_cut_video_minutes = CASE WHEN max_cut_video_minutes <= 0 THEN 60 ELSE max_cut_video_minutes END,
  max_cuts_per_job = CASE WHEN max_cuts_per_job <= 0 THEN 5 ELSE max_cuts_per_job END
WHERE plan IN ('starter', 'pro', 'business');

CREATE TABLE IF NOT EXISTS public.video_cut_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  youtube_url text NOT NULL,
  source_title text,
  source_kind text NOT NULL DEFAULT 'youtube',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'analyzing', 'processing', 'ready', 'failed', 'cancelled')),
  requested_clips integer NOT NULL DEFAULT 1 CHECK (requested_clips BETWEEN 1 AND 5),
  reserved_clips integer NOT NULL DEFAULT 0 CHECK (reserved_clips >= 0),
  generated_clips integer NOT NULL DEFAULT 0 CHECK (generated_clips >= 0),
  duration_seconds integer,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  rights_confirmed boolean NOT NULL DEFAULT false,
  fallback_required boolean NOT NULL DEFAULT false,
  error_message text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  claimed_at timestamptz,
  claimed_by text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_cut_jobs TO authenticated;
GRANT ALL ON public.video_cut_jobs TO service_role;

CREATE TABLE IF NOT EXISTS public.video_cut_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.video_cut_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  clip_index integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('rendering', 'draft', 'approved', 'scheduled', 'discarded', 'failed')),
  title text,
  hook text,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  reason text,
  score numeric NOT NULL DEFAULT 0,
  start_seconds integer NOT NULL DEFAULT 0,
  end_seconds integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  video_url text,
  thumbnail_url text,
  news_item_id uuid REFERENCES public.news_items(id) ON DELETE SET NULL,
  scheduled_post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, clip_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_cut_clips TO authenticated;
GRANT ALL ON public.video_cut_clips TO service_role;

CREATE TABLE IF NOT EXISTS public.video_cut_usage_daily (
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT (timezone('America/Sao_Paulo', now()))::date,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

GRANT SELECT ON public.video_cut_usage_daily TO authenticated;
GRANT ALL ON public.video_cut_usage_daily TO service_role;

ALTER TABLE public.video_cut_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_cut_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_cut_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users view own video cut jobs" ON public.video_cut_jobs;
CREATE POLICY "users view own video cut jobs"
  ON public.video_cut_jobs FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "users insert own video cut jobs" ON public.video_cut_jobs;
CREATE POLICY "users insert own video cut jobs"
  ON public.video_cut_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "users update own video cut jobs" ON public.video_cut_jobs;
CREATE POLICY "users update own video cut jobs"
  ON public.video_cut_jobs FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "users view own video cut clips" ON public.video_cut_clips;
CREATE POLICY "users view own video cut clips"
  ON public.video_cut_clips FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "users update own video cut clips" ON public.video_cut_clips;
CREATE POLICY "users update own video cut clips"
  ON public.video_cut_clips FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "users view own video cut usage" ON public.video_cut_usage_daily;
CREATE POLICY "users view own video cut usage"
  ON public.video_cut_usage_daily FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "admins manage video cut usage" ON public.video_cut_usage_daily;
CREATE POLICY "admins manage video cut usage"
  ON public.video_cut_usage_daily FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_video_cut_jobs_updated_at ON public.video_cut_jobs;
CREATE TRIGGER trg_video_cut_jobs_updated_at
  BEFORE UPDATE ON public.video_cut_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_video_cut_clips_updated_at ON public.video_cut_clips;
CREATE TRIGGER trg_video_cut_clips_updated_at
  BEFORE UPDATE ON public.video_cut_clips
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_video_cut_usage_daily_updated_at ON public.video_cut_usage_daily;
CREATE TRIGGER trg_video_cut_usage_daily_updated_at
  BEFORE UPDATE ON public.video_cut_usage_daily
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_video_cut_jobs_user_created ON public.video_cut_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_cut_jobs_status_created ON public.video_cut_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_video_cut_clips_job ON public.video_cut_clips(job_id, clip_index);
CREATE INDEX IF NOT EXISTS idx_video_cut_clips_user_created ON public.video_cut_clips(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_video_cut_usage(_user_id uuid)
RETURNS TABLE (
  plan text,
  display_name text,
  used_today integer,
  reserved_today integer,
  max_cuts_per_day integer,
  max_cut_video_minutes integer,
  max_cuts_per_job integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    pl.plan,
    pl.display_name,
    COALESCE(vcu.used_count, 0)::int,
    COALESCE(vcu.reserved_count, 0)::int,
    pl.max_cuts_per_day,
    pl.max_cut_video_minutes,
    GREATEST(0, LEAST(pl.max_cuts_per_job, 5))::int
  FROM public.get_user_plan_limits(_user_id) pl
  LEFT JOIN public.video_cut_usage_daily vcu
    ON vcu.user_id = _user_id
   AND vcu.usage_date = v_today;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_video_cut_job(
  _instagram_account_id uuid,
  _youtube_url text,
  _requested_clips integer,
  _rights_confirmed boolean
)
RETURNS public.video_cut_jobs
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
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

  IF _youtube_url IS NULL OR _youtube_url !~* '^https?://(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be)/' THEN
    RAISE EXCEPTION 'Informe um link público válido do YouTube.';
  END IF;

  SELECT id, user_id, active
    INTO v_account
  FROM public.instagram_accounts
  WHERE id = _instagram_account_id;

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

  SELECT used_count, reserved_count
    INTO v_usage
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
    requested_clips,
    reserved_clips,
    rights_confirmed,
    status,
    progress
  ) VALUES (
    v_user_id,
    _instagram_account_id,
    trim(_youtube_url),
    v_requested,
    v_requested,
    true,
    'queued',
    0
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_video_cut_jobs(_worker text, _limit integer DEFAULT 1)
RETURNS SETOF public.video_cut_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recovered AS (
    UPDATE public.video_cut_jobs
       SET status = 'queued',
           claimed_at = NULL,
           claimed_by = NULL,
           error_message = COALESCE(error_message, 'Job recuperado após worker travar'),
           updated_at = now()
     WHERE status IN ('analyzing', 'processing')
       AND claimed_at < now() - interval '30 minutes'
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
    LIMIT _limit
  )
  UPDATE public.video_cut_jobs j
     SET status = 'analyzing',
         progress = GREATEST(j.progress, 5),
         claimed_at = now(),
         claimed_by = _worker,
         started_at = COALESCE(j.started_at, now()),
         attempts = j.attempts + 1,
         updated_at = now()
  FROM next_jobs n
  WHERE j.id = n.id
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_video_cut_job_usage(_job_id uuid, _generated_count integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
  v_date date;
  v_generated integer := GREATEST(0, COALESCE(_generated_count, 0));
BEGIN
  SELECT * INTO v_job
  FROM public.video_cut_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF v_job.id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.reserved_clips <= 0 THEN
    RETURN;
  END IF;

  v_date := (timezone('America/Sao_Paulo', v_job.created_at))::date;

  INSERT INTO public.video_cut_usage_daily (user_id, usage_date)
  VALUES (v_job.user_id, v_date)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  UPDATE public.video_cut_usage_daily
  SET reserved_count = GREATEST(0, reserved_count - v_job.reserved_clips),
      used_count = used_count + LEAST(v_generated, v_job.reserved_clips),
      updated_at = now()
  WHERE user_id = v_job.user_id AND usage_date = v_date;

  UPDATE public.video_cut_jobs
  SET reserved_clips = 0,
      generated_clips = LEAST(v_generated, v_job.requested_clips),
      updated_at = now()
  WHERE id = v_job.id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_current_usage(uuid);
CREATE OR REPLACE FUNCTION public.get_current_usage(_user_id uuid)
RETURNS TABLE (
  plan text,
  display_name text,
  reels_used integer,
  reels_limit integer,
  images_used integer,
  images_limit integer,
  ig_accounts_used integer,
  ig_accounts_limit integer,
  rss_sources_used integer,
  rss_sources_limit integer,
  posts_today integer,
  posts_per_day_limit integer,
  cuts_used_today integer,
  cuts_reserved_today integer,
  cuts_limit integer,
  max_cut_video_minutes integer,
  max_cuts_per_job integer,
  auto_publish_enabled boolean,
  translation_enabled boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH pl AS (
    SELECT * FROM public.get_user_plan_limits(_user_id)
  ), uc AS (
    SELECT reels_generated, images_generated
    FROM public.usage_counters
    WHERE user_id = _user_id
      AND period_month = date_trunc('month', now())::date
  ), vcu AS (
    SELECT used_count, reserved_count
    FROM public.video_cut_usage_daily
    WHERE user_id = _user_id
      AND usage_date = (timezone('America/Sao_Paulo', now()))::date
  )
  SELECT
    pl.plan,
    pl.display_name,
    COALESCE((SELECT reels_generated FROM uc), 0)::int,
    pl.max_reels_per_month,
    COALESCE((SELECT images_generated FROM uc), 0)::int,
    pl.max_images_per_month,
    (SELECT COUNT(*)::int FROM public.instagram_accounts WHERE user_id = _user_id AND active),
    pl.max_ig_accounts,
    (SELECT COUNT(*)::int FROM public.news_sources WHERE user_id = _user_id AND active),
    pl.max_rss_sources,
    (
      SELECT COUNT(*)::int
      FROM public.scheduled_posts
      WHERE user_id = _user_id
        AND posted_at >= date_trunc('day', now())
    ),
    pl.max_posts_per_day,
    COALESCE((SELECT used_count FROM vcu), 0)::int,
    COALESCE((SELECT reserved_count FROM vcu), 0)::int,
    pl.max_cuts_per_day,
    pl.max_cut_video_minutes,
    GREATEST(0, LEAST(pl.max_cuts_per_job, 5))::int,
    pl.auto_publish_enabled,
    COALESCE(pl.translation_enabled, false)
  FROM pl;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_video_cut_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_video_cut_job(uuid, text, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_video_cut_jobs(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_video_cut_job_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_usage(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_video_cut_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_video_cut_job(uuid, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_cut_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_video_cut_job_usage(uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';