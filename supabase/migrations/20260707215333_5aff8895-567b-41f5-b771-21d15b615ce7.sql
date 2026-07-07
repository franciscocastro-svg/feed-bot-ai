
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.normalize_dedupe_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(public.unaccent(_value), '')),
          'https?://\S+', ' ', 'g'
        ),
        '[^[:alnum:]]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_dedupe_url(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(btrim(coalesce(_value, '')), '')
$$;

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS dedupe_url_key text,
  ADD COLUMN IF NOT EXISTS dedupe_title_key text;

UPDATE public.news_items
SET
  original_canonical_url = coalesce(nullif(original_canonical_url, ''), original_url),
  dedupe_url_key = public.normalize_dedupe_url(coalesce(nullif(original_canonical_url, ''), original_url)),
  dedupe_title_key = public.normalize_dedupe_text(coalesce(original_title, rewritten_title))
WHERE dedupe_url_key IS NULL
   OR dedupe_title_key IS NULL
   OR original_canonical_url IS NULL
   OR original_canonical_url = '';

WITH active_items AS (
  SELECT id, user_id, dedupe_url_key, dedupe_title_key, created_at
  FROM public.news_items
  WHERE status IN ('pending','processing','processed','approved','scheduled')
), url_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, dedupe_url_key ORDER BY created_at ASC, id ASC) AS rn
  FROM active_items WHERE dedupe_url_key IS NOT NULL AND dedupe_url_key <> ''
), title_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, dedupe_title_key ORDER BY created_at ASC, id ASC) AS rn
  FROM active_items WHERE dedupe_title_key IS NOT NULL AND length(dedupe_title_key) >= 18
), duplicate_ids AS (
  SELECT id FROM url_ranked WHERE rn > 1
  UNION
  SELECT id FROM title_ranked WHERE rn > 1
)
UPDATE public.scheduled_posts sp
SET status = 'cancelled',
    error_message = 'Cancelado automaticamente: noticia duplicada em outra conta do mesmo cliente'
FROM duplicate_ids d
WHERE sp.news_item_id = d.id
  AND sp.status IN ('scheduled','posting','awaiting_container');

WITH active_items AS (
  SELECT id, user_id, dedupe_url_key, dedupe_title_key, created_at
  FROM public.news_items
  WHERE status IN ('pending','processing','processed','approved','scheduled')
), url_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, dedupe_url_key ORDER BY created_at ASC, id ASC) AS rn
  FROM active_items WHERE dedupe_url_key IS NOT NULL AND dedupe_url_key <> ''
), title_ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, dedupe_title_key ORDER BY created_at ASC, id ASC) AS rn
  FROM active_items WHERE dedupe_title_key IS NOT NULL AND length(dedupe_title_key) >= 18
), duplicate_ids AS (
  SELECT id FROM url_ranked WHERE rn > 1
  UNION
  SELECT id FROM title_ranked WHERE rn > 1
)
UPDATE public.news_items ni
SET status = 'rejected',
    error_message = 'Rejeitada automaticamente: noticia duplicada em outra conta do mesmo cliente'
FROM duplicate_ids d
WHERE ni.id = d.id
  AND ni.status IN ('pending','processing','processed','approved','scheduled');

CREATE OR REPLACE FUNCTION public.tg_news_item_dedupe_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_duplicate_id uuid;
  v_since timestamptz := now() - interval '72 hours';
BEGIN
  IF NEW.original_canonical_url IS NULL OR btrim(NEW.original_canonical_url) = '' THEN
    NEW.original_canonical_url := NEW.original_url;
  END IF;

  NEW.dedupe_url_key := public.normalize_dedupe_url(coalesce(NEW.original_canonical_url, NEW.original_url));
  NEW.dedupe_title_key := public.normalize_dedupe_text(coalesce(NEW.original_title, NEW.rewritten_title));

  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('rejected','failed') THEN
    IF NEW.dedupe_url_key IS NOT NULL THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND dedupe_url_key = NEW.dedupe_url_key
        AND status NOT IN ('rejected','failed')
        AND created_at >= v_since
      ORDER BY created_at ASC, id ASC LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_url:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Esta noticia ja existe para este cliente.';
      END IF;
    END IF;

    IF NEW.dedupe_title_key IS NOT NULL AND length(NEW.dedupe_title_key) >= 18 THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND dedupe_title_key = NEW.dedupe_title_key
        AND status NOT IN ('rejected','failed')
        AND created_at >= v_since
      ORDER BY created_at ASC, id ASC LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_title:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Uma noticia com o mesmo titulo ja existe para este cliente nas ultimas 72h.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_item_dedupe_guard ON public.news_items;
CREATE TRIGGER trg_news_item_dedupe_guard
BEFORE INSERT OR UPDATE OF original_url, original_canonical_url, original_title, rewritten_title, status
ON public.news_items
FOR EACH ROW EXECUTE FUNCTION public.tg_news_item_dedupe_guard();

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_url_per_user
ON public.news_items (user_id, dedupe_url_key)
WHERE dedupe_url_key IS NOT NULL
  AND dedupe_url_key <> ''
  AND status IN ('pending','processing','processed','approved','scheduled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_title_per_user
ON public.news_items (user_id, dedupe_title_key)
WHERE dedupe_title_key IS NOT NULL
  AND length(dedupe_title_key) >= 18
  AND status IN ('pending','processing','processed','approved','scheduled');

CREATE INDEX IF NOT EXISTS idx_news_items_user_dedupe_recent
ON public.news_items (user_id, created_at DESC, dedupe_url_key, dedupe_title_key)
WHERE status NOT IN ('rejected','failed');

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_active_user_updated
ON public.scheduled_posts (user_id, updated_at DESC)
WHERE status IN ('scheduled','posting','awaiting_container');

NOTIFY pgrst, 'reload schema';
