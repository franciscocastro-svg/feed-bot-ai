
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS auto_approve_enabled_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_track_auto_approve_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.auto_approve = true) THEN
    NEW.auto_approve_enabled_at := now();
  ELSIF (TG_OP = 'UPDATE' AND NEW.auto_approve = true AND COALESCE(OLD.auto_approve, false) = false) THEN
    NEW.auto_approve_enabled_at := now();
  ELSIF (TG_OP = 'UPDATE' AND NEW.auto_approve = false) THEN
    NEW.auto_approve_enabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_auto_approve_enabled_at ON public.user_settings;
CREATE TRIGGER trg_track_auto_approve_enabled_at
BEFORE INSERT OR UPDATE OF auto_approve ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_track_auto_approve_enabled_at();
