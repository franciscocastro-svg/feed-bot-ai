
-- 1) Promover Francisco a admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'franciscotriumclub@gmail.com'
ON CONFLICT DO NOTHING;

-- 2) Helper is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'admin'::app_role) $$;

-- 3) Tabela de assinaturas/planos
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active', -- active | trialing | past_due | canceled | blocked
  expires_at timestamptz,
  notes text,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user view own subscription" ON public.user_subscriptions;
CREATE POLICY "user view own subscription" ON public.user_subscriptions
FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "admin manage subscriptions" ON public.user_subscriptions;
CREATE POLICY "admin manage subscriptions" ON public.user_subscriptions
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER tg_user_subscriptions_updated
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Cria assinatura free pra usuários existentes
INSERT INTO public.user_subscriptions (user_id, plan, status)
SELECT id, 'free', 'active' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Atualiza handle_new_user para criar subscription
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
  INSERT INTO public.user_subscriptions (user_id, plan, status) VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$;

-- 4) Políticas admin: pode ver tudo nas tabelas principais
DO $$ BEGIN
  -- profiles: admin view all
  DROP POLICY IF EXISTS "admin view all profiles" ON public.profiles;
  CREATE POLICY "admin view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
  DROP POLICY IF EXISTS "admin update all profiles" ON public.profiles;
  CREATE POLICY "admin update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());

  DROP POLICY IF EXISTS "admin all news_items" ON public.news_items;
  CREATE POLICY "admin all news_items" ON public.news_items FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "admin all scheduled_posts" ON public.scheduled_posts;
  CREATE POLICY "admin all scheduled_posts" ON public.scheduled_posts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "admin all news_sources" ON public.news_sources;
  CREATE POLICY "admin all news_sources" ON public.news_sources FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "admin all instagram_accounts" ON public.instagram_accounts;
  CREATE POLICY "admin all instagram_accounts" ON public.instagram_accounts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "admin all activity_logs" ON public.activity_logs;
  CREATE POLICY "admin all activity_logs" ON public.activity_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

  DROP POLICY IF EXISTS "admin all user_settings" ON public.user_settings;
  CREATE POLICY "admin all user_settings" ON public.user_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
END $$;

-- 5) Função admin_overview: retorna lista de usuários + métricas
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  plan text,
  sub_status text,
  expires_at timestamptz,
  auto_approve boolean,
  ig_accounts bigint,
  ig_token_expires timestamptz,
  sources_active bigint,
  news_pending bigint,
  posts_scheduled bigint,
  posts_published bigint,
  posts_failed bigint,
  last_activity timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT
    u.id,
    u.email::text,
    p.display_name,
    u.created_at,
    COALESCE(s.plan, 'free'),
    COALESCE(s.status, 'active'),
    s.expires_at,
    COALESCE(us.auto_approve, false),
    (SELECT count(*) FROM public.instagram_accounts ia WHERE ia.user_id = u.id AND ia.active),
    (SELECT max(ia.token_expires_at) FROM public.instagram_accounts ia WHERE ia.user_id = u.id AND ia.active),
    (SELECT count(*) FROM public.news_sources ns WHERE ns.user_id = u.id AND ns.active),
    (SELECT count(*) FROM public.news_items ni WHERE ni.user_id = u.id AND ni.status = 'pending'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id = u.id AND sp.status = 'scheduled'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id = u.id AND sp.status = 'posted'),
    (SELECT count(*) FROM public.scheduled_posts sp WHERE sp.user_id = u.id AND sp.status = 'failed'),
    (SELECT max(al.created_at) FROM public.activity_logs al WHERE al.user_id = u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
  LEFT JOIN public.user_settings us ON us.user_id = u.id
  WHERE public.is_admin()
  ORDER BY u.created_at DESC;
$$;
