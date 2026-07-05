ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS dedupe_url_key text,
  ADD COLUMN IF NOT EXISTS dedupe_title_key text;

UPDATE public.news_items
SET
  dedupe_url_key = COALESCE(NULLIF(dedupe_url_key, ''), NULLIF(COALESCE(original_canonical_url, original_url), '')),
  dedupe_title_key = COALESCE(
    NULLIF(dedupe_title_key, ''),
    NULLIF(regexp_replace(lower(COALESCE(original_title, rewritten_title, '')), '[^[:alnum:]]+', ' ', 'g'), '')
  )
WHERE dedupe_url_key IS NULL
   OR dedupe_url_key = ''
   OR dedupe_title_key IS NULL
   OR dedupe_title_key = '';

WITH active_items AS (
  SELECT
    id,
    user_id,
    COALESCE(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid) AS ig_key,
    dedupe_url_key,
    dedupe_title_key,
    created_at
  FROM public.news_items
  WHERE status IN ('pending', 'processing', 'processed', 'approved', 'scheduled')
), url_ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, ig_key, dedupe_url_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM active_items
  WHERE dedupe_url_key IS NOT NULL
    AND dedupe_url_key <> ''
), title_ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, ig_key, dedupe_title_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM active_items
  WHERE dedupe_title_key IS NOT NULL
    AND length(dedupe_title_key) >= 18
), duplicate_ids AS (
  SELECT id FROM url_ranked WHERE rn > 1
  UNION
  SELECT id FROM title_ranked WHERE rn > 1
)
UPDATE public.news_items ni
SET
  status = 'rejected',
  error_message = 'Rejeitada automaticamente: noticia duplicada para esta conta'
FROM duplicate_ids d
WHERE ni.id = d.id
  AND ni.status IN ('pending', 'processing', 'processed', 'approved', 'scheduled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_url_per_ig
ON public.news_items (
  user_id,
  COALESCE(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  dedupe_url_key
)
WHERE dedupe_url_key IS NOT NULL
  AND dedupe_url_key <> ''
  AND status IN ('pending', 'processing', 'processed', 'approved', 'scheduled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_title_per_ig
ON public.news_items (
  user_id,
  COALESCE(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  dedupe_title_key
)
WHERE dedupe_title_key IS NOT NULL
  AND length(dedupe_title_key) >= 18
  AND status IN ('pending', 'processing', 'processed', 'approved', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_news_items_dedupe_title_recent
ON public.news_items (user_id, instagram_account_id, dedupe_title_key, created_at DESC)
WHERE dedupe_title_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_dedupe_url_recent
ON public.news_items (user_id, instagram_account_id, dedupe_url_key, created_at DESC)
WHERE dedupe_url_key IS NOT NULL;