CREATE OR REPLACE FUNCTION public.set_admin_permissions(
  _target_user_id uuid,
  _is_admin boolean,
  _full_access boolean DEFAULT true,
  _sections text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_sections text[] := ARRAY['users','system','finance','plans','team','tokens','meta','releases','support','roadmap'];
  invalid_sections text[];
  normalized_sections text[];
BEGIN
  IF NOT public.can_manage_admin_permissions() THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_required';
  END IF;

  SELECT array_agg(section)
  INTO invalid_sections
  FROM unnest(COALESCE(_sections, ARRAY[]::text[])) AS section
  WHERE NOT section = ANY(allowed_sections);

  IF invalid_sections IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_admin_sections';
  END IF;

  normalized_sections := CASE
    WHEN _full_access THEN allowed_sections
    ELSE COALESCE(_sections, ARRAY[]::text[])
  END;

  IF _is_admin AND NOT _full_access AND cardinality(normalized_sections) = 0 THEN
    RAISE EXCEPTION 'admin_needs_permission';
  END IF;

  IF NOT _is_admin THEN
    IF _target_user_id = auth.uid() THEN
      RAISE EXCEPTION 'cannot_remove_own_admin';
    END IF;

    DELETE FROM public.admin_permissions
    WHERE user_id = _target_user_id;

    DELETE FROM public.user_roles
    WHERE user_id = _target_user_id
      AND role = 'admin'::public.app_role;

    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_permissions (user_id, full_access, sections)
  VALUES (_target_user_id, _full_access, normalized_sections)
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_access = EXCLUDED.full_access,
    sections = EXCLUDED.sections,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_permissions(uuid, boolean, boolean, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
