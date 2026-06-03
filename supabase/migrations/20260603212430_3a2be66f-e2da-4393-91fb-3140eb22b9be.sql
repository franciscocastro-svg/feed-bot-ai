CREATE TABLE IF NOT EXISTS public.admin_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sections text[] NOT NULL DEFAULT ARRAY[]::text[],
  full_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_admin_permissions_updated_at ON public.admin_permissions;
CREATE TRIGGER tg_admin_permissions_updated_at
  BEFORE UPDATE ON public.admin_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_has_permission(_section text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    AND COALESCE((
      SELECT full_access OR _section = ANY(sections)
      FROM public.admin_permissions WHERE user_id = auth.uid()
    ), true);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_admin_permissions()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    AND COALESCE((
      SELECT full_access OR 'team' = ANY(sections)
      FROM public.admin_permissions WHERE user_id = auth.uid()
    ), true);
$$;

DROP POLICY IF EXISTS "admins view admin permissions" ON public.admin_permissions;
CREATE POLICY "admins view admin permissions" ON public.admin_permissions
FOR SELECT USING (user_id = auth.uid() OR public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins insert admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins insert admin permissions" ON public.admin_permissions
FOR INSERT WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins update admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins update admin permissions" ON public.admin_permissions
FOR UPDATE USING (public.can_manage_admin_permissions()) WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins delete admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins delete admin permissions" ON public.admin_permissions
FOR DELETE USING (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "admins view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "team admins view all roles" ON public.user_roles;
CREATE POLICY "team admins view all roles" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id OR public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins insert roles" ON public.user_roles;
CREATE POLICY "team admins insert roles" ON public.user_roles
FOR INSERT WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins delete roles" ON public.user_roles;
CREATE POLICY "team admins delete roles" ON public.user_roles
FOR DELETE USING (public.can_manage_admin_permissions());

INSERT INTO public.admin_permissions (user_id, full_access, sections)
SELECT user_id, true,
  ARRAY['users','system','finance','plans','team','tokens','meta','releases','support','roadmap']::text[]
FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_permissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_admin_permissions(
  _target_user_id uuid,
  _is_admin boolean,
  _full_access boolean DEFAULT true,
  _sections text[] DEFAULT ARRAY[]::text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed_sections text[] := ARRAY['users','system','finance','plans','team','tokens','meta','releases','support','roadmap'];
  invalid_sections text[];
  normalized_sections text[];
BEGIN
  IF NOT public.can_manage_admin_permissions() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'target_user_required'; END IF;

  SELECT array_agg(section) INTO invalid_sections
  FROM unnest(COALESCE(_sections, ARRAY[]::text[])) AS section
  WHERE NOT section = ANY(allowed_sections);
  IF invalid_sections IS NOT NULL THEN RAISE EXCEPTION 'invalid_admin_sections'; END IF;

  normalized_sections := CASE WHEN _full_access THEN allowed_sections ELSE COALESCE(_sections, ARRAY[]::text[]) END;

  IF _is_admin AND NOT _full_access AND cardinality(normalized_sections) = 0 THEN
    RAISE EXCEPTION 'admin_needs_permission';
  END IF;

  IF NOT _is_admin THEN
    IF _target_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_remove_own_admin'; END IF;
    DELETE FROM public.admin_permissions WHERE user_id = _target_user_id;
    DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'::public.app_role;
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_permissions (user_id, full_access, sections)
  VALUES (_target_user_id, _full_access, normalized_sections)
  ON CONFLICT (user_id) DO UPDATE
  SET full_access = EXCLUDED.full_access, sections = EXCLUDED.sections, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';