# Phase 1E-A — Payment webhook idempotency & log privacy

## Status

**Closed and deployed on 2026-07-13.**

- Base release: `afdb67fdef4a67387261cab41c1cc027f7d5ddba`.
- Corrective release 1E-A.1: `6524fb299f3fe3406190427f24ef7596244ec4da`.
- Deployed functions: `auth-email-hook` and `payments-webhook`.
- Applied corrective migration:
  `20260713042040_a8b1e4d7-86e5-4f8c-985a-f258830c4bfe.sql`.
- Frontend was not published as part of this backend release.

Phase 1E-A.1 closes the concurrency and fail-open gaps identified in the
initial release. Mobile/source usability work is tracked separately and does
not change the payment business rules.

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

External effects also have a private deduplication receipt in
`public.payment_webhook_effects`, unique by
`(provider, environment, event_id, effect_type)`.

Access:

- RLS enabled.
- All privileges revoked from `PUBLIC`, `anon`, `authenticated`.
- Only `service_role` can read/write.
- **No Stripe payload, e-mail, name, token, signature or secret is ever stored.**
- `error_code` is constrained to `^[A-Za-z0-9_.-]{1,40}$`.

### RPCs (SECURITY DEFINER, `search_path=public`)

- `claim_payment_webhook_event(provider, environment, event_id, event_type, event_created_at, request_id)` → `text`
- `complete_payment_webhook_event(provider, environment, event_id, request_id)` → `boolean`
- `fail_payment_webhook_event(provider, environment, event_id, error_code, request_id)` → `boolean`
- `try_claim_payment_webhook_effect(provider, environment, event_id, effect_type, request_id)` → `boolean`

Execute privileges are revoked from `PUBLIC` / `anon` / `authenticated` and granted only to `service_role`.

### Claim outcomes

| Existing row               | Outcome               | Handler action                                          |
| -------------------------- | --------------------- | ------------------------------------------------------- |
| none                       | `claimed`             | run side effects → `complete`                           |
| `completed`                | `duplicate_completed` | HTTP 200, `{ received: true, duplicate: true }`, no-op |
| `processing` < 5 min       | `already_processing`  | HTTP 200, `{ received: true, in_flight: true }`, no-op |
| `processing` ≥ 5 min       | `claimed` + retry     | recover, `attempt_count += 1`                           |
| `failed`                   | `claimed` + retry     | `attempt_count += 1`                                    |

Atomicity is guaranteed by `INSERT … ON CONFLICT DO NOTHING`, followed by a
`SELECT … FOR UPDATE` for existing rows. Completion and failure are fenced by
`request_id`: a stale worker cannot finish an event after ownership moved to a
recovery attempt.

### Handler flow (payments-webhook)

1. Verify Stripe signature. On failure → **HTTP 400** without touching the DB.
2. `claim_payment_webhook_event(...)`.
3. Branch on outcome (table above).
4. A status other than the three documented outcomes fails closed, without effects.
5. Critical Supabase writes must return without `.error`.
6. External effects are reserved in `payment_webhook_effects` before execution.
7. On success → fenced `complete_...` → **HTTP 200**.
8. On real error → fenced `fail_...` with sanitized `error_code` → **HTTP 500** so Stripe retries.

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

## Post-deploy validation — completed

1. Both functions were deployed from commit `6524fb2`.
2. New fenced RPC signatures return `boolean`; claim continues returning `text` by design.
3. RLS is enabled on both receipt tables, with zero public policies.
4. Invalid Stripe signature returns 400 before ledger access or effects.
5. Unauthenticated auth-email preview returns 401 and exposes no data.
6. No real Stripe event or customer mutation was used for the smoke test.

A controlled valid-event test in Stripe Sandbox remains a release follow-up;
the production smoke test intentionally validated only non-destructive paths.

## Rollback

If a regression appears:

1. **Revert code only** — redeploy the previous `auth-email-hook` and `payments-webhook` from the last green commit; the new receipt table is inert to older handlers.
2. If the ledger itself must be removed (unlikely):
   ```sql
   DROP FUNCTION IF EXISTS public.claim_payment_webhook_event(text,text,text,text,timestamptz,uuid);
   DROP FUNCTION IF EXISTS public.try_claim_payment_webhook_effect(text,text,text,text,uuid);
   DROP TABLE IF EXISTS public.payment_webhook_effects;
   DROP FUNCTION IF EXISTS public.complete_payment_webhook_event(text,text,text,uuid);
   DROP FUNCTION IF EXISTS public.fail_payment_webhook_event(text,text,text,text,uuid);
   DROP TABLE IF EXISTS public.payment_webhook_events;
   ```
3. No frontend or worker changes are involved, so no additional rollback steps are required.

## Residual risk

Stripe does **not** guarantee event ordering. This phase deliberately does **not** reorder events; it only prevents duplicates. A future phase should compare `event.created` / subscription `updated_at` before applying an event to `user_subscriptions` to avoid stale overwrites when Stripe re-delivers out of order.

The verification-code effect is currently reserved with at-most-once
semantics. A network failure after reservation may require an explicit recovery
flow in a future phase; this is documented rather than hidden by automatic
duplicate sends.
