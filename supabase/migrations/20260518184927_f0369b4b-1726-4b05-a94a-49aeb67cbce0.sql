
-- Cache compartilhado de reescrita de IA por URL+config.
-- Quando o mesmo item RSS aparece pra múltiplos usuários com a mesma
-- combinação (tom, idioma, tradução, adaptação cultural), reusamos o
-- resultado em vez de chamar gemini-2.5-pro de novo.
CREATE TABLE IF NOT EXISTS public.ai_rewrite_cache (
  cache_key TEXT PRIMARY KEY,
  source_url TEXT,
  payload JSONB NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ai_rewrite_cache_expires ON public.ai_rewrite_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_rewrite_cache_source ON public.ai_rewrite_cache(source_url);

-- Apenas service_role (edge functions) acessa. Não exposto ao cliente.
ALTER TABLE public.ai_rewrite_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.ai_rewrite_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
