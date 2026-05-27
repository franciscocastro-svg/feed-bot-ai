
DROP POLICY IF EXISTS "admin all news_items" ON public.news_items;
DROP POLICY IF EXISTS "admin all scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "admin all news_sources" ON public.news_sources;
DROP POLICY IF EXISTS "admin all instagram_accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "admin all activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "admin all user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "admin update all profiles" ON public.profiles;
-- mantém "admin view all profiles" para o painel mostrar nomes
