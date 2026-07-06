-- Centraliza a protecao contra duplicidade de noticias e fontes.
-- A mesma noticia pode existir para Instagrams diferentes, mas nao duas vezes na mesma conta.

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS dedupe_url_key text,
  ADD COLUMN IF NOT EXISTS dedupe_title_key text;

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS source_fingerprint text;

CREATE OR REPLACE FUNCTION public.normalize_dedupe_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(regexp_replace(
      translate(
        lower(coalesce(_value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_dedupe_url(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(coalesce(_value, ''))), '#.*$', ''),
          '([?&])(utm_[^=&]+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|ref|ref_src|cmpid|feature|si)=[^&]*',
          '\1',
          'g'
        ),
        '([?&]){2,}',
        '\1',
        'g'
      ),
      '([?&]|/)+$',
      '',
      'g'
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.compute_source_fingerprint(
  _source_kind public.source_kind,
  _url text,
  _query text,
  _country text,
  _language text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    concat_ws(
      ':',
      coalesce(_source_kind::text, 'rss'),
      CASE
        WHEN coalesce(_source_kind::text, 'rss') IN ('person', 'topic', 'google_news') THEN
          concat_ws(
            ':',
            public.normalize_dedupe_text(coalesce(_query, _url)),
            upper(coalesce(nullif(_country, ''), 'BR')),
            lower(coalesce(nullif(_language, ''), 'pt-br'))
          )
        ELSE public.normalize_dedupe_url(_url)
      END
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.tg_news_item_dedupe_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_empty_ig constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_duplicate_id uuid;
BEGIN
  IF NEW.original_canonical_url IS NULL OR btrim(NEW.original_canonical_url) = '' THEN
    NEW.original_canonical_url := NEW.original_url;
  END IF;

  NEW.dedupe_url_key := public.normalize_dedupe_url(coalesce(NEW.original_canonical_url, NEW.original_url));
  NEW.dedupe_title_key := public.normalize_dedupe_text(coalesce(NEW.original_title, NEW.rewritten_title));

  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('rejected', 'failed') THEN
    IF NEW.dedupe_url_key IS NOT NULL THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND coalesce(instagram_account_id, v_empty_ig) = coalesce(NEW.instagram_account_id, v_empty_ig)
        AND dedupe_url_key = NEW.dedupe_url_key
        AND status NOT IN ('rejected', 'failed')
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_url:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Esta noticia ja existe para esta conta do Instagram.';
      END IF;
    END IF;

    IF NEW.dedupe_title_key IS NOT NULL AND length(NEW.dedupe_title_key) >= 18 THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND coalesce(instagram_account_id, v_empty_ig) = coalesce(NEW.instagram_account_id, v_empty_ig)
        AND dedupe_title_key = NEW.dedupe_title_key
        AND status NOT IN ('rejected', 'failed')
        AND created_at >= now() - interval '72 hours'
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_title:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Uma noticia com o mesmo titulo ja existe para esta conta do Instagram nas ultimas 72h.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_item_dedupe_guard ON public.news_items;
CREATE TRIGGER news_item_dedupe_guard
BEFORE INSERT OR UPDATE OF original_url, original_canonical_url, original_title, rewritten_title, instagram_account_id, status
ON public.news_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_news_item_dedupe_guard();

CREATE OR REPLACE FUNCTION public.tg_news_source_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.source_fingerprint := public.compute_source_fingerprint(
    NEW.source_kind,
    NEW.url,
    NEW.query,
    NEW.country,
    NEW.language
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_source_fingerprint ON public.news_sources;
CREATE TRIGGER news_source_fingerprint
BEFORE INSERT OR UPDATE OF source_kind, url, query, country, language
ON public.news_sources
FOR EACH ROW
EXECUTE FUNCTION public.tg_news_source_fingerprint();

-- Indices antigos podem impedir o recalculo quando ja existem duplicadas reais.
DROP INDEX IF EXISTS public.idx_news_items_unique_active_url_per_ig;
DROP INDEX IF EXISTS public.idx_news_items_unique_active_title_per_ig;

UPDATE public.news_items
SET
  original_canonical_url = coalesce(nullif(original_canonical_url, ''), original_url),
  dedupe_url_key = public.normalize_dedupe_url(coalesce(nullif(original_canonical_url, ''), original_url)),
  dedupe_title_key = public.normalize_dedupe_text(coalesce(original_title, rewritten_title))
WHERE true;

UPDATE public.news_sources
SET source_fingerprint = public.compute_source_fingerprint(source_kind, url, query, country, language)
WHERE source_fingerprint IS NULL OR source_fingerprint = '';

WITH active_items AS (
  SELECT
    id,
    user_id,
    coalesce(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid) AS ig_key,
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

WITH ranked_sources AS (
  SELECT
    ns.id,
    ns.user_id,
    first_value(ns.id) OVER (
      PARTITION BY ns.user_id, ns.source_fingerprint
      ORDER BY ns.active DESC, ns.quality_score DESC, ns.last_success_at DESC NULLS LAST, ns.created_at ASC, ns.id ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY ns.user_id, ns.source_fingerprint
      ORDER BY ns.active DESC, ns.quality_score DESC, ns.last_success_at DESC NULLS LAST, ns.created_at ASC, ns.id ASC
    ) AS rn
  FROM public.news_sources ns
  WHERE ns.source_fingerprint IS NOT NULL
    AND ns.source_fingerprint <> ''
), duplicate_sources AS (
  SELECT id, keep_id, user_id
  FROM ranked_sources
  WHERE rn > 1
    AND id <> keep_id
)
INSERT INTO public.news_source_instagram_accounts (source_id, instagram_account_id, user_id)
SELECT ds.keep_id, link.instagram_account_id, link.user_id
FROM duplicate_sources ds
JOIN public.news_source_instagram_accounts link ON link.source_id = ds.id
ON CONFLICT (source_id, instagram_account_id) DO NOTHING;

WITH ranked_sources AS (
  SELECT
    ns.id,
    ns.source_fingerprint,
    row_number() OVER (
      PARTITION BY ns.user_id, ns.source_fingerprint
      ORDER BY ns.active DESC, ns.quality_score DESC, ns.last_success_at DESC NULLS LAST, ns.created_at ASC, ns.id ASC
    ) AS rn
  FROM public.news_sources ns
  WHERE ns.source_fingerprint IS NOT NULL
    AND ns.source_fingerprint <> ''
), duplicate_sources AS (
  SELECT id
  FROM ranked_sources
  WHERE rn > 1
)
UPDATE public.news_sources ns
SET
  active = false,
  last_error = 'Pausada automaticamente: fonte duplicada. Os Instagrams vinculados foram movidos para a fonte principal.',
  last_error_at = now()
FROM duplicate_sources ds
WHERE ns.id = ds.id
  AND ns.active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_sources_unique_active_fingerprint
ON public.news_sources (user_id, source_fingerprint)
WHERE active = true
  AND source_fingerprint IS NOT NULL
  AND source_fingerprint <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_url_per_ig
ON public.news_items (
  user_id,
  coalesce(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  dedupe_url_key
)
WHERE dedupe_url_key IS NOT NULL
  AND dedupe_url_key <> ''
  AND status IN ('pending', 'processing', 'processed', 'approved', 'scheduled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_unique_active_title_per_ig
ON public.news_items (
  user_id,
  coalesce(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  dedupe_title_key
)
WHERE dedupe_title_key IS NOT NULL
  AND length(dedupe_title_key) >= 18
  AND status IN ('pending', 'processing', 'processed', 'approved', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_news_sources_fingerprint
ON public.news_sources (user_id, source_fingerprint);

CREATE INDEX IF NOT EXISTS idx_news_items_dedupe_guard_lookup
ON public.news_items (
  user_id,
  coalesce(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  dedupe_url_key,
  created_at DESC
)
WHERE status NOT IN ('rejected', 'failed');

NOTIFY pgrst, 'reload schema';
