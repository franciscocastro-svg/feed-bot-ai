ALTER TABLE public.news_sources
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_items_found integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_items_created integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_new_item_at timestamptz;

COMMENT ON COLUMN public.news_sources.last_success_at IS 'Última leitura concluída sem erro, mesmo quando não havia conteúdo novo.';
COMMENT ON COLUMN public.news_sources.last_error_at IS 'Data do erro mais recente ao acessar ou interpretar a fonte.';
COMMENT ON COLUMN public.news_sources.last_error IS 'Mensagem resumida do erro mais recente.';
COMMENT ON COLUMN public.news_sources.last_items_found IS 'Quantidade de itens encontrados na última leitura antes dos filtros.';
COMMENT ON COLUMN public.news_sources.last_items_created IS 'Quantidade de notícias criadas na última leitura, considerando os IGs vinculados.';
COMMENT ON COLUMN public.news_sources.last_new_item_at IS 'Última vez em que a fonte criou pelo menos uma notícia.';
