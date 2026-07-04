DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'source_kind'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.source_kind AS ENUM ('rss', 'site', 'url', 'person', 'topic', 'google_news');
  END IF;
END $$;

ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS source_kind public.source_kind NOT NULL DEFAULT 'rss',
  ADD COLUMN IF NOT EXISTS query text,
  ADD COLUMN IF NOT EXISTS include_terms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_terms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS source_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.news_sources
SET
  source_kind = CASE
    WHEN niche ~* '^Pessoa:' THEN 'person'::public.source_kind
    WHEN niche ~* '^Tema:' THEN 'topic'::public.source_kind
    WHEN niche ~* '^URL:' THEN 'url'::public.source_kind
    WHEN url ILIKE '%news.google.com/rss/search%' THEN 'google_news'::public.source_kind
    WHEN niche ~* '^RSS:' THEN 'rss'::public.source_kind
    ELSE source_kind
  END,
  query = COALESCE(
    query,
    NULLIF(regexp_replace(COALESCE(niche, ''), '^(Pessoa|Tema|URL|RSS):\s*', '', 'i'), '')
  ),
  source_config = COALESCE(NULLIF(source_config, '{}'::jsonb), '{}'::jsonb) ||
    jsonb_build_object('migrated_from_niche', niche)
WHERE query IS NULL
  OR source_config = '{}'::jsonb
  OR source_kind = 'rss';

CREATE TABLE IF NOT EXISTS public.source_fetch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.news_sources(id) ON DELETE SET NULL,
  source_name text,
  source_kind public.source_kind NOT NULL DEFAULT 'rss',
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_after_freshness integer NOT NULL DEFAULT 0,
  items_after_relevance integer NOT NULL DEFAULT 0,
  items_duplicates integer NOT NULL DEFAULT 0,
  items_without_image integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  error_message text,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.source_fetch_runs TO authenticated;
GRANT ALL ON public.source_fetch_runs TO service_role;

ALTER TABLE public.source_fetch_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'source_fetch_runs'
      AND policyname = 'own source_fetch_runs'
  ) THEN
    CREATE POLICY "own source_fetch_runs"
      ON public.source_fetch_runs
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_source_fetch_runs_source_started
  ON public.source_fetch_runs(source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_fetch_runs_user_started
  ON public.source_fetch_runs(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_fetch_runs_status
  ON public.source_fetch_runs(status);

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS original_canonical_url text;

UPDATE public.news_items
SET original_canonical_url = original_url
WHERE original_canonical_url IS NULL;

ALTER TABLE public.news_items
  DROP CONSTRAINT IF EXISTS news_items_user_id_original_url_key;

DROP INDEX IF EXISTS news_items_user_url_unique;
DROP INDEX IF EXISTS news_items_user_url_uniq;

CREATE INDEX IF NOT EXISTS idx_news_items_user_ig_canonical
  ON public.news_items(
    user_id,
    COALESCE(instagram_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(original_canonical_url, original_url)
  );

CREATE INDEX IF NOT EXISTS idx_news_sources_kind
  ON public.news_sources(source_kind);

CREATE INDEX IF NOT EXISTS idx_news_sources_quality
  ON public.news_sources(user_id, quality_score DESC);

COMMENT ON COLUMN public.news_sources.source_kind IS 'Tipo real da fonte: RSS, site/listagem, URL, pessoa, tema ou Google News.';
COMMENT ON COLUMN public.news_sources.query IS 'Busca principal usada em fontes de pessoa, tema ou Google News.';
COMMENT ON COLUMN public.news_sources.include_terms IS 'Termos que aumentam/confirmam relevância da captação.';
COMMENT ON COLUMN public.news_sources.exclude_terms IS 'Termos que descartam itens indesejados.';
COMMENT ON COLUMN public.news_sources.source_config IS 'Configuração flexível da fonte, como aliases, URL original e parâmetros da busca.';
COMMENT ON COLUMN public.news_sources.last_run_summary IS 'Resumo da última captação, usado pela interface para explicar o resultado.';
COMMENT ON TABLE public.source_fetch_runs IS 'Histórico auditável de leituras das fontes e funil de descarte.';