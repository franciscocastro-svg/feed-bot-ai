WITH ordered AS (
  SELECT id, scheduled_for,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY scheduled_for, id) - 1 AS idx,
    MIN(scheduled_for) OVER (PARTITION BY user_id) AS base
  FROM scheduled_posts
  WHERE status = 'scheduled'
)
UPDATE scheduled_posts sp
SET scheduled_for = o.base + (o.idx * INTERVAL '3 minutes')
FROM ordered o
WHERE sp.id = o.id;