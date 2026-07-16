CREATE OR REPLACE FUNCTION public.tg_news_item_dedupe_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_duplicate_id uuid;
  v_since timestamptz := now() - interval '7 days';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(NEW.user_id::text),
      pg_catalog.hashtext('news_item_dedupe')
    );
  END IF;

  IF NEW.original_canonical_url IS NULL OR btrim(NEW.original_canonical_url) = '' THEN
    NEW.original_canonical_url := NEW.original_url;
  END IF;

  NEW.dedupe_url_key := public.normalize_dedupe_url(coalesce(NEW.original_canonical_url, NEW.original_url));
  NEW.dedupe_title_key := public.normalize_dedupe_text(coalesce(NEW.original_title, NEW.rewritten_title));

  IF TG_OP = 'INSERT' THEN
    IF NEW.dedupe_url_key IS NOT NULL THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND dedupe_url_key = NEW.dedupe_url_key
        AND created_at >= v_since
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_url:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Esta noticia ja foi capturada para este cliente nos ultimos sete dias.';
      END IF;
    END IF;

    IF NEW.dedupe_title_key IS NOT NULL AND length(NEW.dedupe_title_key) >= 18 THEN
      SELECT id INTO v_duplicate_id
      FROM public.news_items
      WHERE user_id = NEW.user_id
        AND dedupe_title_key = NEW.dedupe_title_key
        AND created_at >= v_since
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_duplicate_id IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_news_item_title:%', v_duplicate_id
          USING ERRCODE = '23505',
                DETAIL = 'Uma noticia com o mesmo titulo ja foi capturada para este cliente nos ultimos sete dias.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_news_item_dedupe_guard() FROM PUBLIC;

CREATE INDEX IF NOT EXISTS idx_news_items_user_dedupe_all_recent
ON public.news_items (user_id, created_at DESC, dedupe_url_key, dedupe_title_key);

NOTIFY pgrst, 'reload schema';