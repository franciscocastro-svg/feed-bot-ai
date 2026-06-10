
-- Internal/cron only
REVOKE EXECUTE ON FUNCTION public.get_internal_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_reel_jobs(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_news_item() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() FROM PUBLIC;

-- Admin only
REVOKE EXECUTE ON FUNCTION public.admin_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) TO authenticated;

-- App helpers: signed-in users only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_subscription_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_create_resource(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan_limits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_resource(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(uuid, text) TO authenticated;
