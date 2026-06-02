-- Migration to requeue news items stuck in processing
-- Fixed version with proper type casting for the 'news_status' enum

UPDATE public.news_items
SET
  status = CASE 
    WHEN COALESCE(retry_count, 0) + 1 >= 4 THEN 'failed'::news_status
    ELSE 'pending'::news_status
  END,
  error_message = CASE
    WHEN COALESCE(retry_count, 0) + 1 >= 4 THEN 'Processamento travou repetidas vezes. Verifique logs da Edge Function process-news.'
    ELSE 'Processamento travou >15min. Reenfileirado automaticamente (tentativa ' || (COALESCE(retry_count, 0) + 1) || '/3).'
  END,
  retry_count = COALESCE(retry_count, 0) + 1,
  updated_at = now()
WHERE status = 'processing'
  AND updated_at < now() - interval '15 minutes';

-- Ensure permissions
GRANT SELECT, UPDATE ON public.news_items TO authenticated;
GRANT ALL ON public.news_items TO service_role;
