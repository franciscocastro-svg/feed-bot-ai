
-- 1) user_settings: intervalo seguro e horários diurnos
UPDATE public.user_settings
SET min_post_interval_minutes = GREATEST(min_post_interval_minutes, 30),
    max_posts_per_day = LEAST(max_posts_per_day, 20),
    preferred_post_hours = ARRAY[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];

-- 2) channel_settings: intervalo, máx/dia e horários por canal
UPDATE public.channel_settings
SET min_interval_minutes = CASE channel
      WHEN 'story' THEN 30
      WHEN 'feed'  THEN 45
      WHEN 'reel'  THEN 90
      ELSE 30 END,
    max_per_day = CASE channel
      WHEN 'story' THEN 10
      WHEN 'feed'  THEN 8
      WHEN 'reel'  THEN 4
      ELSE 5 END,
    allowed_hours = CASE channel
      WHEN 'reel' THEN ARRAY[12,15,18,20,21]
      ELSE ARRAY[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]
    END;

-- 3) Remove duplicatas (mesmo user, mesmo scheduled_for, status scheduled) — mantém o mais antigo
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id, scheduled_for ORDER BY created_at ASC) AS rn
  FROM public.scheduled_posts
  WHERE status = 'scheduled'
)
UPDATE public.scheduled_posts
SET status = 'cancelled', error_message = 'duplicate slot cleanup'
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- 4) Reescala agendamentos futuros: garante 30 min entre posts por usuário
WITH ordered AS (
  SELECT id, user_id, scheduled_for,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY scheduled_for ASC) AS rn
  FROM public.scheduled_posts
  WHERE status = 'scheduled' AND scheduled_for > now()
),
rescheduled AS (
  SELECT id,
         GREATEST(
           now() + interval '2 minutes',
           (SELECT MIN(scheduled_for) FROM ordered o2 WHERE o2.user_id = o.user_id)
         ) + ((rn - 1) * interval '30 minutes') AS new_time
  FROM ordered o
)
UPDATE public.scheduled_posts sp
SET scheduled_for = r.new_time
FROM rescheduled r
WHERE sp.id = r.id;
