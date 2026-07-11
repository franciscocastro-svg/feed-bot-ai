-- === 1. Verification codes table ===
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user
  ON public.email_verification_codes(user_id, used_at, expires_at);

GRANT ALL ON public.email_verification_codes TO service_role;
-- authenticated users never touch this table directly; all reads/writes go through SECURITY DEFINER RPCs.

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service manages verification codes" ON public.email_verification_codes;
CREATE POLICY "service manages verification codes" ON public.email_verification_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- === 2. Audit + rate-limit fields on user_subscriptions ===
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS verification_blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_code_sent_at timestamptz;

-- === 3. Drop old auto-approve-on-email-confirm trigger (approval now requires paid webhook + code) ===
DROP TRIGGER IF EXISTS zz_auto_approve_verified_user ON auth.users;

-- === 4. New signups start in pending_payment ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, whatsapp, city, state, country)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'whatsapp',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'state',
    NEW.raw_user_meta_data->>'country');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.user_subscriptions (user_id, plan, status, approval_status)
    VALUES (NEW.id, 'free', 'active', 'pending_payment');
  RETURN NEW;
END;
$function$;

-- === 5. Mark pending_email_verification (idempotent, service_role only) ===
CREATE OR REPLACE FUNCTION public.mark_pending_email_verification(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_current text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  SELECT approval_status INTO v_current FROM public.user_subscriptions WHERE user_id = _user_id;
  IF v_current = 'approved' THEN
    RETURN false; -- already approved, nothing to do (idempotent for repeated webhooks)
  END IF;
  UPDATE public.user_subscriptions
    SET approval_status = 'pending_email_verification', updated_at = now()
    WHERE user_id = _user_id
      AND approval_status <> 'approved';
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_pending_email_verification(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mark_pending_email_verification(uuid) TO service_role;

-- === 6. Verify code RPC (called by authenticated user from /verify-email) ===
CREATE OR REPLACE FUNCTION public.verify_email_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sub record;
  v_code record;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF _code IS NULL OR _code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = v_uid FOR UPDATE;
  IF v_sub.approval_status = 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- rate-limit: temporary block
  IF v_sub.verification_blocked_until IS NOT NULL AND v_sub.verification_blocked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked',
      'retry_after', extract(epoch FROM (v_sub.verification_blocked_until - now()))::int);
  END IF;

  SELECT * INTO v_code
    FROM public.email_verification_codes
   WHERE user_id = v_uid AND used_at IS NULL
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_code.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  IF v_code.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  v_hash := encode(digest(_code, 'sha256'), 'hex');

  IF v_hash <> v_code.code_hash THEN
    UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE id = v_code.id;
    UPDATE public.user_subscriptions SET verification_attempts = verification_attempts + 1 WHERE user_id = v_uid;
    IF (v_sub.verification_attempts + 1) >= 5 THEN
      UPDATE public.user_subscriptions
        SET verification_blocked_until = now() + interval '15 minutes',
            verification_attempts = 0
        WHERE user_id = v_uid;
      RETURN jsonb_build_object('ok', false, 'error', 'blocked', 'retry_after', 900);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Success: only approve if payment is confirmed (defensive; webhook already gated).
  IF v_sub.approval_status NOT IN ('pending_email_verification', 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_required');
  END IF;

  UPDATE public.email_verification_codes SET used_at = now() WHERE id = v_code.id;
  UPDATE public.user_subscriptions
    SET approval_status = 'approved',
        approved_at = now(),
        approval_reason = 'email_code_verified',
        verification_attempts = 0,
        verification_blocked_until = NULL,
        updated_at = now()
    WHERE user_id = v_uid;

  -- Mark auth email as confirmed
  UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_email_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_email_code(text) TO authenticated;

-- Ensure pgcrypto's digest() is available.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- If digest() lives in extensions schema, alias:
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'digest' AND pronamespace = 'public'::regnamespace) THEN
    PERFORM 1;
  END IF;
END $$;

-- Update verify_email_code to use extensions.digest if needed (safe recreate)
CREATE OR REPLACE FUNCTION public.verify_email_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sub record;
  v_code record;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF _code IS NULL OR _code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = v_uid FOR UPDATE;
  IF v_sub.approval_status = 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF v_sub.verification_blocked_until IS NOT NULL AND v_sub.verification_blocked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked',
      'retry_after', extract(epoch FROM (v_sub.verification_blocked_until - now()))::int);
  END IF;

  SELECT * INTO v_code
    FROM public.email_verification_codes
   WHERE user_id = v_uid AND used_at IS NULL
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_code.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  IF v_code.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  v_hash := encode(extensions.digest(_code, 'sha256'), 'hex');

  IF v_hash <> v_code.code_hash THEN
    UPDATE public.email_verification_codes SET attempts = attempts + 1 WHERE id = v_code.id;
    UPDATE public.user_subscriptions SET verification_attempts = verification_attempts + 1 WHERE user_id = v_uid;
    IF (v_sub.verification_attempts + 1) >= 5 THEN
      UPDATE public.user_subscriptions
        SET verification_blocked_until = now() + interval '15 minutes',
            verification_attempts = 0
        WHERE user_id = v_uid;
      RETURN jsonb_build_object('ok', false, 'error', 'blocked', 'retry_after', 900);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_sub.approval_status NOT IN ('pending_email_verification', 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_required');
  END IF;

  UPDATE public.email_verification_codes SET used_at = now() WHERE id = v_code.id;
  UPDATE public.user_subscriptions
    SET approval_status = 'approved',
        approved_at = now(),
        approval_reason = 'email_code_verified',
        verification_attempts = 0,
        verification_blocked_until = NULL,
        updated_at = now()
    WHERE user_id = v_uid;

  UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_email_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_email_code(text) TO authenticated;
