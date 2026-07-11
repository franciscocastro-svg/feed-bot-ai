WITH base AS (
  SELECT ni.id, ni.user_id, ni.dedupe_url_key, ni.dedupe_title_key, ni.published_at
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
),
ranked_url AS (
  SELECT id, user_id, dedupe_url_key, dedupe_title_key, published_at,
    CASE WHEN dedupe_url_key IS NOT NULL AND dedupe_url_key <> ''
         THEN row_number() OVER (PARTITION BY user_id, dedupe_url_key ORDER BY published_at DESC, id)
         ELSE 1 END AS rn_url
  FROM base
),
after_url AS (
  SELECT * FROM ranked_url WHERE rn_url = 1
),
ranked_title AS (
  SELECT id, user_id, dedupe_title_key, published_at,
    CASE WHEN dedupe_title_key IS NOT NULL AND length(dedupe_title_key) >= 18
         THEN row_number() OVER (PARTITION BY user_id, dedupe_title_key ORDER BY published_at DESC, id)
         ELSE 1 END AS rn_title
  FROM after_url
),
candidates AS (
  SELECT id FROM ranked_title WHERE rn_title = 1
)
UPDATE public.news_items ni
SET status = 'pending',
    error_message = 'Recuperada após correção da janela do autopiloto',
    retry_count = 0,
    updated_at = now()
FROM candidates c
WHERE ni.id = c.id;

WITH base AS (
  SELECT DISTINCT ni.id, ni.user_id, ni.dedupe_url_key, ni.dedupe_title_key, ni.published_at
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
),
ranked_url AS (
  SELECT id, user_id, dedupe_url_key, dedupe_title_key, published_at,
    CASE WHEN dedupe_url_key IS NOT NULL AND dedupe_url_key <> ''
         THEN row_number() OVER (PARTITION BY user_id, dedupe_url_key ORDER BY published_at DESC, id)
         ELSE 1 END AS rn_url
  FROM base
),
after_url AS (
  SELECT * FROM ranked_url WHERE rn_url = 1
),
ranked_title AS (
  SELECT id, user_id, dedupe_title_key, published_at,
    CASE WHEN dedupe_title_key IS NOT NULL AND length(dedupe_title_key) >= 18
         THEN row_number() OVER (PARTITION BY user_id, dedupe_title_key ORDER BY published_at DESC, id)
         ELSE 1 END AS rn_title
  FROM after_url
),
orphaned AS (
  SELECT id FROM ranked_title WHERE rn_title = 1
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

UPDATE public.news_items
SET status = 'failed',
    error_message = 'Duplicada de outra notícia recuperada; mantida fora da fila',
    updated_at = now()
WHERE status = 'rejected'
  AND error_message = 'Notícia com mais de 12h';

UPDATE public.scheduled_posts
SET error_message = 'Cancelada pelo limite antigo de 12h; a notícia foi devolvida ao autopiloto quando ainda estava atualizada',
    updated_at = now()
WHERE status = 'cancelled'
  AND error_message IN ('Notícia expirou (>12h)', 'Notícia expirada antes da próxima tentativa. Cancelada para liberar a fila.')
  AND updated_at >= now() - interval '7 days';

NOTIFY pgrst, 'reload schema';