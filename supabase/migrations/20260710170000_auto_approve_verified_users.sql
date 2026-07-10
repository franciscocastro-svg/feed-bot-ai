-- Email verification replaces manual customer approval. Access to paid features
-- still requires an active/trialing non-free subscription through is_approved().

CREATE OR REPLACE FUNCTION public.auto_approve_verified_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.user_subscriptions
    SET approval_status = 'approved', updated_at = now()
    WHERE user_id = NEW.id
      AND approval_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_auto_approve_verified_user ON auth.users;
CREATE TRIGGER zz_auto_approve_verified_user
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.auto_approve_verified_user();

-- Bring already verified customers out of the old manual queue without
-- unblocking rejected accounts or bypassing subscription checks.
UPDATE public.user_subscriptions subscriptions
SET approval_status = 'approved', updated_at = now()
FROM auth.users users
WHERE users.id = subscriptions.user_id
  AND users.email_confirmed_at IS NOT NULL
  AND subscriptions.approval_status = 'pending';

REVOKE ALL ON FUNCTION public.auto_approve_verified_user() FROM PUBLIC, anon, authenticated;
