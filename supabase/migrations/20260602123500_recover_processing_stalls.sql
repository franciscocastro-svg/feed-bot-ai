UPDATE public.news_items
SET
  status = 'pending',
  error_message = 'Reenfileirado para processamento confirmado pelo autopilot.',
  retry_count = LEAST(COALESCE(retry_count, 0), 2),
  updated_at = now()
WHERE status IN ('processing', 'rejected')
  AND (
    error_message ILIKE '%Travado em processing%'
    OR error_message ILIKE '%processing >15min%'
    OR error_message ILIKE '%Reenfileirado após correção do autopilot%'
    OR status = 'processing'
  )
  AND updated_at >= now() - interval '24 hours';
