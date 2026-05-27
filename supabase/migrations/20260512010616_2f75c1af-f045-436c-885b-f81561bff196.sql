WITH acc AS (
  SELECT id FROM public.instagram_accounts WHERE username = 'showdeesportes' LIMIT 1
),
to_fix AS (
  SELECT sp.id, row_number() OVER (ORDER BY sp.scheduled_for ASC) AS rn
  FROM public.scheduled_posts sp, acc
  WHERE sp.instagram_account_id = acc.id
    AND sp.status = 'scheduled'
    AND sp.error_message ILIKE '%bloqueio global%'
)
UPDATE public.scheduled_posts sp
SET scheduled_for = now() + ((to_fix.rn - 1) * interval '30 minutes'),
    error_message = NULL
FROM to_fix
WHERE sp.id = to_fix.id;