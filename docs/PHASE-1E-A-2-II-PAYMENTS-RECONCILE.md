# Phase 1E-A.2/ii — Payment reconciliation

## Status

Implemented locally. Do not deploy or apply the cron migration until the
release checklist in `ops/releases/phase-1e-a-2.json` is followed.

This subphase does not change `payments-webhook`, `verify-code`, the frontend,
the worker, Stripe configuration, Meta configuration, or customer data.

## Runtime contract

`payments-reconcile` accepts only `POST` with:

- a constant-time validated `x-internal-secret` matching
  `INTERNAL_CRON_SECRET`;
- a JSON body containing exactly the intended `environment` (`sandbox` or
  `live`).

The environment is passed once to `createStripeClient`. Sandbox and live keys
are never read together. Subscription scans use 500-row pages with the stable
cursor `(created_at, id)`, explicit columns and bounded concurrency.

The reconciler compares current non-terminal local subscriptions with Stripe.
Only divergences are passed through the reviewed
`apply_stripe_subscription_event` RPC. It never writes subscription state
directly.

## Effect policy

The new `claim_payment_webhook_effects_for_reconcile` RPC is separate from the
legacy `try_claim_payment_webhook_effect`, which remains in containment mode.
Claims use `FOR UPDATE SKIP LOCKED`, a five-minute fenced lease, exponential
backoff and at most eight attempts.

| Effect | Automatic retry |
| --- | --- |
| `stripe_cancel_after_refund` | Yes. Retrieve first; already canceled is completed without a second cancel call. |
| `meta_start_trial` / `meta_purchase` | Yes, with the same `stripe_<event_id>` sent to Meta. |
| `send_verification_code` | No. Marked `skipped/manual_resend_required`; UI resend remains the only path. |
| unknown | No. Marked `failed/unsupported_effect_type`; nothing external runs. |

No raw Stripe payload, e-mail, token, header, signature or provider response is
stored or logged.

## Cron and secrets

The versioned migration creates two jobs:

- `payments-reconcile-sandbox` at `03:00 UTC`;
- `payments-reconcile-live` at `03:15 UTC`.

The migration fails before replacing jobs unless the `cron` and `net` schemas
and these Vault entries exist:

- `INTERNAL_CRON_SECRET`;
- `PAYMENTS_RECONCILE_URL_SANDBOX`;
- `PAYMENTS_RECONCILE_URL_LIVE`.

Values are resolved by `vault.decrypted_secrets` when the job runs and are not
embedded in the migration or `cron.job.command`.

## Release order

1. Confirm the function secret and all three Vault entries without printing
   their values.
2. Deploy only `payments-reconcile`.
3. Verify an unauthenticated request returns `401` without DB or Stripe access.
4. Apply `20260713234500_phase_1e_a_2_reconcile_cron.sql`.
5. Verify the two job names/schedules and service-role-only RPC grants.
6. Stop before Phase 1E-A.2/iii.

## Rollback

Unschedule both jobs by `jobname`, then remove/redeploy the Edge Function. The
new claim RPC may remain inert; removal, if required, must use a reviewed
corrective migration. Do not roll back schema with destructive commands during
an incident.
