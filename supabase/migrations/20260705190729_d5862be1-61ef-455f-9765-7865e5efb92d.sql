-- Reforca a protecao contra noticias duplicadas por conta.
CREATE INDEX IF NOT EXISTS idx_news_items_user_ig_created_at
ON public.news_items (user_id, instagram_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_active_user_ig_updated
ON public.scheduled_posts (user_id, instagram_account_id, updated_at DESC)
WHERE status IN ('scheduled', 'posting', 'awaiting_container')
  AND instagram_account_id IS NOT NULL;

WITH active AS (
  SELECT
    sp.id,
    sp.user_id,
    sp.instagram_account_id,
    sp.scheduled_for,
    sp.created_at,
    NULLIF(COALESCE(ni.original_canonical_url, ni.original_url), '') AS url_key,
    NULLIF(regexp_replace(lower(COALESCE(ni.rewritten_title, ni.original_title, '')), '[^[:alnum:]]+', ' ', 'g'), '') AS title_key
  FROM public.scheduled_posts sp
  JOIN public.news_items ni ON ni.id = sp.news_item_id
  WHERE sp.status IN ('scheduled', 'posting', 'awaiting_container')
    AND sp.instagram_account_id IS NOT NULL
), url_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, instagram_account_id, url_key ORDER BY scheduled_for ASC, created_at ASC, id ASC) AS rn
  FROM active WHERE url_key IS NOT NULL
), title_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, instagram_account_id, title_key ORDER BY scheduled_for ASC, created_at ASC, id ASC) AS rn
  FROM active WHERE title_key IS NOT NULL AND length(title_key) >= 18
), duplicate_ids AS (
  SELECT id FROM url_ranked WHERE rn > 1
  UNION
  SELECT id FROM title_ranked WHERE rn > 1
)
UPDATE public.scheduled_posts sp
SET status = 'cancelled',
    error_message = 'Cancelado automaticamente: duplicado ativo da mesma noticia para esta conta'
FROM duplicate_ids d
WHERE sp.id = d.id
  AND sp.status IN ('scheduled', 'posting', 'awaiting_container');