REVOKE EXECUTE ON FUNCTION public.cleanup_instagram_token_secret() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enforce_customer_resource_limit() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.protect_instagram_access_token() FROM anon, public;