-- Allow users to clean up failed/cancelled AI cut jobs from their own history.

GRANT DELETE ON public.video_cut_jobs TO authenticated;

DROP POLICY IF EXISTS "users delete own failed video cut jobs" ON public.video_cut_jobs;
CREATE POLICY "users delete own failed video cut jobs"
  ON public.video_cut_jobs FOR DELETE
  USING (
    (auth.uid() = user_id OR public.is_admin())
    AND status IN ('failed', 'cancelled')
  );

NOTIFY pgrst, 'reload schema';
