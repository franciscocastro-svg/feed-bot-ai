-- 1) Afiliados: dono vê os próprios dados; admin vê tudo
GRANT SELECT ON public.affiliate_accounts TO authenticated;
GRANT ALL ON public.affiliate_accounts TO service_role;
CREATE POLICY "affiliate_accounts_owner_select" ON public.affiliate_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "affiliate_accounts_admin_all" ON public.affiliate_accounts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
CREATE POLICY "affiliate_referrals_owner_select" ON public.affiliate_referrals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.affiliate_accounts a WHERE a.id = affiliate_referrals.affiliate_id AND a.user_id = auth.uid())
  );
CREATE POLICY "affiliate_referrals_admin_all" ON public.affiliate_referrals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Tabelas operacionais/financeiras: somente admin lê; serviço mantém acesso total
GRANT SELECT ON public.data_deletion_requests TO authenticated;
GRANT ALL ON public.data_deletion_requests TO service_role;
CREATE POLICY "data_deletion_requests_admin_select" ON public.data_deletion_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.payment_reconcile_runs TO authenticated;
GRANT ALL ON public.payment_reconcile_runs TO service_role;
CREATE POLICY "payment_reconcile_runs_admin_select" ON public.payment_reconcile_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.payment_webhook_effects TO authenticated;
GRANT ALL ON public.payment_webhook_effects TO service_role;
CREATE POLICY "payment_webhook_effects_admin_select" ON public.payment_webhook_effects
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;
CREATE POLICY "payment_webhook_events_admin_select" ON public.payment_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.worker_health TO authenticated;
GRANT ALL ON public.worker_health TO service_role;
CREATE POLICY "worker_health_admin_select" ON public.worker_health
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3) Cortes: exigir login (revoga execução anônima das 4 versões)
REVOKE EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean, text[], boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_video_cut_upload_job(uuid, text, integer, boolean, text, text, text, boolean, boolean, boolean, boolean, text[], boolean) TO authenticated;