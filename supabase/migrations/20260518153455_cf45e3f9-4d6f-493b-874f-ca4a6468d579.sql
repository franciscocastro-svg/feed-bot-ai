-- Fase 1: Biblioteca de Pautas (conteúdo perene, não-notícia)
-- Aditiva: não altera comportamento atual; flag desligada por padrão.

-- 1) Tabela de pautas/temas
CREATE TABLE IF NOT EXISTS public.content_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instagram_account_id uuid NULL,
  title text NOT NULL,
  notes text NULL,
  formats text[] NOT NULL DEFAULT ARRAY['dica','mini_aula','pergunta']::text[],
  active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz NULL,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_topics_user ON public.content_topics(user_id, active);
CREATE INDEX IF NOT EXISTS idx_content_topics_ig ON public.content_topics(instagram_account_id);

ALTER TABLE public.content_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own content_topics" ON public.content_topics;
CREATE POLICY "own content_topics" ON public.content_topics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_content_topics_updated ON public.content_topics;
CREATE TRIGGER trg_content_topics_updated
  BEFORE UPDATE ON public.content_topics
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Flags em user_settings (desligado por padrão)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS topics_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS topics_posts_per_day integer NOT NULL DEFAULT 1;

-- 3) news_items ganha tipo de conteúdo + referência opcional à pauta
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'news',
  ADD COLUMN IF NOT EXISTS topic_id uuid NULL,
  ADD COLUMN IF NOT EXISTS content_format text NULL;

CREATE INDEX IF NOT EXISTS idx_news_items_topic ON public.news_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_news_items_content_type ON public.news_items(content_type);