-- Recupera posts antigos presos em envio antes de aplicar a trava
UPDATE public.scheduled_posts
SET status = 'scheduled',
    scheduled_for = now() + interval '2 minutes',
    error_message = 'Recuperado de envio travado. Tentando novamente com trava por conta.',
    updated_at = now()
WHERE status = 'posting'
  AND updated_at < now() - interval '15 minutes';

-- Garante no banco que uma conta do Instagram só pode ter 1 post em envio por vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_posts_one_posting_per_ig
ON public.scheduled_posts (instagram_account_id)
WHERE status = 'posting' AND instagram_account_id IS NOT NULL;

-- Ajuda a checagem rápida do último post por conta
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_account_posted_at
ON public.scheduled_posts (instagram_account_id, posted_at DESC)
WHERE status = 'posted' AND posted_at IS NOT NULL;