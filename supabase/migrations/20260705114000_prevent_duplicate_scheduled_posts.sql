-- Evita que a mesma noticia seja enfileirada mais de uma vez para a mesma conta.
-- Duplicidades antigas publicadas continuam no historico; a protecao vale daqui em diante.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, instagram_account_id, news_item_id
      ORDER BY scheduled_for ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.scheduled_posts
  WHERE status IN ('scheduled', 'posting', 'awaiting_container')
    AND instagram_account_id IS NOT NULL
)
UPDATE public.scheduled_posts sp
SET
  status = 'cancelled',
  error_message = 'Cancelado automaticamente: duplicado ativo da mesma noticia para a mesma conta'
FROM ranked r
WHERE sp.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_posts_unique_active_news_per_ig
ON public.scheduled_posts (user_id, instagram_account_id, news_item_id)
WHERE status IN ('scheduled', 'posting', 'awaiting_container')
  AND instagram_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_recent_posted_by_ig
ON public.scheduled_posts (user_id, instagram_account_id, posted_at DESC)
WHERE status = 'posted'
  AND instagram_account_id IS NOT NULL
  AND posted_at IS NOT NULL;
