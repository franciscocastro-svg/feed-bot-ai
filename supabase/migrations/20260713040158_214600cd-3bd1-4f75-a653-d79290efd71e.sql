
-- Phase 1E-A: idempotency ledger for payment provider webhook events.

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 1,
  request_id uuid,
  error_code text,
  event_created_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_provider_chk CHECK (provider IN ('stripe')),
  CONSTRAINT payment_webhook_events_env_chk CHECK (environment IN ('sandbox','live')),
  CONSTRAINT payment_webhook_events_status_chk CHECK (status IN ('processing','completed','failed')),
  CONSTRAINT payment_webhook_events_error_code_chk CHECK (
    error_code IS NULL OR error_code ~ '^[A-Za-z0-9_.-]{1,40}$'
  ),
  CONSTRAINT payment_webhook_events_unique UNIQUE (provider, environment, event_id)
);

-- Lock down access: internal-only ledger.
REVOKE ALL ON TABLE public.payment_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon;
REVOKE ALL ON TABLE public.payment_webhook_events FROM authenticated;
GRANT ALL ON TABLE public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: RLS blocks them entirely.
-- service_role bypasses RLS.

CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
  ON public.payment_webhook_events(status, started_at);

-- Trigger to keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.payment_webhook_events_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_webhook_events_touch ON public.payment_webhook_events;
CREATE TRIGGER payment_webhook_events_touch
BEFORE UPDATE ON public.payment_webhook_events
FOR EACH ROW EXECUTE FUNCTION public.payment_webhook_events_touch_updated_at();

-- ---------- RPCs ----------

-- Claim an event. Atomically inserts a new receipt or transitions a
-- stale/failed one back to 'processing'. Returns a status string:
--   claimed              -> caller should run side effects
--   duplicate_completed  -> caller must skip (already done)
--   already_processing   -> caller must skip (another worker is running)
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
BEGIN
  IF p_provider NOT IN ('stripe') THEN
    RAISE EXCEPTION 'invalid provider';
  END IF;
  IF p_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid environment';
  END IF;

  SELECT * INTO v_existing
    FROM public.payment_webhook_events
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.payment_webhook_events (
      provider, environment, event_id, event_type,
      status, attempt_count, request_id, event_created_at, started_at
    ) VALUES (
      p_provider, p_environment, p_event_id, p_event_type,
      'processing', 1, p_request_id, p_event_created_at, now()
    );
    RETURN 'claimed';
  END IF;

  IF v_existing.status = 'completed' THEN
    RETURN 'duplicate_completed';
  END IF;

  IF v_existing.status = 'processing' AND v_existing.started_at > now() - v_stale_after THEN
    RETURN 'already_processing';
  END IF;

  -- failed OR abandoned processing -> retry
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

CREATE OR REPLACE FUNCTION public.complete_payment_webhook_event(
  p_provider text,
  p_environment text,
  p_event_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_webhook_events
     SET status = 'completed',
         completed_at = now(),
         error_code = NULL
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_payment_webhook_event(
  p_provider text,
  p_environment text,
  p_event_id text,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_error_code IS NOT NULL AND p_error_code !~ '^[A-Za-z0-9_.-]{1,40}$' THEN
    p_error_code := 'unknown_error';
  END IF;

  UPDATE public.payment_webhook_events
     SET status = 'failed',
         completed_at = now(),
         error_code = COALESCE(p_error_code, 'unknown_error')
   WHERE provider = p_provider
     AND environment = p_environment
     AND event_id = p_event_id;
END;
$$;

-- Restrict RPC execution to backend only.
REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_webhook_event(text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_webhook_event(text,text,text,text) TO service_role;
