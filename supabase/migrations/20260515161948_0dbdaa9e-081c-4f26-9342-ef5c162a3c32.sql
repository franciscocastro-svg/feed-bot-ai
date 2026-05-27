
-- Remover as políticas de admin que vazavam dados de outros usuários nas páginas regulares
DROP POLICY IF EXISTS "admin view all ig_accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "admin view all news_sources" ON public.news_sources;
DROP POLICY IF EXISTS "admin view all scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "admin view all activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "admin view all news_items" ON public.news_items;

-- Função SECURITY DEFINER para admins buscarem dados de qualquer usuário (apenas no painel admin)
CREATE OR REPLACE FUNCTION public.admin_get_user_details(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ig jsonb;
  v_sources jsonb;
  v_posts jsonb;
  v_logs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_ig
  FROM (
    SELECT id, username, active, token_expires_at, verification_status
    FROM public.instagram_accounts WHERE user_id = _uid
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT id, name, url, active, last_fetched_at
    FROM public.news_sources WHERE user_id = _uid
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_posts
  FROM (
    SELECT sp.id, sp.status::text AS status, sp.scheduled_for, sp.posted_at,
           sp.error_message, sp.media_type,
           jsonb_build_object('rewritten_title', ni.rewritten_title) AS news_items
    FROM public.scheduled_posts sp
    LEFT JOIN public.news_items ni ON ni.id = sp.news_item_id
    WHERE sp.user_id = _uid
    ORDER BY sp.created_at DESC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_logs
  FROM (
    SELECT id, action, entity_type, created_at, details
    FROM public.activity_logs WHERE user_id = _uid
    ORDER BY created_at DESC LIMIT 15
  ) t;

  RETURN jsonb_build_object(
    'instagram_accounts', v_ig,
    'news_sources', v_sources,
    'scheduled_posts', v_posts,
    'activity_logs', v_logs
  );
END;
$$;
