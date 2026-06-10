
-- Trigger functions: revoke from everyone except postgres/service_role (triggers run as table owner)
REVOKE EXECUTE ON FUNCTION public.tg_support_message_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_support_message_validate_sender_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_news_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_track_auto_approve_enabled_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Admin/sensitive functions: revoke anon
REVOKE EXECUTE ON FUNCTION public.admin_get_user_details(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_has_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_admin_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_account_settings(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_unseen_releases() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_subscription_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_create_resource(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM PUBLIC, anon;

-- Internal/service-only functions: revoke from everyone except service_role/postgres
REVOKE EXECUTE ON FUNCTION public.get_internal_cron_secret() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_reel_jobs(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) FROM PUBLIC, anon, authenticated;

-- Re-grant to authenticated for user-facing helpers
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_account_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unseen_releases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_resource(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) TO authenticated;

-- Reinforce support_messages sender_role guard: harden trigger to RAISE for non-admin spoof attempts
CREATE OR REPLACE FUNCTION public.tg_support_message_validate_sender_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_role IS NULL OR NEW.sender_role NOT IN ('user','admin') THEN
    NEW.sender_role := 'user';
  END IF;
  IF NEW.sender_role = 'admin' AND NOT public.is_admin() THEN
    -- Não permitir spoof: força como usuário comum
    NEW.sender_role := 'user';
  END IF;
  -- Garante que sender_id corresponde ao chamador (exceto service_role)
  IF auth.uid() IS NOT NULL AND NEW.sender_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    NEW.sender_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS tg_support_message_validate_sender_role ON public.support_messages;
CREATE TRIGGER tg_support_message_validate_sender_role
BEFORE INSERT OR UPDATE ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_support_message_validate_sender_role();
