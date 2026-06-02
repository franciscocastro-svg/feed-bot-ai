UPDATE public.news_items
SET
  status = 'pending',
  error_message = 'Reenfileirado após correção do autopilot: processamento anterior travou.',
  retry_count = LEAST(COALESCE(retry_count, 0), 2),
  updated_at = now()
WHERE status = 'rejected'
  AND error_message = 'Travado em processing >15min - liberado automaticamente'
  AND updated_at >= now() - interval '24 hours';
