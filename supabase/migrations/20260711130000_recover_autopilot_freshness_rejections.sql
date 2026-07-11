-- Recover valid items rejected by the former 12-hour autopilot cutoff.
-- Duplicate items remain rejected so cross-account dedupe stays enforced.

WITH candidates AS (
  SELECT ni.id
  FROM public.news_items ni
  WHERE ni.status = 'rejected'
    AND ni.error_message = 'Notícia com mais de 12h'
    AND ni.published_at >= now() - interval '48 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM public.news_items active
      WHERE active.user_id = ni.user_id
        AND active.id <> ni.id
        AND active.status IN ('pending','processing','processed','approved','scheduled')
        AND (
          (ni.dedupe_url_key IS NOT NULL AND ni.dedupe_url_key <> '' AND active.dedupe_url_key = ni.dedupe_url_key)
          OR
          (ni.dedupe_title_key IS NOT NULL AND length(ni.dedupe_title_key) >= 18 AND active.dedupe_title_key = ni.dedupe_title_key)
        )
    )
)
UPDATE public.news_items ni
SET status = 'pending',
    error_message = 'Recuperada após correção da janela do autopiloto',
    retry_count = 0,
    updated_at = now()
FROM candidates c
WHERE ni.id = c.id;

-- The old scheduler cancelled some posts without changing news_items.status,
-- leaving the item permanently orphaned as "scheduled".
WITH orphaned AS (
  SELECT DISTINCT ni.id
  FROM public.news_items ni
  JOIN public.scheduled_posts cancelled ON cancelled.news_item_id = ni.id
  WHERE ni.status = 'scheduled'
    AND ni.published_at >= now() - interval '48 hours'
    AND cancelled.status = 'cancelled'
    AND cancelled.error_message IN (
      'Notícia expirou (>12h)',
      'Notícia expirada antes da próxima tentativa. Cancelada para liberar a fila.'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_posts active_post
      WHERE active_post.news_item_id = ni.id
        AND active_post.status IN ('scheduled','posting','awaiting_container')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.news_items active
      WHERE active.user_id = ni.user_id
        AND active.id <> ni.id
        AND active.status IN ('pending','processing','processed','approved','scheduled')
        AND (
          (ni.dedupe_url_key IS NOT NULL AND ni.dedupe_url_key <> '' AND active.dedupe_url_key = ni.dedupe_url_key)
          OR
          (ni.dedupe_title_key IS NOT NULL AND length(ni.dedupe_title_key) >= 18 AND active.dedupe_title_key = ni.dedupe_title_key)
        )
    )
)
UPDATE public.news_items ni
SET status = 'pending',
    error_message = 'Recuperada de agendamento órfão criado pelo limite antigo',
    retry_count = 0,
    updated_at = now()
FROM orphaned o
WHERE ni.id = o.id;

UPDATE public.news_items
SET status = 'failed',
    error_message = 'Expirada pelo limite antigo; mantida fora da fila',
    updated_at = now()
WHERE status = 'rejected'
  AND error_message = 'Notícia com mais de 12h'
  AND published_at < now() - interval '48 hours';

UPDATE public.scheduled_posts
SET error_message = 'Cancelada pelo limite antigo de 12h; a notícia foi devolvida ao autopiloto quando ainda estava atualizada',
    updated_at = now()
WHERE status = 'cancelled'
  AND error_message IN ('Notícia expirou (>12h)', 'Notícia expirada antes da próxima tentativa. Cancelada para liberar a fila.')
  AND updated_at >= now() - interval '7 days';

NOTIFY pgrst, 'reload schema';
