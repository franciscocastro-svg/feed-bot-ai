CREATE OR REPLACE FUNCTION public.enqueue_reel_render_job_for_post(_scheduled_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_post record;
  v_cover_url text;
  v_audio_url text;
BEGIN
  SELECT
    sp.id,
    sp.user_id,
    sp.news_item_id,
    sp.status,
    sp.media_type,
    ni.generated_video_url,
    ni.generated_cover_url AS cover_url,
    COALESCE(ni.chosen_audio_url, us.reel_audio_url) AS audio_url
  INTO v_post
  FROM public.scheduled_posts sp
  JOIN public.news_items ni ON ni.id = sp.news_item_id
  LEFT JOIN public.user_settings us ON us.user_id = sp.user_id
  WHERE sp.id = _scheduled_post_id;

  IF v_post.id IS NULL
     OR v_post.status <> 'scheduled'
     OR v_post.media_type <> 'reel'
     OR v_post.generated_video_url IS NOT NULL
     OR v_post.cover_url IS NULL THEN
    RETURN;
  END IF;

  v_cover_url := v_post.cover_url;
  v_audio_url := v_post.audio_url;

  IF EXISTS (
    SELECT 1
    FROM public.reel_render_jobs j
    WHERE j.scheduled_post_id = v_post.id
      AND j.status IN ('queued', 'processing', 'done')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.reel_render_jobs (
    user_id,
    news_item_id,
    scheduled_post_id,
    cover_url,
    audio_url,
    status,
    attempts,
    max_attempts
  ) VALUES (
    v_post.user_id,
    v_post.news_item_id,
    v_post.id,
    v_cover_url,
    v_audio_url,
    'queued',
    0,
    3
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_enqueue_reel_job_from_scheduled_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'scheduled'
     AND NEW.media_type = 'reel'
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.media_type IS DISTINCT FROM NEW.media_type
       OR OLD.news_item_id IS DISTINCT FROM NEW.news_item_id
     ) THEN
    PERFORM public.enqueue_reel_render_job_for_post(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_enqueue_reel_job_from_news_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  IF NEW.generated_video_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.generated_cover_url IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.generated_cover_url IS DISTINCT FROM NEW.generated_cover_url
       OR OLD.chosen_audio_url IS DISTINCT FROM NEW.chosen_audio_url
     ) THEN
    FOR v_post_id IN
      SELECT sp.id
      FROM public.scheduled_posts sp
      WHERE sp.news_item_id = NEW.id
        AND sp.status = 'scheduled'
        AND sp.media_type = 'reel'
    LOOP
      PERFORM public.enqueue_reel_render_job_for_post(v_post_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_reel_job_from_scheduled_post ON public.scheduled_posts;
CREATE TRIGGER enqueue_reel_job_from_scheduled_post
AFTER INSERT OR UPDATE OF status, media_type, news_item_id
ON public.scheduled_posts
FOR EACH ROW
EXECUTE FUNCTION public.tg_enqueue_reel_job_from_scheduled_post();

DROP TRIGGER IF EXISTS enqueue_reel_job_from_news_item ON public.news_items;
CREATE TRIGGER enqueue_reel_job_from_news_item
AFTER INSERT OR UPDATE OF generated_cover_url, chosen_audio_url, generated_video_url
ON public.news_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_enqueue_reel_job_from_news_item();

CREATE OR REPLACE FUNCTION public.claim_reel_jobs(_worker text, _limit integer DEFAULT 1)
RETURNS SETOF public.reel_render_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH recovered AS (
    UPDATE public.reel_render_jobs
       SET status = 'queued',
           claimed_at = NULL,
           claimed_by = NULL,
           error_message = COALESCE(error_message, 'Job recuperado após worker travar'),
           updated_at = now()
     WHERE status = 'processing'
       AND claimed_at < now() - interval '15 minutes'
       AND attempts < max_attempts
     RETURNING id
  ),
  next_jobs AS (
    SELECT id
    FROM public.reel_render_jobs
    WHERE status = 'queued'
      AND attempts < max_attempts
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.reel_render_jobs j
     SET status = 'processing',
         claimed_at = now(),
         claimed_by = _worker,
         started_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
  FROM next_jobs n
  WHERE j.id = n.id
  RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_reel_jobs(text, integer) TO service_role;
