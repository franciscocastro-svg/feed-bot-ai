# Phase 1E-A — Payment webhook idempotency & log privacy

## Scope

- Protect `payments-webhook` against duplicated Stripe deliveries.
- Introduce a structured logger with strict allow-list to prevent PII / secret / payload leakage.
- Attach an internal `x-request-id` to every response of `auth-email-hook` and `payments-webhook`.
- **No changes** to business rules, pricing, Meta CAPI logic, autopilot, scheduler, worker, VPS or frontend.

## Architecture

### Idempotency ledger

A private table stores one receipt per `(provider, environment, event_id)`.

```
public.payment_webhook_events
  id, provider, environment, event_id, event_type,
  status: processing | completed | failed,
  attempt_count, request_id, error_code (sanitized only),
  event_created_at, started_at, completed_at, updated_at, created_at
UNIQUE (provider, environment, event_id)
```

Access:

- RLS enabled.
- All privileges revoked from `PUBLIC`, `anon`, `authenticated`.
- Only `service_role` can read/write.
- **No Stripe payload, e-mail, name, token, signature or secret is ever stored.**
- `error_code` is constrained to `^[A-Za-z0-9_.-]{1,40}$`.

### RPCs (SECURITY DEFINER, `search_path=public`)

- `claim_payment_webhook_event(provider, environment, event_id, event_type, event_created_at, request_id)` → `text`
- `complete_payment_webhook_event(provider, environment, event_id)` → `void`
- `fail_payment_webhook_event(provider, environment, event_id, error_code)` → `void`

Execute privileges are revoked from `PUBLIC` / `anon` / `authenticated` and granted only to `service_role`.

### Claim outcomes

| Existing row               | Outcome               | Handler action                                          |
| -------------------------- | --------------------- | ------------------------------------------------------- |
| none                       | `claimed`             | run side effects → `complete`                           |
| `completed`                | `duplicate_completed` | HTTP 200, `{ received: true, duplicate: true }`, no-op |
| `processing` < 5 min       | `already_processing`  | HTTP 200, `{ received: true, in_flight: true }`, no-op |
| `processing` ≥ 5 min       | `claimed` + retry     | recover, `attempt_count += 1`                           |
| `failed`                   | `claimed` + retry     | `attempt_count += 1`                                    |

Atomicity is guaranteed by `SELECT … FOR UPDATE` inside the SECURITY DEFINER function plus the unique index.

### Handler flow (payments-webhook)

1. Verify Stripe signature. On failure → **HTTP 400** without touching the DB.
2. `claim_payment_webhook_event(...)`.
3. Branch on outcome (table above).
4. On success → `complete_...` → **HTTP 200**.
5. On real error → `fail_...` with sanitized `error_code` → **HTTP 500** so Stripe retries.

## Log privacy

`supabase/functions/_shared/observability.ts` exposes `createLogger`, `classifyError`, `formatLogLine`. Only the following fields may appear in any log line:

`function_name`, `request_id`, `event_name`, `event_id`, `event_type`, `environment`, `status`, `provider_status`, `duration_ms`, `error_code`.

Explicitly disallowed:

- Full request/response bodies.
- Full headers.
- E-mail, phone, recipient, name.
- Tokens, JWTs, cookies, signatures, secrets.
- Stripe / Supabase / Resend / Meta / Lovable API keys.
- Raw `Error.message` or provider response text.

Errors are converted to a sanitized `error_code` matching `^[A-Za-z0-9_.-]{1,40}$` plus the generic message `"Operation failed"`.

`auth-email-hook` and `payments-webhook`:

- return `x-request-id` on every response;
- expose `x-request-id` via CORS (`Access-Control-Expose-Headers`);
- no longer log recipient/e-mail, Resend response bodies or Stripe signatures.

## Allowed error codes (initial set)

`signature_verification_failed`, `claim_failed`, `handler_error`, `resend_send_failed`, `resend_not_configured`, `meta_capi_failed`, `meta_start_trial_failed`, `meta_purchase_failed`, `send_verification_code_failed`, `internal_cron_secret_missing`, `invalid_payload`, `invalid_secret`, `unknown_email_type`, `unknown_error`.

New codes must satisfy the regex above and must not embed provider text.

## Retry & recovery

- Stripe retries failed deliveries for up to 3 days; HTTP 500 lets that happen naturally.
- Abandoned `processing` receipts older than 5 minutes are automatically recovered on the next delivery via the `claim` RPC.
- `attempt_count` grows monotonically and is surfaced in logs via `duration_ms` and `status` for future dashboards.

## Post-deploy validation

1. Confirm migration `payment_webhook_events` and the three RPCs exist.
2. `GRANT`/`REVOKE` state: only `service_role` has table + execute privileges.
3. Trigger a duplicate delivery in Stripe sandbox → second delivery returns `{ duplicate: true }`.
4. Trigger a handler failure via a malformed subscription in sandbox → response 500, receipt row status `failed`, Stripe retries succeed.
5. Grep function logs for `@`, `Bearer`, `whsec_`, `sk_live_`, `sk_test_`, `stripe-signature`, `authorization`, `cookie` → **must return zero matches**.

## Rollback

If a regression appears:

1. **Revert code only** — redeploy the previous `auth-email-hook` and `payments-webhook` from the last green commit; the new receipt table is inert to older handlers.
2. If the ledger itself must be removed (unlikely):
   ```sql
   DROP FUNCTION IF EXISTS public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid);
   DROP FUNCTION IF EXISTS public.complete_payment_webhook_event(text,text,text);
   DROP FUNCTION IF EXISTS public.fail_payment_webhook_event(text,text,text,text);
   DROP TABLE IF EXISTS public.payment_webhook_events;
   ```
3. No frontend or worker changes are involved, so no additional rollback steps are required.

## Residual risk

Stripe does **not** guarantee event ordering. This phase deliberately does **not** reorder events; it only prevents duplicates. A future phase should compare `event.created` / subscription `updated_at` before applying an event to `user_subscriptions` to avoid stale overwrites when Stripe re-delivers out of order.
