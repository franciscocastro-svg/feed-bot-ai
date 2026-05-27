
CREATE POLICY "admin view all ig_accounts" ON public.instagram_accounts FOR SELECT USING (public.is_admin());
CREATE POLICY "admin view all news_sources" ON public.news_sources FOR SELECT USING (public.is_admin());
CREATE POLICY "admin view all scheduled_posts" ON public.scheduled_posts FOR SELECT USING (public.is_admin());
CREATE POLICY "admin view all activity_logs" ON public.activity_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "admin view all news_items" ON public.news_items FOR SELECT USING (public.is_admin());
