ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'update' CHECK (campaign_type IN ('update', 'announcement', 'promotion')),
  audience text NOT NULL DEFAULT 'all_opted_in' CHECK (audience IN ('all_opted_in', 'active', 'paying', 'free', 'starter', 'pro', 'business')),
  subject text NOT NULL,
  preview_text text,
  heading text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider_broadcast_id text,
  provider_segment_id text,
  recipient_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON public.email_campaigns(created_at DESC);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email admins view campaigns" ON public.email_campaigns;
CREATE POLICY "email admins view campaigns" ON public.email_campaigns
FOR SELECT USING (public.admin_has_permission('email'));
DROP POLICY IF EXISTS "email admins create campaigns" ON public.email_campaigns;
CREATE POLICY "email admins create campaigns" ON public.email_campaigns
FOR INSERT WITH CHECK (public.admin_has_permission('email') AND created_by = auth.uid());
DROP POLICY IF EXISTS "email admins update campaigns" ON public.email_campaigns;
CREATE POLICY "email admins update campaigns" ON public.email_campaigns
FOR UPDATE USING (public.admin_has_permission('email')) WITH CHECK (public.admin_has_permission('email'));
DROP POLICY IF EXISTS "email admins delete drafts" ON public.email_campaigns;
CREATE POLICY "email admins delete drafts" ON public.email_campaigns
FOR DELETE USING (public.admin_has_permission('email') AND status IN ('draft', 'failed', 'cancelled'));

DROP TRIGGER IF EXISTS tg_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER tg_email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;

UPDATE public.admin_permissions
SET sections = array_append(sections, 'email')
WHERE full_access AND NOT ('email' = ANY(sections));

CREATE OR REPLACE FUNCTION public.set_admin_permissions(
  _target_user_id uuid,
  _is_admin boolean,
  _full_access boolean DEFAULT true,
  _sections text[] DEFAULT ARRAY[]::text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed_sections text[] := ARRAY['users','system','finance','plans','team','tokens','meta','releases','email','support','roadmap'];
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
  IF _is_admin AND NOT _full_access AND cardinality(normalized_sections) = 0 THEN RAISE EXCEPTION 'admin_needs_permission'; END IF;
  IF NOT _is_admin THEN
    IF _target_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_remove_own_admin'; END IF;
    DELETE FROM public.admin_permissions WHERE user_id = _target_user_id;
    DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = 'admin'::public.app_role;
    RETURN;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.admin_permissions (user_id, full_access, sections)
  VALUES (_target_user_id, _full_access, normalized_sections)
  ON CONFLICT (user_id) DO UPDATE
  SET full_access = EXCLUDED.full_access, sections = EXCLUDED.sections, updated_at = now();
END;
$$;

NOTIFY pgrst, 'reload schema';
