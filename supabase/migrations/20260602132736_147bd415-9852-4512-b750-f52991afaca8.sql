-- Recover Instagram Reel containers that were created but never reached FINISHED.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'post_status'
      AND e.enumlabel = 'awaiting_container'
  ) THEN
    EXECUTE 'ALTER TYPE public.post_status ADD VALUE ''awaiting_container''';
  END IF;
END $$;

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS ig_creation_id text,
  ADD COLUMN IF NOT EXISTS container_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS container_last_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_container_check
ON public.scheduled_posts (status, container_last_checked_at, updated_at);

WITH recovered AS (
  UPDATE public.scheduled_posts sp
  SET
    status = 'scheduled',
    media_type = 'feed',
    scheduled_for = now() + interval '1 minute',
    ig_creation_id = NULL,
    retry_count = 0,
    error_message = 'Reel ficou preso no processamento do Instagram por mais de 2h. Reenfileirado como Feed com a capa para liberar a fila.',
    container_last_checked_at = now(),
    updated_at = now()
  FROM public.news_items n
  WHERE sp.news_item_id = n.id
    AND sp.status::text = 'awaiting_container'
    AND COALESCE(sp.container_created_at, sp.updated_at, sp.created_at) < now() - interval '2 hours'
    AND sp.media_type = 'reel'
    AND (n.generated_cover_url IS NOT NULL OR n.generated_image_url IS NOT NULL)
  RETURNING sp.news_item_id
)
UPDATE public.news_items n
SET
  status = 'scheduled',
  error_message = NULL,
  updated_at = now()
FROM recovered r
WHERE n.id = r.news_item_id;

WITH failed AS (
  UPDATE public.scheduled_posts sp
  SET
    status = 'failed',
    retry_count = COALESCE(sp.retry_count, 0) + 1,
    error_message = 'Instagram não finalizou o container em até 2h e não há capa/foto para fallback.',
    container_last_checked_at = now(),
    updated_at = now()
  WHERE sp.status::text = 'awaiting_container'
    AND COALESCE(sp.container_created_at, sp.updated_at, sp.created_at) < now() - interval '2 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM public.news_items n
      WHERE n.id = sp.news_item_id
        AND (n.generated_cover_url IS NOT NULL OR n.generated_image_url IS NOT NULL)
    )
  RETURNING sp.news_item_id
)
UPDATE public.news_items n
SET
  status = 'failed',
  error_message = 'Container do Instagram não finalizou em até 2h e não há capa/foto para fallback.',
  updated_at = now()
FROM failed f
WHERE n.id = f.news_item_id;