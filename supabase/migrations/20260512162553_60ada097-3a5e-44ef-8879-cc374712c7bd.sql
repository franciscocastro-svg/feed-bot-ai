-- Tabela para armazenar o uso atual de quota da Meta Graph API por conta IG
CREATE TABLE public.meta_api_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instagram_account_id UUID NOT NULL,
  -- Uso do app (header X-App-Usage)
  app_call_count INTEGER NOT NULL DEFAULT 0,
  app_total_time INTEGER NOT NULL DEFAULT 0,
  app_total_cputime INTEGER NOT NULL DEFAULT 0,
  -- Uso do business use case "instagram_content_publish" (header X-Business-Use-Case-Usage)
  buc_call_count INTEGER NOT NULL DEFAULT 0,
  buc_total_time INTEGER NOT NULL DEFAULT 0,
  buc_total_cputime INTEGER NOT NULL DEFAULT 0,
  buc_estimated_time_to_regain_access INTEGER NOT NULL DEFAULT 0,
  -- Maior valor entre todos os percentuais (campo derivado p/ ordenação rápida)
  max_usage_percent INTEGER NOT NULL DEFAULT 0,
  -- Snapshot bruto do header pra debug
  raw_app_usage JSONB,
  raw_buc_usage JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_api_usage_account_captured ON public.meta_api_usage (instagram_account_id, captured_at DESC);
CREATE INDEX idx_meta_api_usage_user_captured ON public.meta_api_usage (user_id, captured_at DESC);

ALTER TABLE public.meta_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own meta_api_usage select" ON public.meta_api_usage
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "no client writes meta_api_usage" ON public.meta_api_usage
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "no client updates meta_api_usage" ON public.meta_api_usage
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "no client deletes meta_api_usage" ON public.meta_api_usage
  FOR DELETE USING (public.is_admin());

-- Threshold (em %) acima do qual o publish-scheduler pausa publicações daquela conta
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS meta_usage_pause_threshold INTEGER NOT NULL DEFAULT 80;

-- View que retorna o snapshot mais recente por conta IG
CREATE OR REPLACE VIEW public.meta_api_usage_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (instagram_account_id)
  id, user_id, instagram_account_id,
  app_call_count, app_total_time, app_total_cputime,
  buc_call_count, buc_total_time, buc_total_cputime, buc_estimated_time_to_regain_access,
  max_usage_percent, raw_app_usage, raw_buc_usage, captured_at
FROM public.meta_api_usage
ORDER BY instagram_account_id, captured_at DESC;