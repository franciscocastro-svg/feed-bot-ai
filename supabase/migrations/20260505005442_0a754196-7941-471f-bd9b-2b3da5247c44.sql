-- Remove duplicatas pré-existentes (mantém a mais antiga por user_id+original_url)
DELETE FROM public.news_items a USING public.news_items b
WHERE a.ctid > b.ctid AND a.user_id = b.user_id AND a.original_url = b.original_url;

CREATE UNIQUE INDEX IF NOT EXISTS news_items_user_url_uniq ON public.news_items (user_id, original_url);
CREATE INDEX IF NOT EXISTS news_items_user_title_idx ON public.news_items (user_id, lower(original_title));