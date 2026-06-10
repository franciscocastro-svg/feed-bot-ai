
-- 1) reel_render_jobs: owner-scoped write policies (service_role bypasses RLS)
DROP POLICY IF EXISTS "own jobs insert" ON public.reel_render_jobs;
DROP POLICY IF EXISTS "own jobs update" ON public.reel_render_jobs;
DROP POLICY IF EXISTS "own jobs delete" ON public.reel_render_jobs;

CREATE POLICY "own jobs insert" ON public.reel_render_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own jobs update" ON public.reel_render_jobs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "own jobs delete" ON public.reel_render_jobs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 2) support_messages sender_role guard
CREATE OR REPLACE FUNCTION public.tg_support_message_validate_sender_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_role NOT IN ('user','admin') THEN
    NEW.sender_role := 'user';
  END IF;
  IF NEW.sender_role = 'admin' AND NOT public.is_admin() THEN
    NEW.sender_role := 'user';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_support_message_validate_sender_role() FROM PUBLIC;

DROP TRIGGER IF EXISTS support_message_validate_role ON public.support_messages;
CREATE TRIGGER support_message_validate_role
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_message_validate_sender_role();

-- 3) support-images DELETE policy (mirror support-audio pattern)
DROP POLICY IF EXISTS "support images: owner or admin can delete" ON storage.objects;
CREATE POLICY "support images: owner or admin can delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'support-images'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE (t.id)::text = (storage.foldername(objects.name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

-- 4) admin permission defaults: no implicit full access once any permission row exists
CREATE OR REPLACE FUNCTION public.admin_has_permission(_section text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() AND (
    NOT EXISTS (SELECT 1 FROM public.admin_permissions)
    OR COALESCE((
      SELECT full_access OR _section = ANY(sections)
      FROM public.admin_permissions WHERE user_id = auth.uid()
    ), false)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_admin_permissions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() AND (
    NOT EXISTS (SELECT 1 FROM public.admin_permissions)
    OR COALESCE((
      SELECT full_access OR 'team' = ANY(sections)
      FROM public.admin_permissions WHERE user_id = auth.uid()
    ), false)
  );
$$;

-- Bootstrap: ensure current admin(s) keep full access by inserting an explicit row.
INSERT INTO public.admin_permissions (user_id, full_access, sections)
SELECT ur.user_id, true, ARRAY['users','system','finance','plans','team','tokens','meta','releases','support','roadmap']
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- 5) Revoke EXECUTE from PUBLIC on sensitive SECURITY DEFINER functions; grant to authenticated only
REVOKE EXECUTE ON FUNCTION public.admin_get_user_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_has_permission(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_admin_permissions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_usage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_effective_account_settings(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unseen_releases() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_support_message_after_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_track_auto_approve_enabled_at() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_account_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unseen_releases() TO authenticated;

-- 6) tg_set_updated_at: pin search_path
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
