CREATE TABLE IF NOT EXISTS public.admin_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sections text[] NOT NULL DEFAULT ARRAY[]::text[],
  full_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_admin_permissions_updated_at ON public.admin_permissions;
CREATE TRIGGER tg_admin_permissions_updated_at
  BEFORE UPDATE ON public.admin_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.admin_has_permission(_section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    AND COALESCE((
      SELECT full_access OR _section = ANY(sections)
      FROM public.admin_permissions
      WHERE user_id = auth.uid()
    ), true);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_admin_permissions()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    AND COALESCE((
      SELECT full_access OR 'team' = ANY(sections)
      FROM public.admin_permissions
      WHERE user_id = auth.uid()
    ), true);
$$;

DROP POLICY IF EXISTS "admins view admin permissions" ON public.admin_permissions;
CREATE POLICY "admins view admin permissions"
ON public.admin_permissions
FOR SELECT
USING (user_id = auth.uid() OR public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins insert admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins insert admin permissions"
ON public.admin_permissions
FOR INSERT
WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins update admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins update admin permissions"
ON public.admin_permissions
FOR UPDATE
USING (public.can_manage_admin_permissions())
WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins delete admin permissions" ON public.admin_permissions;
CREATE POLICY "team admins delete admin permissions"
ON public.admin_permissions
FOR DELETE
USING (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "admins view all roles" ON public.user_roles;
CREATE POLICY "team admins view all roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id OR public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins insert roles" ON public.user_roles;
CREATE POLICY "team admins insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.can_manage_admin_permissions());

DROP POLICY IF EXISTS "team admins delete roles" ON public.user_roles;
CREATE POLICY "team admins delete roles"
ON public.user_roles
FOR DELETE
USING (public.can_manage_admin_permissions());

INSERT INTO public.admin_permissions (user_id, full_access, sections)
SELECT
  user_id,
  true,
  ARRAY['users','system','finance','plans','team','tokens','meta','releases','support','roadmap']::text[]
FROM public.user_roles
WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_admin_permissions() TO authenticated;
