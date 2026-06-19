-- Harden SECURITY DEFINER functions: fix search_path and lock down execution
-- 1) Set explicit search_path on the queue helpers that were missing it
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 2) Revoke EXECUTE from PUBLIC and anon on every SECURITY DEFINER function in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

-- 3) Grant EXECUTE to authenticated only for functions the client/RLS legitimately calls
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_account_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unseen_releases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_resource(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) TO authenticated;

-- 4) service_role keeps full access via its membership; explicit grant for clarity on internal-only helpers
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_reel_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_internal_cron_secret() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_news_item() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_support_message_after_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_support_message_validate_sender_role() TO service_role;