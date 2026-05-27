
-- 1. Libera posts travados em "posting" há mais de 10 minutos
UPDATE public.scheduled_posts
SET status = 'scheduled',
    scheduled_for = now() + interval '2 minutes',
    error_message = 'Recuperado de estado travado (posting). Tentando novamente.',
    updated_at = now()
WHERE status = 'posting'
  AND updated_at < now() - interval '10 minutes';

-- 2. Trigger anti-race-condition: se um post for marcado como "posted" e
--    existir outro post "posted" da MESMA conta IG com menos de 25 min de
--    diferença, reverte ESTE para "scheduled" e empurra para depois do cooldown.
CREATE OR REPLACE FUNCTION public.prevent_double_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_posted timestamptz;
BEGIN
  IF NEW.status = 'posted' AND NEW.posted_at IS NOT NULL
     AND NEW.instagram_account_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'posted') THEN

    SELECT max(posted_at) INTO last_posted
    FROM public.scheduled_posts
    WHERE instagram_account_id = NEW.instagram_account_id
      AND status = 'posted'
      AND id <> NEW.id
      AND posted_at IS NOT NULL;

    IF last_posted IS NOT NULL
       AND NEW.posted_at - last_posted < interval '25 minutes' THEN
      NEW.status := 'scheduled';
      NEW.posted_at := NULL;
      NEW.ig_media_id := NULL;
      NEW.scheduled_for := last_posted + interval '30 minutes';
      NEW.error_message := 'Bloqueado por proteção anti-duplicação (intervalo < 25 min). Reagendado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_double_publish_trigger ON public.scheduled_posts;
CREATE TRIGGER prevent_double_publish_trigger
BEFORE UPDATE ON public.scheduled_posts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_double_publish();
