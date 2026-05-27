CREATE OR REPLACE FUNCTION public.get_internal_cron_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret' LIMIT 1;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_internal_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_cron_secret() TO service_role;