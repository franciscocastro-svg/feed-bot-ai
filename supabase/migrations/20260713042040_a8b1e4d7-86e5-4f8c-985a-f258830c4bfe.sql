
-- Phase 1E-A.1: corrective migration for payment webhook idempotency.
-- Adds request_id fencing on complete/fail RPCs and a durable outbox for
-- external effects (email, Meta CAPI, etc.). Does NOT modify the previous
-- migration; it only adds/replaces functions and creates a new table.

-- ---------- Harden claim RPC: atomic insert with concurrency-safe fallback ----------
CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_request_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.payment_webhook_events%ROWTYPE;
  v_stale_after interval := interval '5 minutes';
  v_inserted boolean := false;
BEGIN
  IF p_provider NOT IN ('stripe') THEN
    RAISE EXCEPTION 'invalid provider';
  END IF;
  IF p_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid environment';
  END IF;

  -- Try to insert atomically. If another worker inserted the row concurrently,
  -- ON CONFLICT DO NOTHING makes this a no-op and we fall through to the
  -- SELECT ... FOR UPDATE branch below.
  INSERT INTO public.payment_webhook_events (
    provider, environment, event_id, event_type,
    status, attempt_count, request_id, event_created_at, started_at
  ) VALUES (
    p_provider, p_environment, p_event_id, p_event_type,
    'processing', 1, p_request_id, p_event_created_at, now()
  )
  ON CONFLICT (provider, environment, event_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    RETURN 'claimed';
  END IF;

  -- Row already exists — lock it and decide.
  SELECT * INTO v_existing
    FROM public.payment_webhook_events
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Extremely unlikely (deleted between insert-conflict and select-for-update).
    RAISE EXCEPTION 'claim_lost_row';
  END IF;

  IF v_existing.status = 'completed' THEN
    RETURN 'duplicate_completed';
  END IF;

  IF v_existing.status = 'processing' AND v_existing.started_at > now() - v_stale_after THEN
    RETURN 'already_processing';
  END IF;

  -- failed OR abandoned processing -> claim retry, take ownership.
  UPDATE public.payment_webhook_events
     SET status = 'processing',
         attempt_count = v_existing.attempt_count + 1,
         request_id = p_request_id,
         started_at = now(),
         completed_at = NULL,
         error_code = NULL
   WHERE id = v_existing.id;

  RETURN 'claimed';
END;
$$;

-- ---------- Fenced complete: returns boolean success ----------
DROP FUNCTION IF EXISTS public.complete_payment_webhook_event(text,text,text);

CREATE OR REPLACE FUNCTION public.complete_payment_webhook_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.payment_webhook_events
     SET status = 'completed',
         completed_at = now(),
         error_code = NULL
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id
     AND status = 'processing'
     AND request_id IS NOT DISTINCT FROM p_request_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- ---------- Fenced fail: returns boolean success ----------
DROP FUNCTION IF EXISTS public.fail_payment_webhook_event(text,text,text,text);

CREATE OR REPLACE FUNCTION public.fail_payment_webhook_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_error_code text,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
  v_code text := p_error_code;
BEGIN
  IF v_code IS NOT NULL AND v_code !~ '^[A-Za-z0-9_.-]{1,40}$' THEN
    v_code := 'unknown_error';
  END IF;

  UPDATE public.payment_webhook_events
     SET status = 'failed',
         completed_at = now(),
         error_code = COALESCE(v_code, 'unknown_error')
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id
     AND status = 'processing'
     AND request_id IS NOT DISTINCT FROM p_request_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_webhook_event(text,text,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_webhook_event(text,text,text,text,uuid) TO service_role;

-- ---------- Effects outbox: durable dedup of external side effects ----------
CREATE TABLE IF NOT EXISTS public.payment_webhook_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL,
  event_id text NOT NULL,
  effect_type text NOT NULL,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_effects_provider_chk CHECK (provider IN ('stripe')),
  CONSTRAINT payment_webhook_effects_env_chk CHECK (environment IN ('sandbox','live')),
  CONSTRAINT payment_webhook_effects_type_chk CHECK (
    effect_type ~ '^[a-z0-9_]{1,64}$'
  ),
  CONSTRAINT payment_webhook_effects_unique UNIQUE (provider, environment, event_id, effect_type)
);

REVOKE ALL ON TABLE public.payment_webhook_effects FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_webhook_effects FROM anon;
REVOKE ALL ON TABLE public.payment_webhook_effects FROM authenticated;
GRANT ALL ON TABLE public.payment_webhook_effects TO service_role;

ALTER TABLE public.payment_webhook_effects ENABLE ROW LEVEL SECURITY;
-- No policies: RLS blocks anon/authenticated entirely; service_role bypasses.

CREATE INDEX IF NOT EXISTS payment_webhook_effects_lookup_idx
  ON public.payment_webhook_effects(provider, environment, event_id);

CREATE OR REPLACE FUNCTION public.try_claim_payment_webhook_effect(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_effect_type text,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  IF p_provider NOT IN ('stripe') THEN
    RAISE EXCEPTION 'invalid provider';
  END IF;
  IF p_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid environment';
  END IF;
  IF p_effect_type IS NULL OR p_effect_type !~ '^[a-z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'invalid effect_type';
  END IF;

  INSERT INTO public.payment_webhook_effects (
    provider, environment, event_id, effect_type, request_id
  ) VALUES (
    p_provider, p_environment, p_event_id, p_effect_type, p_request_id
  )
  ON CONFLICT (provider, environment, event_id, effect_type) DO NOTHING
  RETURNING true INTO v_inserted;

  RETURN COALESCE(v_inserted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_payment_webhook_effect(text,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_claim_payment_webhook_effect(text,text,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.try_claim_payment_webhook_effect(text,text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_claim_payment_webhook_effect(text,text,text,text,uuid) TO service_role;
