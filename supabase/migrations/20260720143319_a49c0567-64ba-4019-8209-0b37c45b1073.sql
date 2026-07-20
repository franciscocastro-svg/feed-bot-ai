CREATE OR REPLACE FUNCTION public.tg_snapshot_editorial_reel_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref smallint;
BEGIN
  IF NEW.editorial_reel_duration_seconds IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT editorial_reel_duration_seconds
    INTO v_pref
  FROM public.user_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF v_pref IS NOT NULL AND v_pref IN (6, 20, 30) THEN
    NEW.editorial_reel_duration_seconds := v_pref;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_editorial_reel_duration ON public.news_items;
CREATE TRIGGER snapshot_editorial_reel_duration
  BEFORE INSERT ON public.news_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_snapshot_editorial_reel_duration();