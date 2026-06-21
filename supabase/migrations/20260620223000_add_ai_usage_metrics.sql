CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL DEFAULT 'rewrite_news',
  prompt_tokens bigint NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens bigint NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens bigint NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  estimated_cost_usd numeric(14,8) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  success boolean NOT NULL DEFAULT true,
  http_status integer,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_usage_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage_events FROM authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

DROP POLICY IF EXISTS "admins read ai usage" ON public.ai_usage_events;
CREATE POLICY "admins read ai usage"
ON public.ai_usage_events
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_created
ON public.ai_usage_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_created
ON public.ai_usage_events (user_id, created_at DESC);

CREATE OR REPLACE VIEW public.admin_ai_usage_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at) AS usage_day,
  provider,
  model,
  count(*)::bigint AS calls,
  count(*) FILTER (WHERE success)::bigint AS successful_calls,
  count(*) FILTER (WHERE NOT success)::bigint AS failed_calls,
  sum(prompt_tokens)::bigint AS prompt_tokens,
  sum(completion_tokens)::bigint AS completion_tokens,
  sum(total_tokens)::bigint AS total_tokens,
  sum(estimated_cost_usd)::numeric(14,8) AS estimated_cost_usd,
  avg(latency_ms)::numeric(12,2) AS average_latency_ms,
  max(created_at) AS last_used_at
FROM public.ai_usage_events
GROUP BY date_trunc('day', created_at), provider, model;

REVOKE ALL ON public.admin_ai_usage_daily FROM anon;
GRANT SELECT ON public.admin_ai_usage_daily TO authenticated;
