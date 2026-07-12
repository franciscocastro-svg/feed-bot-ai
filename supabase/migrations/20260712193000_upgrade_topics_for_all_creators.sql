-- Central de Pautas universal para criadores de qualquer nicho.
-- Migração aditiva: preserva todas as pautas e automações existentes.

ALTER TABLE public.content_topics
  ADD COLUMN IF NOT EXISTS content_pillar text NULL,
  ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'educar',
  ADD COLUMN IF NOT EXISTS target_audience text NULL,
  ADD COLUMN IF NOT EXISTS funnel_stage text NOT NULL DEFAULT 'descoberta',
  ADD COLUMN IF NOT EXISTS tone text NULL,
  ADD COLUMN IF NOT EXISTS call_to_action text NULL,
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS frequency_per_week integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preferred_days integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS evergreen boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';

ALTER TABLE public.content_topics
  DROP CONSTRAINT IF EXISTS content_topics_frequency_per_week_check,
  ADD CONSTRAINT content_topics_frequency_per_week_check
    CHECK (frequency_per_week BETWEEN 1 AND 7),
  DROP CONSTRAINT IF EXISTS content_topics_priority_check,
  ADD CONSTRAINT content_topics_priority_check
    CHECK (priority BETWEEN 1 AND 5),
  DROP CONSTRAINT IF EXISTS content_topics_objective_check,
  ADD CONSTRAINT content_topics_objective_check
    CHECK (objective IN ('educar', 'engajar', 'autoridade', 'vender', 'entreter', 'comunidade')),
  DROP CONSTRAINT IF EXISTS content_topics_funnel_stage_check,
  ADD CONSTRAINT content_topics_funnel_stage_check
    CHECK (funnel_stage IN ('descoberta', 'consideracao', 'conversao', 'retencao'));

CREATE INDEX IF NOT EXISTS idx_content_topics_planning
  ON public.content_topics(user_id, active, priority DESC, last_used_at ASC);

CREATE INDEX IF NOT EXISTS idx_content_topics_account_pillar
  ON public.content_topics(user_id, instagram_account_id, content_pillar);

COMMENT ON COLUMN public.content_topics.preferred_days IS
  'Dias da semana em JavaScript: 0=domingo ... 6=sábado. Vazio significa qualquer dia.';

NOTIFY pgrst, 'reload schema';
