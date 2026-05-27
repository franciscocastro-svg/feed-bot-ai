
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

UPDATE public.user_subscriptions SET approval_status = 'approved';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.user_subscriptions (user_id, plan, status, approval_status)
    VALUES (NEW.id, 'free', 'active', 'pending');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = _uid AND approval_status = 'approved'
  ) OR public.has_role(_uid, 'admin'::app_role);
$$;

DROP FUNCTION IF EXISTS public.admin_overview();
CREATE FUNCTION public.admin_overview()
RETURNS TABLE (
  user_id uuid, email text, display_name text, created_at timestamptz,
  plan text, sub_status text, approval_status text, expires_at timestamptz,
  auto_approve boolean, ig_accounts bigint, ig_token_expires timestamptz,
  sources_active bigint, news_pending bigint, posts_scheduled bigint,
  posts_published bigint, posts_failed bigint, last_activity timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT u.id, u.email::text, p.display_name, u.created_at,
    COALESCE(s.plan,'free'), COALESCE(s.status,'active'),
    COALESCE(s.approval_status,'pending'), s.expires_at,
    COALESCE(us.auto_approve,false),
    (SELECT count(*) FROM public.instagram_accounts ia WHERE ia.user_id=u.id AND ia.active),
    (SELECT max(ia.token_expires_at) FROM public.instagram_accounts ia WHERE ia.user_id=u.id AND ia.active),
    (SELECT count(*) FROM public.news_sources ns WHERE ns.user_id=u.id AND ns.active),
    (SELECT count(*) FROM public.news_items ni WHERE ni.user_id=u.id AND ni.status='pending'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id=u.id AND sp.status='scheduled'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id=u.id AND sp.status='posted'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id=u.id AND sp.status='failed'),
    (SELECT max(al.created_at) FROM public.activity_logs al WHERE al.user_id=u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id=u.id
  LEFT JOIN public.user_subscriptions s ON s.user_id=u.id
  LEFT JOIN public.user_settings us ON us.user_id=u.id
  WHERE public.is_admin()
  ORDER BY (COALESCE(s.approval_status,'pending')='pending') DESC, u.created_at DESC;
$$;
