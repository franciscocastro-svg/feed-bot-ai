DROP TRIGGER IF EXISTS prevent_double_publish_trigger ON public.scheduled_posts;
DROP FUNCTION IF EXISTS public.prevent_double_publish();