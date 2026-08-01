-- Corrige a dependência da aplicação do Piloto Editorial em ambientes onde
-- a migration histórica de fingerprint de fontes não foi aplicada por completo.
-- É aditiva e não cria índice único: a RPC já serializa aplicações por usuário/conta.

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS source_fingerprint text;

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
SET search_path = public, pg_catalog
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

CREATE OR REPLACE FUNCTION public.tg_news_source_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
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

UPDATE public.news_sources
SET source_fingerprint = public.compute_source_fingerprint(
  source_kind,
  url,
  query,
  country,
  language
)
WHERE source_fingerprint IS NULL OR source_fingerprint = '';

COMMENT ON COLUMN public.news_sources.source_fingerprint IS
  'Identidade normalizada da fonte usada para deduplicação por usuário.';

NOTIFY pgrst, 'reload schema';