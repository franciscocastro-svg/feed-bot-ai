-- Pautas 1A: carrosséis estruturados, renderizados slide a slide.
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS carousel_slides jsonb,
  ADD COLUMN IF NOT EXISTS carousel_media_urls text[];

ALTER TABLE public.news_items
  DROP CONSTRAINT IF EXISTS news_items_carousel_slides_check;
ALTER TABLE public.news_items
  ADD CONSTRAINT news_items_carousel_slides_check CHECK (
    carousel_slides IS NULL OR (
      jsonb_typeof(carousel_slides) = 'array'
      AND jsonb_array_length(carousel_slides) BETWEEN 5 AND 7
    )
  );

ALTER TABLE public.news_items
  DROP CONSTRAINT IF EXISTS news_items_carousel_media_urls_check;
ALTER TABLE public.news_items
  ADD CONSTRAINT news_items_carousel_media_urls_check CHECK (
    carousel_media_urls IS NULL OR cardinality(carousel_media_urls) BETWEEN 5 AND 7
  );

COMMENT ON COLUMN public.news_items.carousel_slides IS
  'Contrato editorial persistido do carrossel (5 a 7 slides).';
COMMENT ON COLUMN public.news_items.carousel_media_urls IS
  'Imagens finais, em ordem, prontas para publicação nativa no Instagram.';
