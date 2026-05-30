REVOKE ALL ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_reel_render_job_for_post(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() FROM anon;
REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_scheduled_post() FROM authenticated;

REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_news_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_news_item() FROM anon;
REVOKE ALL ON FUNCTION public.tg_enqueue_reel_job_from_news_item() FROM authenticated;

REVOKE ALL ON FUNCTION public.claim_reel_jobs(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_reel_jobs(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_reel_jobs(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reel_jobs(text, integer) TO service_role;