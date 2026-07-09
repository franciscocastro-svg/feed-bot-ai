DROP POLICY IF EXISTS "users delete own failed video cut jobs" ON public.video_cut_jobs;
CREATE POLICY "users delete own finished video cut jobs"
ON public.video_cut_jobs
FOR DELETE
USING (
  ((auth.uid() = user_id) OR is_admin())
  AND (status = ANY (ARRAY['failed'::text, 'cancelled'::text, 'ready'::text, 'discarded'::text]))
);