-- Diagnostico e reparo seguro para cliente com mais de um Instagram.
-- Troque o email/usernames no bloco params para reutilizar com outro cliente.

WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id, u.email
  FROM auth.users u
  JOIN params p ON p.email = u.email
)
SELECT 'usuario' AS section, row_to_json(tu) AS data
FROM target_user tu;

WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id
  FROM auth.users u
  JOIN params p ON p.email = u.email
)
SELECT
  ia.id,
  ia.username,
  ia.active,
  ia.verification_status,
  ia.token_expires_at,
  ia.updated_at
FROM public.instagram_accounts ia
JOIN target_user tu ON tu.id = ia.user_id
JOIN params p ON ia.username = ANY(p.usernames)
ORDER BY ia.username;

WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id
  FROM auth.users u
  JOIN params p ON p.email = u.email
)
SELECT
  ns.id,
  ns.name,
  ns.active,
  ns.source_kind,
  ns.url,
  ns.fetch_interval_minutes,
  ns.last_fetched_at,
  COALESCE(array_agg(ia.username ORDER BY ia.username) FILTER (WHERE ia.username IS NOT NULL), ARRAY[]::text[]) AS linked_instagrams
FROM public.news_sources ns
JOIN target_user tu ON tu.id = ns.user_id
LEFT JOIN public.news_source_instagram_accounts link ON link.source_id = ns.id
LEFT JOIN public.instagram_accounts ia ON ia.id = link.instagram_account_id
GROUP BY ns.id
ORDER BY ns.active DESC, ns.updated_at DESC NULLS LAST, ns.created_at DESC;

WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id
  FROM auth.users u
  JOIN params p ON p.email = u.email
)
SELECT
  COALESCE(ia.username, 'sem_instagram') AS username,
  ni.status,
  count(*) AS total,
  max(ni.created_at) AS ultimo_item
FROM public.news_items ni
JOIN target_user tu ON tu.id = ni.user_id
LEFT JOIN public.instagram_accounts ia ON ia.id = ni.instagram_account_id
WHERE ni.created_at >= now() - interval '24 hours'
GROUP BY COALESCE(ia.username, 'sem_instagram'), ni.status
ORDER BY username, ni.status;

WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id
  FROM auth.users u
  JOIN params p ON p.email = u.email
)
SELECT
  ia.username,
  sp.status,
  count(*) AS total,
  max(sp.scheduled_for) AS ultimo_agendamento,
  max(sp.posted_at) AS ultima_publicacao,
  max(sp.error_message) FILTER (WHERE sp.error_message IS NOT NULL) AS ultimo_erro
FROM public.scheduled_posts sp
JOIN target_user tu ON tu.id = sp.user_id
LEFT JOIN public.instagram_accounts ia ON ia.id = sp.instagram_account_id
WHERE sp.created_at >= now() - interval '24 hours'
GROUP BY ia.username, sp.status
ORDER BY ia.username, sp.status;

-- Reparo opcional:
-- Use somente quando as mesmas fontes devem publicar nos dois Instagrams.
-- Ele pega fontes que ja estao ligadas a pelo menos uma das contas informadas
-- e completa o vinculo da fonte para as outras contas da lista.
WITH params AS (
  SELECT
    'r6cardoso@gmail.com'::text AS email,
    ARRAY['_r6news', 'eufuxicando_']::text[] AS usernames
),
target_user AS (
  SELECT u.id
  FROM auth.users u
  JOIN params p ON p.email = u.email
),
target_igs AS (
  SELECT ia.id, ia.user_id
  FROM public.instagram_accounts ia
  JOIN target_user tu ON tu.id = ia.user_id
  JOIN params p ON ia.username = ANY(p.usernames)
  WHERE ia.active = true
),
source_scope AS (
  SELECT DISTINCT ns.id, ns.user_id
  FROM public.news_sources ns
  JOIN public.news_source_instagram_accounts link ON link.source_id = ns.id
  JOIN target_igs tig ON tig.id = link.instagram_account_id
  WHERE ns.active = true
)
INSERT INTO public.news_source_instagram_accounts (source_id, instagram_account_id, user_id)
SELECT source_scope.id, target_igs.id, source_scope.user_id
FROM source_scope
CROSS JOIN target_igs
ON CONFLICT (source_id, instagram_account_id) DO NOTHING;
