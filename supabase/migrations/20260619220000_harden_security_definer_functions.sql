-- Harden every current SECURITY DEFINER function in the public schema.
-- A fixed search_path prevents object-shadowing attacks. PUBLIC/anon lose direct
-- execution; service_role remains available for trusted Edge Functions and jobs.
DO $$
DECLARE
  fn record;
  authenticated_functions constant text[] := ARRAY[
    'admin_get_user_details',
    'admin_has_permission',
    'admin_overview',
    'can_create_resource',
    'can_manage_admin_permissions',
    'check_and_increment_usage',
    'get_current_usage',
    'get_effective_account_settings',
    'get_subscription_status',
    'get_unseen_releases',
    'get_user_plan',
    'get_user_plan_limits',
    'has_role',
    'is_admin',
    'is_approved',
    'set_admin_permissions'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = pg_catalog, public, auth, extensions, pgmq',
      fn.signature
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      fn.signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);

    IF fn.proname = ANY(authenticated_functions) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    END IF;
  END LOOP;
END;
$$;

-- Trigger functions are invoked by their triggers, never directly by clients.
-- Queue and worker RPCs intentionally remain service_role-only.
NOTIFY pgrst, 'reload schema';
